package main

import (
	"database/sql"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type APICall struct {
	ID        int64     `json:"id"`
	Endpoint  string    `json:"endpoint"`
	CreatedAt time.Time `json:"createdAt"`
}

type APICallTracker struct {
	db *sql.DB
}

func NewAPICallTracker(dbPath string) (*APICallTracker, error) {
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		return nil, err
	}

	tracker := &APICallTracker{db: db}
	if err := tracker.initSchema(); err != nil {
		return nil, err
	}

	return tracker, nil
}

func (t *APICallTracker) initSchema() error {
	_, err := t.db.Exec(`
		CREATE TABLE IF NOT EXISTS api_calls (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			endpoint TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE INDEX IF NOT EXISTS idx_api_calls_endpoint ON api_calls(endpoint);
		CREATE INDEX IF NOT EXISTS idx_api_calls_created_at ON api_calls(created_at);
	`)
	return err
}

func (t *APICallTracker) Close() error {
	return t.db.Close()
}

func (t *APICallTracker) TrackCall(endpoint string) error {
	_, err := t.db.Exec(`INSERT INTO api_calls (endpoint) VALUES (?)`, endpoint)
	return err
}

// GetTotalCount returns the total number of API calls
func (t *APICallTracker) GetTotalCount() (int64, error) {
	var count int64
	err := t.db.QueryRow(`SELECT COUNT(*) FROM api_calls`).Scan(&count)
	return count, err
}

// GetCountByEndpoint returns call counts grouped by endpoint
func (t *APICallTracker) GetCountByEndpoint() (map[string]int64, error) {
	rows, err := t.db.Query(`
		SELECT endpoint, COUNT(*) as call_count
		FROM api_calls
		GROUP BY endpoint
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make(map[string]int64)
	for rows.Next() {
		var endpoint string
		var count int64
		if err := rows.Scan(&endpoint, &count); err != nil {
			return nil, err
		}
		results[endpoint] = count
	}
	return results, rows.Err()
}

// GetCountToday returns the number of API calls made today
func (t *APICallTracker) GetCountToday() (int64, error) {
	var count int64
	err := t.db.QueryRow(`
		SELECT COUNT(*) FROM api_calls
		WHERE date(created_at) = date('now')
	`).Scan(&count)
	return count, err
}
