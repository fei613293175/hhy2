package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"log"
	"math"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

const captchaCharset = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
const (
	captchaSessionTTL = 30 * time.Minute
	captchaChallengeTTL = 120 * time.Second
	captchaTicketTTL = 180 * time.Second
	captchaRateWindow = time.Minute
	captchaMaxChallengesPerWindow = 20
	captchaMaxAttempts = 3
)

type captchaChallenge struct {
	ID string `json:"id"`
	Session string `json:"session"`
	Purpose string `json:"purpose"`
	TargetHash string `json:"target_hash"`
	AnswerHash []byte `json:"answer_hash"`
	Expires time.Time `json:"expires"`
	Attempts int `json:"attempts"`
}

type captchaTicket struct {
	ID string `json:"id"`
	Session string `json:"session"`
	Purpose string `json:"purpose"`
	TargetHash string `json:"target_hash"`
	Expires time.Time `json:"expires"`
	Consumed bool `json:"consumed"`
}

type captchaStore struct {
	sync.Mutex
	challenges map[string]*captchaChallenge
	tickets map[string]*captchaTicket
	sessions map[string]time.Time
	rates map[string]*captchaRate
}

type captchaRate struct { Count int; Expires time.Time }

type captchaProblem struct {
	status int
	code string
}

func (p *captchaProblem) Error() string { return p.code }

type server struct {
	store *captchaStore
	secret []byte
	databaseHost, databasePort, redisHost, redisPort string
	db *pgxpool.Pool
	redis *redis.Client
}

func main() {
	secret := []byte(os.Getenv("CAPTCHA_HMAC_SECRET"))
	if len(secret) < 32 {
		log.Fatal("CAPTCHA_HMAC_SECRET must contain at least 32 bytes")
	}
	redisHost, redisPort := envOr("REDIS_HOST", "redis"), envOr("REDIS_PORT", "6379")
	databaseURL := envOr("DATABASE_URL", "postgres://hhy:unsafe-local-placeholder@postgres:5432/hhy?sslmode=disable")
	db, err := pgxpool.New(context.Background(), databaseURL)
	if err != nil { log.Fatalf("database pool initialization failed: %v", err) }
	defer db.Close()
	dbContext, dbCancel := context.WithTimeout(context.Background(), 2*time.Second)
	if err := db.Ping(dbContext); err != nil { dbCancel(); log.Fatalf("database is required for api state: %v", err) }
	dbCancel()
	redisClient := redis.NewClient(&redis.Options{Addr: net.JoinHostPort(redisHost, redisPort)})
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	if err := redisClient.Ping(ctx).Err(); err != nil {
		cancel()
		log.Fatalf("redis is required for captcha state: %v", err)
	}
	cancel()
	s := &server{
		store: &captchaStore{challenges: map[string]*captchaChallenge{}, tickets: map[string]*captchaTicket{}, sessions: map[string]time.Time{}, rates: map[string]*captchaRate{}},
		secret: secret,
		databaseHost: envOr("DATABASE_HOST", "postgres"), databasePort: envOr("DATABASE_PORT", "5432"),
		redisHost: redisHost, redisPort: redisPort, db: db, redis: redisClient,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/health/live", s.live)
	mux.HandleFunc("/health/ready", s.ready)
	mux.HandleFunc("/api/v1/p00/config", s.config)
	mux.HandleFunc("/api/v1/p00/preflight", s.preflight)
	mux.HandleFunc("/api/v1/security/captcha/challenges", s.createChallenge)
	mux.HandleFunc("/api/v1/security/captcha/verify", s.verifyChallenge)
	addr := envOr("HTTP_ADDR", ":8080")
	log.Printf("hhy api listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, requestID(mux)))
}

func envOr(key, fallback string) string { if value := strings.TrimSpace(os.Getenv(key)); value != "" { return value }; return fallback }

func requestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", envOr("CORS_ORIGIN", "https://hhy-admin.orbexa.cc"))
		w.Header().Set("Vary", "Origin")
		if r.Method == http.MethodOptions { w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS"); w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Captcha-Ticket"); w.WriteHeader(http.StatusNoContent); return }
		id := randomToken(12)
		w.Header().Set("X-Request-ID", id)
		next.ServeHTTP(w, r)
	})
}

