package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func testServer() *server {
	return &server{
		secret: []byte("01234567890123456789012345678901"),
		store: &captchaStore{
			challenges: map[string]*captchaChallenge{},
			tickets: map[string]*captchaTicket{},
			sessions: map[string]time.Time{},
			rates: map[string]*captchaRate{},
		},
	}
}

func TestCaptchaCreateVerifyIsOneTime(t *testing.T) {
	s := testServer()
	createBody, _ := json.Marshal(challengeRequest{Purpose: "admin_login"})
	create := httptest.NewRequest(http.MethodPost, "/api/v1/security/captcha/challenges", bytes.NewReader(createBody))
	created := httptest.NewRecorder()
	s.createChallenge(created, create)
	if created.Code != http.StatusOK { t.Fatalf("create status=%d body=%s", created.Code, created.Body.String()) }
	var payload struct {
		AnonymousSessionToken string `json:"anonymous_session_token"`
		ChallengeID string `json:"challenge_id"`
	}
	if err := json.Unmarshal(created.Body.Bytes(), &payload); err != nil { t.Fatal(err) }
	c := s.store.challenges[payload.ChallengeID]
	if c == nil { t.Fatal("challenge not stored") }
	answer := "ABCDE"
	c.AnswerHash = s.answerHash(c.ID, answer)
	verifyBody, _ := json.Marshal(verifyRequest{ChallengeID: c.ID, Answer: answer, Purpose: c.Purpose, AnonymousSessionToken: payload.AnonymousSessionToken})
	verify := httptest.NewRequest(http.MethodPost, "/api/v1/security/captcha/verify", bytes.NewReader(verifyBody))
	verified := httptest.NewRecorder()
	s.verifyChallenge(verified, verify)
	if verified.Code != http.StatusOK { t.Fatalf("verify status=%d body=%s", verified.Code, verified.Body.String()) }
	var ticket struct { CaptchaTicket string `json:"captcha_ticket"` }
	if err := json.Unmarshal(verified.Body.Bytes(), &ticket); err != nil || ticket.CaptchaTicket == "" { t.Fatal("missing ticket") }
	if _, ok := s.store.challenges[c.ID]; ok { t.Fatal("challenge was not consumed") }
	if !s.consumeTicket(ticket.CaptchaTicket, payload.AnonymousSessionToken, "admin_login", "") { t.Fatal("ticket must be consumable once") }
	if s.consumeTicket(ticket.CaptchaTicket, payload.AnonymousSessionToken, "admin_login", "") { t.Fatal("ticket was reused") }
}

func TestCaptchaRejectsWrongAnswerAndExpiresAfterAttempts(t *testing.T) {
	s := testServer(); c := &captchaChallenge{ID: "c1", Session: "s1", Purpose: "login", Expires: nowPlus(60)}; c.AnswerHash = s.answerHash(c.ID, "ABCDE"); s.store.challenges[c.ID] = c; s.store.sessions[c.Session] = nowPlus(60)
	for i := 0; i < 3; i++ {
		body, _ := json.Marshal(verifyRequest{ChallengeID: c.ID, Answer: "WRONG", Purpose: c.Purpose, AnonymousSessionToken: c.Session})
		r := httptest.NewRecorder(); s.verifyChallenge(r, httptest.NewRequest(http.MethodPost, "/verify", bytes.NewReader(body)))
		want := http.StatusUnprocessableEntity; if i == 2 { want = http.StatusTooManyRequests }; if r.Code != want { t.Fatalf("attempt %d status=%d want=%d", i+1, r.Code, want) }
	}
}

func TestCaptchaRejectsUnissuedSession(t *testing.T) {
	s := testServer()
	body, _ := json.Marshal(verifyRequest{ChallengeID: "unknown", Answer: "ABCDE", Purpose: "admin_login", AnonymousSessionToken: "forged"})
	recorder := httptest.NewRecorder()
	s.verifyChallenge(recorder, httptest.NewRequest(http.MethodPost, "/verify", bytes.NewReader(body)))
	if recorder.Code != http.StatusForbidden { t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String()) }
}

func nowPlus(seconds int64) (result time.Time) { return time.Now().Add(time.Duration(seconds) * time.Second) }
