package main

import (
	"errors"
	"io/fs"
	"log/slog"
	"net/http"
	"os"

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
	apiKey := os.Getenv(apiKeyEnv)
	client := &http.Client{Timeout: defaultHTTPTimeout}
	ctaService, err := NewCTAService(apiKey, client, logger)
	if err != nil {
		e.Logger.Fatalf("failed to create CTA service: %v", err)
	}
	handlers := NewHandlers(ctaService, logger)

	e.GET("/", handlers.Health)

	api := e.Group("/api")
	api.GET("/routes", handlers.GetRoutes)
	api.GET("/routes/stats", handlers.GetRouteStats)
	api.GET("/vehicles/locations", handlers.GetVehicleLocations)
	api.GET("/vehicles/all", handlers.GetAllVehicleLocations)

	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}

	e.Logger.Fatal(e.Start(":" + port))
}