func (s *server) live(w http.ResponseWriter, _ *http.Request) { jsonResponse(w, http.StatusOK, map[string]interface{}{"status": "live", "service": "hhy-api"}) }

func (s *server) ready(w http.ResponseWriter, _ *http.Request) {
	checks := map[string]string{"api": "ok", "postgres": s.databaseReady(), "redis": s.redisReady()}
	status := http.StatusOK
	for name, value := range checks { if name != "api" && value != "ok" { status = http.StatusServiceUnavailable } }
	jsonResponse(w, status, map[string]interface{}{"status": map[bool]string{true: "ready", false: "not_ready"}[status == http.StatusOK], "checks": checks})
}


func (s *server) databaseReady() string {
	if s.db == nil { return "unavailable" }
	ctx, cancel := context.WithTimeout(context.Background(), 800*time.Millisecond); defer cancel()
	if err := s.db.Ping(ctx); err != nil { return "unavailable" }; return "ok"
}

func (s *server) redisReady() string {
	if s.redis == nil { return "unavailable" }
	ctx, cancel := context.WithTimeout(context.Background(), 800*time.Millisecond); defer cancel()
	if err := s.redis.Ping(ctx).Err(); err != nil { return "unavailable" }; return "ok"
}

func (s *server) config(w http.ResponseWriter, _ *http.Request) {
	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"project": "hhy", "release": "P00", "design_version": "4.0.0-D02",
		"domains": map[string]string{"api": envOr("PUBLIC_API_HOST", "hhy-api.orbexa.cc"), "admin": envOr("PUBLIC_ADMIN_HOST", "hhy-admin.orbexa.cc"), "h5": envOr("PUBLIC_H5_HOST", "hhy-h5.orbexa.cc")},
		"storage": map[string]string{"provider": "server-verified-object-storage-pending", "public_base_url": envOr("STORAGE_PUBLIC_BASE_URL", "https://oss.orbexa.cc"), "bucket": envOr("STORAGE_BUCKET", "fuylink"), "project_prefix": envOr("STORAGE_PROJECT_PREFIX", "hhy/prod/")},
		"secrets_exposed": false,
	})
}

func (s *server) preflight(w http.ResponseWriter, _ *http.Request) {
	checks := map[string]string{
		"storage": integrationState("STORAGE_S3_ENDPOINT", "STORAGE_ACCESS_KEY_ID", "STORAGE_SECRET_ACCESS_KEY"),
		"smtp": integrationState("SMTP_HOST", "SMTP_PORT", "SMTP_USERNAME", "SMTP_PASSWORD"),
		"identity": integrationState("IDENTITY_PROVIDER_URL", "IDENTITY_PROVIDER_APPCODE"),
		"fuylink": integrationState("FUYUN_BASE_URL", "FUYUN_PID", "FUYUN_KEY"),
		"xapay": integrationState("XAPAY_GATEWAY_URL", "XAPAY_PID", "XAPAY_KEY"),
		"payout": integrationState("ALIPAY_PAYOUT_APP_ID", "ALIPAY_PAYOUT_PRIVATE_KEY", "ALIPAY_PAYOUT_CERTIFICATE_PATH"),
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{"release": "P00", "integrations": checks, "values_exposed": false})
}

func integrationState(keys ...string) string {
	for _, key := range keys { if strings.TrimSpace(os.Getenv(key)) == "" { return "not_configured" } }
	return "configured"
}

