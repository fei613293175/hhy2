package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
)

var migrationName = regexp.MustCompile(`^(\d+)_.+\.sql$`)

func main() {
	ctx := context.Background()
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" { log.Fatal("DATABASE_URL is required") }
	db, err := pgx.Connect(ctx, databaseURL)
	if err != nil { log.Fatalf("migration database connection failed: %v", err) }
	defer db.Close(ctx)
	if _, err := db.Exec(ctx, "CREATE TABLE IF NOT EXISTS schema_migrations (version BIGINT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"); err != nil { log.Fatal(err) }
	if _, err := db.Exec(ctx, "SELECT pg_advisory_lock(682441002)"); err != nil { log.Fatal(err) }
	defer func() { _, _ = db.Exec(ctx, "SELECT pg_advisory_unlock(682441002)") }()

	files, err := filepath.Glob("/migrations/*.sql")
	if err != nil { log.Fatal(err) }
	sort.Strings(files)
	for _, path := range files {
		match := migrationName.FindStringSubmatch(filepath.Base(path))
		if match == nil { log.Fatalf("invalid migration filename: %s", path) }
		version, _ := strconv.ParseInt(match[1], 10, 64)
		var applied bool
		if err := db.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = $1)", version).Scan(&applied); err != nil { log.Fatal(err) }
		if applied { continue }
		sql, err := os.ReadFile(path); if err != nil { log.Fatal(err) }
		if strings.TrimSpace(string(sql)) == "" { log.Fatalf("empty migration: %s", path) }
		tx, err := db.Begin(ctx); if err != nil { log.Fatal(err) }
		if _, err = tx.Exec(ctx, string(sql)); err == nil { _, err = tx.Exec(ctx, "INSERT INTO schema_migrations(version) VALUES ($1)", version) }
		if err == nil { err = tx.Commit(ctx) } else { _ = tx.Rollback(ctx) }
		if err != nil { log.Fatalf("migration %d failed: %v", version, err) }
		log.Printf("applied migration %d (%s)", version, filepath.Base(path))
	}
	fmt.Println("database migrations are current")
}
