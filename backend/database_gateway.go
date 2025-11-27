package main

import (
	"database/sql"

	_ "github.com/mattn/go-sqlite3"
)

// DatabaseGatway handles database queries for ridership data
type DatabaseGatway struct {
	db *sql.DB
}

func NewDatabaseGatway(dbPath string) (*DatabaseGatway, error) {
	db, err := sql.Open("sqlite3", dbPath+"?mode=ro")
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		return nil, err
	}
	return &DatabaseGatway{db: db}, nil
}

func (r *DatabaseGatway) Close() error {
	return r.db.Close()
}

// YearlyTotal represents total ridership for a year
type YearlyTotal struct {
	Year  int   `json:"year"`
	Rides int64 `json:"rides"`
}

// MonthlyTotal represents total ridership for a month
type MonthlyTotal struct {
	Year  int   `json:"year"`
	Month int   `json:"month"`
	Rides int64 `json:"rides"`
}

// RouteYearlyTotal represents total ridership for a route in a year
type RouteYearlyTotal struct {
	Route string `json:"route"`
	Year  int    `json:"year"`
	Rides int64  `json:"rides"`
}

// TopRoute represents a route with its total ridership
type TopRoute struct {
	Route string `json:"route"`
	Rides int64  `json:"rides"`
}

// DailyRidership represents ridership for a single day
type DailyRidership struct {
	Route   string `json:"route"`
	Date    string `json:"date"`
	Daytype string `json:"daytype"`
	Rides   int    `json:"rides"`
}

// GetYearlyTotals returns total ridership aggregated by year
func (r *DatabaseGatway) GetYearlyTotals() ([]YearlyTotal, error) {
	rows, err := r.db.Query(`
		SELECT year, SUM(rides) as total_rides
		FROM ridership
		GROUP BY year
		ORDER BY year
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []YearlyTotal
	for rows.Next() {
		var yt YearlyTotal
		if err := rows.Scan(&yt.Year, &yt.Rides); err != nil {
			return nil, err
		}
		results = append(results, yt)
	}
	return results, rows.Err()
}

// GetMonthlyTotals returns total ridership aggregated by month for a given year
func (r *DatabaseGatway) GetMonthlyTotals(year int) ([]MonthlyTotal, error) {
	rows, err := r.db.Query(`
		SELECT year, month, SUM(rides) as total_rides
		FROM ridership
		WHERE year = ?
		GROUP BY year, month
		ORDER BY month
	`, year)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []MonthlyTotal
	for rows.Next() {
		var mt MonthlyTotal
		if err := rows.Scan(&mt.Year, &mt.Month, &mt.Rides); err != nil {
			return nil, err
		}
		results = append(results, mt)
	}
	return results, rows.Err()
}

// GetTopRoutes returns the top N routes by ridership for a given year
func (r *DatabaseGatway) GetTopRoutes(year int, limit int) ([]TopRoute, error) {
	rows, err := r.db.Query(`
		SELECT route, SUM(rides) as total_rides
		FROM ridership
		WHERE year = ?
		GROUP BY route
		ORDER BY total_rides DESC
		LIMIT ?
	`, year, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []TopRoute
	for rows.Next() {
		var tr TopRoute
		if err := rows.Scan(&tr.Route, &tr.Rides); err != nil {
			return nil, err
		}
		results = append(results, tr)
	}
	return results, rows.Err()
}

// GetRouteYearlyTotals returns yearly totals for a specific route
func (r *DatabaseGatway) GetRouteYearlyTotals(route string) ([]RouteYearlyTotal, error) {
	rows, err := r.db.Query(`
		SELECT route, year, SUM(rides) as total_rides
		FROM ridership
		WHERE route = ?
		GROUP BY route, year
		ORDER BY year
	`, route)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []RouteYearlyTotal
	for rows.Next() {
		var ryt RouteYearlyTotal
		if err := rows.Scan(&ryt.Route, &ryt.Year, &ryt.Rides); err != nil {
			return nil, err
		}
		results = append(results, ryt)
	}
	return results, rows.Err()
}

// GetRouteDaily returns daily ridership for a route, optionally filtered by year
func (r *DatabaseGatway) GetRouteDaily(route string, year *int) ([]DailyRidership, error) {
	var rows *sql.Rows
	var err error

	if year != nil {
		rows, err = r.db.Query(`
			SELECT route, date, daytype, rides
			FROM ridership
			WHERE route = ? AND year = ?
			ORDER BY date
		`, route, *year)
	} else {
		rows, err = r.db.Query(`
			SELECT route, date, daytype, rides
			FROM ridership
			WHERE route = ?
			ORDER BY date
		`, route)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []DailyRidership
	for rows.Next() {
		var dr DailyRidership
		if err := rows.Scan(&dr.Route, &dr.Date, &dr.Daytype, &dr.Rides); err != nil {
			return nil, err
		}
		results = append(results, dr)
	}
	return results, rows.Err()
}

// GetAvailableYears returns the list of years with data
func (r *DatabaseGatway) GetAvailableYears() ([]int, error) {
	rows, err := r.db.Query(`SELECT DISTINCT year FROM ridership ORDER BY year`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var years []int
	for rows.Next() {
		var year int
		if err := rows.Scan(&year); err != nil {
			return nil, err
		}
		years = append(years, year)
	}
	return years, rows.Err()
}

// DailyTotal represents total ridership for a day
type DailyTotal struct {
	Date  string `json:"date"`
	Rides int64  `json:"rides"`
}

// GetDailyTotals returns total ridership aggregated by day, optionally filtered by year and month
func (r *DatabaseGatway) GetDailyTotals(year *int, month *int) ([]DailyTotal, error) {
	var rows *sql.Rows
	var err error

	if year != nil && month != nil {
		rows, err = r.db.Query(`
			SELECT date, SUM(rides) as total_rides
			FROM ridership
			WHERE year = ? AND month = ?
			GROUP BY date
			ORDER BY date
		`, *year, *month)
	} else if year != nil {
		rows, err = r.db.Query(`
			SELECT date, SUM(rides) as total_rides
			FROM ridership
			WHERE year = ?
			GROUP BY date
			ORDER BY date
		`, *year)
	} else {
		rows, err = r.db.Query(`
			SELECT date, SUM(rides) as total_rides
			FROM ridership
			GROUP BY date
			ORDER BY date
		`)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []DailyTotal
	for rows.Next() {
		var dt DailyTotal
		if err := rows.Scan(&dt.Date, &dt.Rides); err != nil {
			return nil, err
		}
		results = append(results, dt)
	}
	return results, rows.Err()
}
