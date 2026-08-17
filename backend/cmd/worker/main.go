package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
)

func main() {
	interval, err := time.ParseDuration(envOr("WORKER_POLL_INTERVAL", "5s"))
	if err != nil || interval < time.Second { log.Fatal("WORKER_POLL_INTERVAL must be at least one second") }
	ctx, cancel := context.WithCancel(context.Background()); defer cancel()
	db, err := pgx.Connect(ctx, envOr("DATABASE_URL", "postgres://hhy:unsafe-local-placeholder@postgres:5432/hhy?sslmode=disable"))
	if err != nil { log.Fatalf("worker database connection failed: %v", err) }
	defer db.Close(ctx)
	if err := db.Ping(ctx); err != nil { log.Fatalf("worker database ping failed: %v", err) }
	log.Printf("hhy worker started; outbox polling interval=%s", interval)
	ticker := time.NewTicker(interval); defer ticker.Stop()
	stop := make(chan os.Signal, 1); signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	for {
		select {
		case <-ticker.C:
			if err := publishOutbox(ctx, db); err != nil { log.Printf("outbox poll failed: %v", err) }
		case <-stop:
			log.Println("hhy worker stopped"); return
		}
	}
}

func publishOutbox(ctx context.Context, db *pgx.Conn) error {
	tx, err := db.Begin(ctx); if err != nil { return err }; defer func() { _ = tx.Rollback(ctx) }()
	rows, err := tx.Query(ctx, "SELECT id, event_type FROM outbox_events WHERE published_at IS NULL ORDER BY occurred_at FOR UPDATE SKIP LOCKED LIMIT 20")
	if err != nil { return err }; defer rows.Close()
	var ids []string
	for rows.Next() { var id, eventType string; if err := rows.Scan(&id, &eventType); err != nil { return err }; ids = append(ids, id); log.Printf("outbox event accepted: %s (%s)", id, eventType) }
	if err := rows.Err(); err != nil { return err }
	if len(ids) > 0 { if _, err := tx.Exec(ctx, "UPDATE outbox_events SET published_at = now() WHERE id = ANY($1::uuid[])", ids); err != nil { return err } }
	return tx.Commit(ctx)
}

func envOr(key, fallback string) string { if value := os.Getenv(key); value != "" { return value }; return fallback }
