package main

import (
	"errors"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/joho/godotenv"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

const defaultPort = "8080"

func main() {
	e := echo.New()
	e.HideBanner = true
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{"*"},
		AllowMethods: []string{http.MethodGet, http.MethodOptions},
	}))

	if err := godotenv.Load(); err != nil {
		var pathErr *fs.PathError
		if !errors.As(err, &pathErr) {
			e.Logger.Warnf("failed to load .env: %v", err)
		}
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	apiTrackerDBPath := os.Getenv("API_TRACKER_DB_PATH")
	if apiTrackerDBPath == "" {
		apiTrackerDBPath = filepath.Join("data", "api_tracker.db")
	}
	apiTracker, err := NewAPICallTracker(apiTrackerDBPath)
	if err != nil {
		e.Logger.Warnf("API tracker database unavailable: %v", err)
	}

	apiKey := os.Getenv(apiKeyEnv)
	client := &http.Client{Timeout: defaultHTTPTimeout}
	ctaService, err := NewCTAService(apiKey, client, logger, apiTracker)
	if err != nil {
		e.Logger.Fatalf("failed to create CTA service: %v", err)
	}
	handlers := NewHandlers(ctaService, logger)

	// Initialize ridership service
	dbPath := os.Getenv("RIDERSHIP_DB_PATH")
	if dbPath == "" {
		dbPath = filepath.Join("data", "ridership.db")
	}
	ridershipRepo, err := NewDatabaseGatway(dbPath)
	if err != nil {
		e.Logger.Warnf("ridership database unavailable: %v", err)
	}
	var ridershipHandlers *RidershipHandlers
	if ridershipRepo != nil {
		ridershipService := NewRidershipService(ridershipRepo, logger)
		ridershipHandlers = NewRidershipHandlers(ridershipService, logger)
	}

	e.GET("/", handlers.Health)

	// Config endpoint for frontend runtime configuration
	jawgToken := os.Getenv("JAWG_ACCESS_TOKEN")
	configHandlers := NewConfigHandlers(jawgToken)

	api := e.Group("/api")
	api.GET("/config", configHandlers.GetConfig)
	api.GET("/routes", handlers.GetRoutes)
	api.GET("/routes/stats", handlers.GetRouteStats)
	api.GET("/vehicles/locations", handlers.GetVehicleLocations)
	api.GET("/vehicles/all", handlers.GetAllVehicleLocations)

	// Ridership endpoints
	if ridershipHandlers != nil {
		api.GET("/ridership/years", ridershipHandlers.GetAvailableYears)
		api.GET("/ridership/yearly", ridershipHandlers.GetYearlyTotals)
		api.GET("/ridership/monthly", ridershipHandlers.GetMonthlyTotals)
		api.GET("/ridership/daily", ridershipHandlers.GetDailyTotals)
		api.GET("/ridership/top-routes", ridershipHandlers.GetTopRoutes)
		api.GET("/ridership/route/:route/yearly", ridershipHandlers.GetRouteYearly)
		api.GET("/ridership/route/:route/daily", ridershipHandlers.GetRouteDaily)
	}

	if apiTracker != nil {
		trackerHandlers := NewAPITrackerHandlers(apiTracker, logger)
		api.GET("/tracking/counts", trackerHandlers.GetAPICallCounts)
	}

	// Serve static frontend files if the directory exists
	staticDir := os.Getenv("STATIC_DIR")
	if staticDir == "" {
		staticDir = "static"
	}
	if _, err := os.Stat(staticDir); err == nil {
		e.Use(middleware.StaticWithConfig(middleware.StaticConfig{
			Root:   staticDir,
			Index:  "index.html",
			HTML5:  true,
			Browse: false,
			Skipper: func(c echo.Context) bool {
				// Skip static file serving for API routes
				return strings.HasPrefix(c.Path(), "/api")
			},
		}))
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}

	e.Logger.Fatal(e.Start(":" + port))
}
