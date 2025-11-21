package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"time"

	"github.com/joho/godotenv"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

const (
	ctaGetRoutesURL = "https://www.ctabustracker.com/bustime/api/v3/getroutes"
	defaultPort     = "8080"
	apiKeyEnv       = "CTA_API_KEY"
)

type ctaError struct {
	Msg string `json:"msg"`
}

type ctaRoute struct {
	Rt    string `json:"rt"`
	Rtnm  string `json:"rtnm"`
	Rtclr string `json:"rtclr"`
	Rtdd  string `json:"rtdd"`
}

type ctaBustimeResponse struct {
	Error  []ctaError `json:"error,omitempty"`
	Routes []ctaRoute `json:"routes,omitempty"`
}

type ctaRoutesResponse struct {
	BustimeResponse ctaBustimeResponse `json:"bustime-response"`
}

type route struct {
	RouteNumber string `json:"routeNumber"`
	RouteName   string `json:"routeName"`
	RouteColor  string `json:"routeColor"`
	Rtdd        string `json:"rtdd"`
}

func main() {
	e := echo.New()
	e.HideBanner = true
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())

	if err := godotenv.Load(); err != nil {
		var pathErr *fs.PathError
		if !errors.As(err, &pathErr) {
			e.Logger.Warnf("failed to load .env: %v", err)
		}
	}

	apiKey := os.Getenv(apiKeyEnv)
	client := &http.Client{Timeout: 10 * time.Second}

	e.GET("/", func(c echo.Context) error {
		return c.String(http.StatusOK, "CTA backend is running")
	})

	api := e.Group("/api")

	api.GET("/routes", func(c echo.Context) error {
		if apiKey == "" {
			return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("%s is not set", apiKeyEnv))
		}

		req, err := http.NewRequestWithContext(c.Request().Context(), http.MethodGet, ctaGetRoutesURL, nil)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("failed to create CTA request: %v", err))
		}

		query := req.URL.Query()
		query.Set("format", "json")
		query.Set("key", apiKey)
		req.URL.RawQuery = query.Encode()

		resp, err := client.Do(req)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadGateway, fmt.Sprintf("CTA API request failed: %v", err))
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
			return echo.NewHTTPError(http.StatusBadGateway, fmt.Sprintf("CTA API returned status %d: %s", resp.StatusCode, string(body)))
		}

		var routesResp ctaRoutesResponse
		if err := json.NewDecoder(resp.Body).Decode(&routesResp); err != nil {
			return echo.NewHTTPError(http.StatusBadGateway, fmt.Sprintf("failed to decode CTA API response: %v", err))
		}

		if len(routesResp.BustimeResponse.Error) > 0 {
			// Forward CTA error details to the caller for debugging.
			return c.JSON(http.StatusBadGateway, routesResp.BustimeResponse)
		}

		routes := make([]route, 0, len(routesResp.BustimeResponse.Routes))
		for _, r := range routesResp.BustimeResponse.Routes {
			routes = append(routes, route{
				RouteNumber: r.Rt,
				RouteName:   r.Rtnm,
				RouteColor:  r.Rtclr,
				Rtdd:        r.Rtdd,
			})
		}

		return c.JSON(http.StatusOK, routes)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}

	e.Logger.Fatal(e.Start(":" + port))
}