type challengeRequest struct { Purpose string `json:"purpose"`; AnonymousSessionToken string `json:"anonymous_session_token"`; Target string `json:"target"` }
type verifyRequest struct {
	ChallengeID string `json:"challenge_id"`
	Answer string `json:"answer"`
	Purpose string `json:"purpose"`
	AnonymousSessionToken string `json:"anonymous_session_token"`
	Target string `json:"target"`
}

func (s *server) createChallenge(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost { http.Error(w, "method not allowed", http.StatusMethodNotAllowed); return }
	var req challengeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Purpose) == "" { jsonError(w, http.StatusBadRequest, "invalid_request"); return }
	if problem := s.limitChallengeCreation(r.Context(), req.Purpose, requestIP(r), req.Target); problem != nil { jsonError(w, problem.status, problem.code); return }
	session, err := s.issueSession(r.Context(), req.AnonymousSessionToken)
	if err != nil { log.Printf("captcha session issue failed: %v", err); jsonError(w, http.StatusServiceUnavailable, "captcha_unavailable"); return }
	id := randomToken(24); answer := randomAnswer(5)
	img, err := captchaPNG(answer); if err != nil { jsonError(w, http.StatusInternalServerError, "captcha_generation_failed"); return }
	c := &captchaChallenge{ID: id, Session: session, Purpose: req.Purpose, TargetHash: s.targetFingerprint(req.Target), AnswerHash: s.answerHash(id, answer), Expires: time.Now().Add(captchaChallengeTTL)}
	if err := s.saveChallenge(r.Context(), c); err != nil { log.Printf("captcha challenge save failed: %v", err); jsonError(w, http.StatusServiceUnavailable, "captcha_unavailable"); return }
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate"); w.Header().Set("Pragma", "no-cache")
	jsonResponse(w, http.StatusOK, map[string]interface{}{"anonymous_session_token": session, "challenge_id": id, "image_base64": "data:image/png;base64,"+base64.StdEncoding.EncodeToString(img), "expires_in": int(captchaChallengeTTL.Seconds()), "refresh_after": 2})
}

func (s *server) verifyChallenge(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost { http.Error(w, "method not allowed", http.StatusMethodNotAllowed); return }
	var req verifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ChallengeID == "" || req.Purpose == "" || req.AnonymousSessionToken == "" { jsonError(w, http.StatusBadRequest, "invalid_request"); return }
	ticket, problem, err := s.verifyCaptcha(r.Context(), req)
	if err != nil { log.Printf("captcha verification failed: %v", err); jsonError(w, http.StatusServiceUnavailable, "captcha_unavailable"); return }
	if problem != nil { jsonError(w, problem.status, problem.code); return }
	jsonResponse(w, http.StatusOK, map[string]interface{}{"captcha_ticket": ticket, "expires_in": int(captchaTicketTTL.Seconds())})
}

// consumeTicket is the server-side guard every later protected endpoint must use.
// P00 has no account action yet, so it is verified by tests rather than exposed as
// a generic public endpoint that could weaken the future login boundary.
func (s *server) consumeTicket(ticketID, session, purpose, target string) bool {
	if s.redis == nil {
		s.store.Lock()
		defer s.store.Unlock()
		ticket, ok := s.store.tickets[ticketID]
		if !ok || ticket.Consumed || time.Now().After(ticket.Expires) || ticket.Session != session || ticket.Purpose != purpose || ticket.TargetHash != s.targetFingerprint(target) { return false }
		ticket.Consumed = true
		return true
	}
	ctx := context.Background()
	key := ticketRedisKey(ticketID)
	for attempt := 0; attempt < 3; attempt++ {
		consumed := false
		err := s.redis.Watch(ctx, func(tx *redis.Tx) error {
			raw, err := tx.Get(ctx, key).Bytes()
			if err == redis.Nil { return nil }
			if err != nil { return err }
			var ticket captchaTicket
			if err := json.Unmarshal(raw, &ticket); err != nil { return err }
			if ticket.Consumed || time.Now().After(ticket.Expires) || ticket.Session != session || ticket.Purpose != purpose || ticket.TargetHash != s.targetFingerprint(target) { return nil }
			_, err = tx.TxPipelined(ctx, func(pipe redis.Pipeliner) error { pipe.Del(ctx, key); return nil })
			if err == nil { consumed = true }
			return err
		}, key)
		if err == redis.TxFailedErr { continue }
		return err == nil && consumed
	}
	return false
}

