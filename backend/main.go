package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

const (
	ctaGetRoutesURL   = "https://www.ctabustracker.com/bustime/api/v3/getroutes"
	ctaGetVehiclesURL = "https://www.ctabustracker.com/bustime/api/v3/getvehicles"
	defaultPort       = "8080"
	apiKeyEnv         = "CTA_API_KEY"
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

type flexibleString string

func (f *flexibleString) UnmarshalJSON(b []byte) error {
	// Accept JSON strings or numbers, storing their string form.
	if len(b) == 0 {
		return nil
	}
	var s string
	if err := json.Unmarshal(b, &s); err == nil {
		*f = flexibleString(s)
		return nil
	}
	var n json.Number
	if err := json.Unmarshal(b, &n); err == nil {
		*f = flexibleString(n.String())
		return nil
	}
	return fmt.Errorf("flexibleString: unsupported value %s", string(b))
}

type ctaVehicle struct {
	Vid          flexibleString `json:"vid"`
	Tmstmp       flexibleString `json:"tmstmp"`
	Lat          flexibleString `json:"lat"`
	Lon          flexibleString `json:"lon"`
	Hdg          flexibleString `json:"hdg"`
	Pid          flexibleString `json:"pid"`
	Pdist        flexibleString `json:"pdist"`
	Rt           flexibleString `json:"rt"`
	Des          flexibleString `json:"des"`
	Dly          bool           `json:"dly,omitempty"`
	Tablockid    flexibleString `json:"tablockid"`
	Tatripid     flexibleString `json:"tatripid"`
	Origtatripno flexibleString `json:"origtatripno"`
	Zone         flexibleString `json:"zone"`
}

type ctaVehiclesResponse struct {
	BustimeResponse struct {
		Error    []ctaError   `json:"error,omitempty"`
		Vehicles []ctaVehicle `json:"vehicle,omitempty"`
	} `json:"bustime-response"`
}

type route struct {
	RouteNumber string `json:"routeNumber"`
	RouteName   string `json:"routeName"`
	RouteColor  string `json:"routeColor"`
	Rtdd        string `json:"rtdd"`
}

type vehicle struct {
	VehicleID       string `json:"vehicleId"`
	Timestamp       string `json:"timestamp"`
	Latitude        string `json:"latitude"`
	Longitude       string `json:"longitude"`
	Heading         string `json:"heading"`
	PatternID       string `json:"patternId"`
	PatternDistance string `json:"patternDistance"`
	Route           string `json:"route"`
	Destination     string `json:"destination"`
	Delayed         bool   `json:"delayed"`
	TablockID       string `json:"tablockId"`
	TripID          string `json:"tripId"`
	OriginTripNo    string `json:"originTripNo"`
	Zone            string `json:"zone"`
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

	api.GET("/vehicles/locations", func(c echo.Context) error {
		if apiKey == "" {
			return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("%s is not set", apiKeyEnv))
		}

		rtParam := strings.TrimSpace(c.QueryParam("rt"))
		if rtParam == "" {
			return echo.NewHTTPError(http.StatusBadRequest, "query parameter 'rt' is required (comma-separated route designators)")
		}

		var routes []string
		for _, r := range strings.Split(rtParam, ",") {
			trimmed := strings.TrimSpace(r)
			if trimmed == "" {
				continue
			}
			routes = append(routes, trimmed)
		}

		if len(routes) == 0 {
			return echo.NewHTTPError(http.StatusBadRequest, "query parameter 'rt' is required (comma-separated route designators)")
		}
		if len(routes) > 10 {
			return echo.NewHTTPError(http.StatusBadRequest, "a maximum of 10 routes can be requested at once")
		}

		req, err := http.NewRequestWithContext(c.Request().Context(), http.MethodGet, ctaGetVehiclesURL, nil)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("failed to create CTA request: %v", err))
		}

		query := req.URL.Query()
		query.Set("format", "json")
		query.Set("key", apiKey)
		query.Set("rt", strings.Join(routes, ","))
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

		var vehiclesResp ctaVehiclesResponse
		if err := json.NewDecoder(resp.Body).Decode(&vehiclesResp); err != nil {
			return echo.NewHTTPError(http.StatusBadGateway, fmt.Sprintf("failed to decode CTA API response: %v", err))
		}

		if len(vehiclesResp.BustimeResponse.Error) > 0 {
			return c.JSON(http.StatusBadGateway, vehiclesResp.BustimeResponse)
		}

		vehicles := make([]vehicle, 0, len(vehiclesResp.BustimeResponse.Vehicles))
		for _, v := range vehiclesResp.BustimeResponse.Vehicles {
			vehicles = append(vehicles, vehicle{
				VehicleID:       string(v.Vid),
				Timestamp:       string(v.Tmstmp),
				Latitude:        string(v.Lat),
				Longitude:       string(v.Lon),
				Heading:         string(v.Hdg),
				PatternID:       string(v.Pid),
				PatternDistance: string(v.Pdist),
				Route:           string(v.Rt),
				Destination:     string(v.Des),
				Delayed:         v.Dly,
				TablockID:       string(v.Tablockid),
				TripID:          string(v.Tatripid),
				OriginTripNo:    string(v.Origtatripno),
				Zone:            string(v.Zone),
			})
		}

		return c.JSON(http.StatusOK, vehicles)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}

	e.Logger.Fatal(e.Start(":" + port))
}
