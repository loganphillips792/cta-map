package main

import (
	"database/sql"
	"encoding/csv"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

func main() {
	if len(os.Args) < 2 {
		log.Fatal("Usage: go run import_ridership_data.go <csv-file>")
	}

	csvPath := os.Args[1]
	dbPath := filepath.Join(filepath.Dir(csvPath), "ridership.db")

	// Remove existing database to start fresh
	os.Remove(dbPath)

	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()

	// Create table
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS ridership (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			route TEXT NOT NULL,
			date DATE NOT NULL,
			year INTEGER NOT NULL,
			month INTEGER NOT NULL,
			daytype TEXT NOT NULL,
			rides INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_ridership_route ON ridership(route);
		CREATE INDEX IF NOT EXISTS idx_ridership_year ON ridership(year);
		CREATE INDEX IF NOT EXISTS idx_ridership_date ON ridership(date);
	`)
	if err != nil {
		log.Fatalf("Failed to create table: %v", err)
	}

	// Open CSV file
	file, err := os.Open(csvPath)
	if err != nil {
		log.Fatalf("Failed to open CSV: %v", err)
	}
	defer file.Close()

	reader := csv.NewReader(file)

	// Skip header
	_, err = reader.Read()
	if err != nil {
		log.Fatalf("Failed to read CSV header: %v", err)
	}

	// Begin transaction for faster inserts
	tx, err := db.Begin()
	if err != nil {
		log.Fatalf("Failed to begin transaction: %v", err)
	}

	stmt, err := tx.Prepare("INSERT INTO ridership (route, date, year, month, daytype, rides) VALUES (?, ?, ?, ?, ?, ?)")
	if err != nil {
		log.Fatalf("Failed to prepare statement: %v", err)
	}
	defer stmt.Close()

	rowCount := 0
	startTime := time.Now()

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			log.Printf("Warning: skipping row due to error: %v", err)
			continue
		}

		if len(record) < 4 {
			log.Printf("Warning: skipping row with insufficient columns: %v", record)
			continue
		}

		route := record[0]
		dateStr := record[1]
		daytype := record[2]
		ridesStr := record[3]

		// Parse date (MM/DD/YYYY format)
		parsedDate, err := time.Parse("01/02/2006", dateStr)
		if err != nil {
			log.Printf("Warning: skipping row with invalid date %s: %v", dateStr, err)
			continue
		}

		// Remove commas from rides and parse as integer
		ridesStr = strings.ReplaceAll(ridesStr, ",", "")
		rides, err := strconv.Atoi(ridesStr)
		if err != nil {
			log.Printf("Warning: skipping row with invalid rides %s: %v", ridesStr, err)
			continue
		}

		_, err = stmt.Exec(route, parsedDate.Format("2006-01-02"), parsedDate.Year(), int(parsedDate.Month()), daytype, rides)
		if err != nil {
			log.Printf("Warning: failed to insert row: %v", err)
			continue
		}

		rowCount++
		if rowCount%100000 == 0 {
			fmt.Printf("Imported %d rows...\n", rowCount)
		}
	}

	err = tx.Commit()
	if err != nil {
		log.Fatalf("Failed to commit transaction: %v", err)
	}

	elapsed := time.Since(startTime)
	fmt.Printf("Successfully imported %d rows in %v\n", rowCount, elapsed)
	fmt.Printf("Database created at: %s\n", dbPath)
}