func (s *server) issueSession(ctx context.Context, candidate string) (string, error) {
	if candidate != "" && s.sessionExists(ctx, candidate) { return candidate, nil }
	session := randomToken(24)
	if s.redis == nil {
		s.store.Lock(); s.store.sessions[session] = time.Now().Add(captchaSessionTTL); s.store.gcLocked(); s.store.Unlock()
		return session, nil
	}
	return session, s.redis.Set(ctx, sessionRedisKey(session), "1", captchaSessionTTL).Err()
}

func (s *server) sessionExists(ctx context.Context, session string) bool {
	if s.redis == nil {
		s.store.Lock(); defer s.store.Unlock(); expires, ok := s.store.sessions[session]; return ok && time.Now().Before(expires)
	}
	exists, err := s.redis.Exists(ctx, sessionRedisKey(session)).Result()
	return err == nil && exists == 1
}

func (s *server) limitChallengeCreation(ctx context.Context, purpose, ip, target string) *captchaProblem {
	key := "create:" + s.keyedHash(purpose+"|"+ip+"|"+s.targetFingerprint(target))
	if s.redis == nil {
		s.store.Lock(); defer s.store.Unlock()
		rate := s.store.rates[key]
		if rate == nil || time.Now().After(rate.Expires) { rate = &captchaRate{Expires: time.Now().Add(captchaRateWindow)}; s.store.rates[key] = rate }
		rate.Count++
		if rate.Count > captchaMaxChallengesPerWindow { return &captchaProblem{status: http.StatusTooManyRequests, code: "captcha_rate_limited"} }
		return nil
	}
	redisKey := "hhy:captcha:rate:" + key
	count, err := s.redis.Incr(ctx, redisKey).Result()
	if err != nil { return &captchaProblem{status: http.StatusServiceUnavailable, code: "captcha_unavailable"} }
	if count == 1 { if err := s.redis.Expire(ctx, redisKey, captchaRateWindow).Err(); err != nil { return &captchaProblem{status: http.StatusServiceUnavailable, code: "captcha_unavailable"} } }
	if count > captchaMaxChallengesPerWindow { return &captchaProblem{status: http.StatusTooManyRequests, code: "captcha_rate_limited"} }
	return nil
}

func (s *server) saveChallenge(ctx context.Context, challenge *captchaChallenge) error {
	if s.redis == nil {
		s.store.Lock()
		for id, existing := range s.store.challenges { if existing.Session == challenge.Session && existing.Purpose == challenge.Purpose { delete(s.store.challenges, id) } }
		s.store.challenges[challenge.ID] = challenge
		s.store.gcLocked()
		s.store.Unlock()
		return nil
	}
	raw, err := json.Marshal(challenge); if err != nil { return err }
	currentKey := challengeCurrentRedisKey(challenge.Session, challenge.Purpose)
	return s.redis.Watch(ctx, func(tx *redis.Tx) error {
		priorID, err := tx.Get(ctx, currentKey).Result()
		if err != nil && err != redis.Nil { return err }
		_, err = tx.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
			if priorID != "" { pipe.Del(ctx, challengeRedisKey(priorID)) }
			pipe.Set(ctx, challengeRedisKey(challenge.ID), raw, time.Until(challenge.Expires))
			pipe.Set(ctx, currentKey, challenge.ID, time.Until(challenge.Expires))
			return nil
		})
		return err
	}, currentKey)
}

func (s *server) verifyCaptcha(ctx context.Context, req verifyRequest) (string, *captchaProblem, error) {
	if !s.sessionExists(ctx, req.AnonymousSessionToken) { return "", &captchaProblem{status: http.StatusForbidden, code: "captcha_binding_mismatch"}, nil }
	if s.redis == nil { return s.verifyCaptchaInMemory(req) }
	key := challengeRedisKey(req.ChallengeID)
	for attempt := 0; attempt < 3; attempt++ {
		var ticket string
		var problem *captchaProblem
		err := s.redis.Watch(ctx, func(tx *redis.Tx) error {
			raw, err := tx.Get(ctx, key).Bytes()
			if err == redis.Nil { problem = &captchaProblem{status: http.StatusGone, code: "captcha_expired"}; return nil }
			if err != nil { return err }
			var challenge captchaChallenge
			if err := json.Unmarshal(raw, &challenge); err != nil { return err }
			currentKey := challengeCurrentRedisKey(challenge.Session, challenge.Purpose)
			if time.Now().After(challenge.Expires) { _, err = tx.TxPipelined(ctx, func(pipe redis.Pipeliner) error { pipe.Del(ctx, key); pipe.Del(ctx, currentKey); return nil }); problem = &captchaProblem{status: http.StatusGone, code: "captcha_expired"}; return err }
			if challenge.Purpose != req.Purpose || challenge.Session != req.AnonymousSessionToken || challenge.TargetHash != s.targetFingerprint(req.Target) { problem = &captchaProblem{status: http.StatusForbidden, code: "captcha_binding_mismatch"}; return nil }
			challenge.Attempts++
			if !hmac.Equal(challenge.AnswerHash, s.answerHash(challenge.ID, strings.ToUpper(strings.TrimSpace(req.Answer)))) {
				_, err = tx.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
					if challenge.Attempts >= captchaMaxAttempts { pipe.Del(ctx, key); pipe.Del(ctx, currentKey); problem = &captchaProblem{status: http.StatusTooManyRequests, code: "captcha_rate_limited"}; return nil }
					updated, marshalErr := json.Marshal(challenge); if marshalErr != nil { return marshalErr }; pipe.Set(ctx, key, updated, time.Until(challenge.Expires)); problem = &captchaProblem{status: http.StatusUnprocessableEntity, code: "captcha_wrong"}; return nil
				})
				return err
			}
			ticket = randomToken(24)
			issued := captchaTicket{ID: ticket, Session: challenge.Session, Purpose: challenge.Purpose, TargetHash: challenge.TargetHash, Expires: time.Now().Add(captchaTicketTTL)}
			encoded, err := json.Marshal(issued); if err != nil { return err }
			_, err = tx.TxPipelined(ctx, func(pipe redis.Pipeliner) error { pipe.Set(ctx, ticketRedisKey(ticket), encoded, captchaTicketTTL); pipe.Del(ctx, key); pipe.Del(ctx, currentKey); return nil })
			return err
		}, key)
		if err == redis.TxFailedErr { continue }
		return ticket, problem, err
	}
	return "", nil, fmt.Errorf("captcha verification contention limit exceeded")
}

func (s *server) verifyCaptchaInMemory(req verifyRequest) (string, *captchaProblem, error) {
	s.store.Lock(); defer s.store.Unlock()
	challenge, ok := s.store.challenges[req.ChallengeID]
	if !ok || time.Now().After(challenge.Expires) { return "", &captchaProblem{status: http.StatusGone, code: "captcha_expired"}, nil }
	if challenge.Purpose != req.Purpose || challenge.Session != req.AnonymousSessionToken || challenge.TargetHash != s.targetFingerprint(req.Target) { return "", &captchaProblem{status: http.StatusForbidden, code: "captcha_binding_mismatch"}, nil }
	challenge.Attempts++
	if !hmac.Equal(challenge.AnswerHash, s.answerHash(challenge.ID, strings.ToUpper(strings.TrimSpace(req.Answer)))) {
		if challenge.Attempts >= captchaMaxAttempts { delete(s.store.challenges, challenge.ID); return "", &captchaProblem{status: http.StatusTooManyRequests, code: "captcha_rate_limited"}, nil }
		return "", &captchaProblem{status: http.StatusUnprocessableEntity, code: "captcha_wrong"}, nil
	}
	ticket := randomToken(24); s.store.tickets[ticket] = &captchaTicket{ID: ticket, Session: challenge.Session, Purpose: challenge.Purpose, TargetHash: challenge.TargetHash, Expires: time.Now().Add(captchaTicketTTL)}; delete(s.store.challenges, challenge.ID)
	return ticket, nil, nil
}

func (s *server) answerHash(id, answer string) []byte { return []byte(s.keyedHash(id + ":" + strings.ToUpper(answer))) }
func (s *server) targetFingerprint(target string) string { if target == "" { return "" }; return s.keyedHash("target:" + strings.ToLower(strings.TrimSpace(target))) }
func (s *server) keyedHash(value string) string { mac := hmac.New(sha256.New, s.secret); mac.Write([]byte(value)); return base64.RawURLEncoding.EncodeToString(mac.Sum(nil)) }
func (s *captchaStore) gcLocked() { now := time.Now(); for id, c := range s.challenges { if now.After(c.Expires) { delete(s.challenges, id) } }; for id, t := range s.tickets { if t.Consumed || now.After(t.Expires) { delete(s.tickets, id) } }; for id, expires := range s.sessions { if now.After(expires) { delete(s.sessions, id) } }; for key, rate := range s.rates { if now.After(rate.Expires) { delete(s.rates, key) } } }
func challengeRedisKey(id string) string { return "hhy:captcha:challenge:" + id }
func ticketRedisKey(id string) string { return "hhy:captcha:ticket:" + id }
func sessionRedisKey(id string) string { return "hhy:captcha:session:" + id }
func challengeCurrentRedisKey(session, purpose string) string { return "hhy:captcha:current:" + session + ":" + purpose }
func requestIP(r *http.Request) string { if forwarded := strings.TrimSpace(r.Header.Get("X-Real-IP")); forwarded != "" { return forwarded }; host, _, err := net.SplitHostPort(r.RemoteAddr); if err == nil { return host }; return r.RemoteAddr }

func randomToken(bytes int) string { b := make([]byte, bytes); if _, err := rand.Read(b); err != nil { panic(err) }; return base64.RawURLEncoding.EncodeToString(b) }
func randomAnswer(length int) string { b := make([]byte, length); if _, err := rand.Read(b); err != nil { panic(err) }; out := make([]byte, length); for i := range b { out[i] = captchaCharset[int(b[i])%len(captchaCharset)] }; return string(out) }

var glyphs = map[byte][7]string{
	'2': {"11110", "00001", "00001", "01110", "10000", "10000", "11111"}, '3': {"11110", "00001", "00001", "01110", "00001", "00001", "11110"}, '4': {"10010", "10010", "10010", "11111", "00010", "00010", "00010"}, '5': {"11111", "10000", "10000", "11110", "00001", "00001", "11110"}, '6': {"01110", "10000", "10000", "11110", "10001", "10001", "01110"}, '7': {"11111", "00001", "00010", "00100", "01000", "01000", "01000"}, '8': {"01110", "10001", "10001", "01110", "10001", "10001", "01110"}, '9': {"01110", "10001", "10001", "01111", "00001", "00001", "01110"}, 'A': {"01110", "10001", "10001", "11111", "10001", "10001", "10001"}, 'B': {"11110", "10001", "10001", "11110", "10001", "10001", "11110"}, 'C': {"01111", "10000", "10000", "10000", "10000", "10000", "01111"}, 'D': {"11110", "10001", "10001", "10001", "10001", "10001", "11110"}, 'E': {"11111", "10000", "10000", "11110", "10000", "10000", "11111"}, 'F': {"11111", "10000", "10000", "11110", "10000", "10000", "10000"}, 'G': {"01111", "10000", "10000", "10111", "10001", "10001", "01111"}, 'H': {"10001", "10001", "10001", "11111", "10001", "10001", "10001"}, 'J': {"00111", "00010", "00010", "00010", "10010", "10010", "01100"}, 'K': {"10001", "10010", "10100", "11000", "10100", "10010", "10001"}, 'M': {"10001", "11011", "10101", "10101", "10001", "10001", "10001"}, 'N': {"10001", "11001", "10101", "10011", "10001", "10001", "10001"}, 'P': {"11110", "10001", "10001", "11110", "10000", "10000", "10000"}, 'Q': {"01110", "10001", "10001", "10001", "10101", "10010", "01101"}, 'R': {"11110", "10001", "10001", "11110", "10100", "10010", "10001"}, 'T': {"11111", "00100", "00100", "00100", "00100", "00100", "00100"}, 'U': {"10001", "10001", "10001", "10001", "10001", "10001", "01110"}, 'V': {"10001", "10001", "10001", "10001", "10001", "01010", "00100"}, 'W': {"10001", "10001", "10001", "10101", "10101", "11011", "10001"}, 'X': {"10001", "10001", "01010", "00100", "01010", "10001", "10001"}, 'Y': {"10001", "10001", "01010", "00100", "00100", "00100", "00100"}, 'Z': {"11111", "00001", "00010", "00100", "01000", "10000", "11111"},
}

func captchaPNG(answer string) ([]byte, error) {
	const width, height, scale = 160, 56, 4
	img := image.NewRGBA(image.Rect(0, 0, width, height)); for y := 0; y < height; y++ { for x := 0; x < width; x++ { img.Set(x, y, color.RGBA{245, 248, 253, 255}) } }
	for i := 0; i < 4; i++ { x0 := randomInt(width); y0 := randomInt(height); x1 := randomInt(width); y1 := randomInt(height); drawLine(img, x0, y0, x1, y1, color.RGBA{180, 197, 222, 255}) }
	for i := 0; i < 60; i++ { img.Set(randomInt(width), randomInt(height), color.RGBA{120, 144, 184, 255}) }
	start := 14; for idx := 0; idx < len(answer); idx++ { glyph, ok := glyphs[answer[idx]]; if !ok { continue }; x := start + idx*29; y := 15; ink := color.RGBA{31 + uint8(idx*17), 71, 145, 255}; for row, line := range glyph { for col, bit := range line { if bit == '1' { for sy := 0; sy < scale; sy++ { for sx := 0; sx < scale; sx++ { px, py := x+col*scale+sx, y+row*scale+sy; if px < width && py < height { img.Set(px, py, ink) } } } } } } }
	var out []byte; buf := &sliceWriter{data: &out}; if err := png.Encode(buf, img); err != nil { return nil, err }; return out, nil
}
func randomInt(max int) int { b := make([]byte, 2); if _, err := rand.Read(b); err != nil { return 0 }; return int(binary.BigEndian.Uint16(b)) % max }
func drawLine(img *image.RGBA, x0,y0,x1,y1 int, c color.Color) { dx, dy := math.Abs(float64(x1-x0)), math.Abs(float64(y1-y0)); n := int(math.Max(dx,dy)); if n == 0 { img.Set(x0,y0,c); return }; for i:=0;i<=n;i++ { x:=x0+(x1-x0)*i/n; y:=y0+(y1-y0)*i/n; img.Set(x,y,c) } }
type sliceWriter struct { data *[]byte }; func (w *sliceWriter) Write(p []byte) (int,error) { *w.data=append(*w.data,p...); return len(p),nil }

func jsonResponse(w http.ResponseWriter, status int, value interface{}) { w.Header().Set("Content-Type", "application/json; charset=utf-8"); w.WriteHeader(status); _ = json.NewEncoder(w).Encode(value) }
func jsonError(w http.ResponseWriter, status int, code string) { jsonResponse(w, status, map[string]string{"error": code}) }
