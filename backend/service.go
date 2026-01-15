package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	apiKeyEnv          = "CTA_API_KEY"
	ctaGetRoutesURL    = "https://www.ctabustracker.com/bustime/api/v3/getroutes"
	ctaGetVehiclesURL  = "https://www.ctabustracker.com/bustime/api/v3/getvehicles"
	defaultHTTPTimeout = 10 * time.Second
)

type apiError struct {
	status  int
	message string
	payload interface{}
}

func (e *apiError) Error() string {
	if e.message != "" {
		return e.message
	}
	return http.StatusText(e.status)
}

func newAPIError(status int, message string, payload interface{}) *apiError {
	return &apiError{
		status:  status,
		message: message,
		payload: payload,
	}
}

type CTAService struct {
	apiKey  string
	client  *http.Client
	logger  *slog.Logger
	tracker *APICallTracker
}

func NewCTAService(apiKey string, client *http.Client, logger *slog.Logger, tracker *APICallTracker) (*CTAService, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("%s is not set", apiKeyEnv)
	}
	if client == nil {
		client = &http.Client{Timeout: defaultHTTPTimeout}
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &CTAService{
		apiKey:  apiKey,
		client:  client,
		logger:  logger,
		tracker: tracker,
	}, nil
}

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

// The CTA BusTime API returns JSON with a wrapper object
// You need a struct to match the outer wrapper, and another struct for the inner content
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

type routeStats struct {
	RouteNumber    string `json:"routeNumber"`
	RouteName      string `json:"routeName"`
	NorthEastbound int    `json:"northEastbound"`
	SouthWestbound int    `json:"southWestbound"`
	TotalActive    int    `json:"totalActive"`
}

func isNoDataError(ctaErrors []ctaError) bool {
	for _, err := range ctaErrors {
		msg := strings.ToLower(err.Msg)
		if strings.Contains(msg, "no data found") || strings.Contains(msg, "no service scheduled") {
			return true
		}
	}
	return false
}

func (s *CTAService) GetRoutes(ctx context.Context) ([]route, error) {
	s.logger.Info("fetching routes from CTA API")

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, ctaGetRoutesURL, nil)
	if err != nil {
		s.logger.Error("failed to create request", "error", err)
		return nil, err
	}

	query := req.URL.Query()
	query.Set("format", "json")
	query.Set("key", s.apiKey)
	req.URL.RawQuery = query.Encode()

	resp, err := s.client.Do(req)
	if err != nil {
		s.logger.Error("CTA API request failed", "error", err)
		return nil, newAPIError(http.StatusBadGateway, fmt.Sprintf("CTA API request failed: %v", err), nil)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		s.logger.Error("CTA API returned non-OK status", "status", resp.StatusCode, "body", string(body))
		return nil, newAPIError(http.StatusBadGateway, fmt.Sprintf("CTA API returned status %d: %s", resp.StatusCode, string(body)), nil)
	}

	var routesResp ctaRoutesResponse
	if err := json.NewDecoder(resp.Body).Decode(&routesResp); err != nil {
		s.logger.Error("failed to decode CTA API response", "error", err)
		return nil, newAPIError(http.StatusBadGateway, fmt.Sprintf("failed to decode CTA API response: %v", err), nil)
	}

	if len(routesResp.BustimeResponse.Error) > 0 {
		s.logger.Error("CTA API returned error", "errors", routesResp.BustimeResponse.Error)
		return nil, newAPIError(http.StatusBadGateway, "CTA API returned error", routesResp.BustimeResponse)
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

	s.logger.Info("successfully fetched routes", "count", len(routes))
	if s.tracker != nil {
		if err := s.tracker.TrackCall(ctaGetRoutesURL); err != nil {
			s.logger.Error("failed to track API call", "error", err)
		}
	}
	return routes, nil
}

func (s *CTAService) GetAllVehicles(ctx context.Context) ([]vehicle, error) {
	s.logger.Info("fetching all vehicles")

	routes, err := s.GetRoutes(ctx)
	if err != nil {
		return nil, err
	}

	routeIDs := make([]string, len(routes))
	for i, r := range routes {
		routeIDs[i] = r.RouteNumber
	}

	allVehicles := make([]vehicle, 0)
	batchSize := 10 // a max of 10 identifiers can be specified, so we have to do it in batches
	for i := 0; i < len(routeIDs); i += batchSize {
		end := i + batchSize
		if end > len(routeIDs) {
			end = len(routeIDs) // catch that we are out of bounds and safely get the last batch
		}
		batch := routeIDs[i:end]
		vehicles, err := s.GetVehicles(ctx, batch)
		if err != nil {
			return nil, err
		}
		allVehicles = append(allVehicles, vehicles...)
	}

	s.logger.Info("successfully fetched all vehicles", "count", len(allVehicles))
	return allVehicles, nil
}

func (s *CTAService) GetVehicles(ctx context.Context, routes []string) ([]vehicle, error) {
	s.logger.Info("fetching vehicles for routes", "routes", routes)

	if len(routes) == 0 {
		s.logger.Error("no routes specified")
		return nil, newAPIError(http.StatusBadRequest, "at least one route designator is required", nil)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, ctaGetVehiclesURL, nil)
	if err != nil {
		s.logger.Error("failed to create request", "error", err)
		return nil, err
	}

	query := req.URL.Query()
	query.Set("format", "json")
	query.Set("key", s.apiKey)
	query.Set("rt", strings.Join(routes, ","))
	req.URL.RawQuery = query.Encode()

	resp, err := s.client.Do(req)
	if err != nil {
		s.logger.Error("CTA API request failed", "error", err)
		return nil, newAPIError(http.StatusBadGateway, fmt.Sprintf("CTA API request failed: %v", err), nil)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		s.logger.Error("CTA API returned non-OK status", "status", resp.StatusCode, "body", string(body))
		return nil, newAPIError(http.StatusBadGateway, fmt.Sprintf("CTA API returned status %d: %s", resp.StatusCode, string(body)), nil)
	}

	var vehiclesResp ctaVehiclesResponse
	if err := json.NewDecoder(resp.Body).Decode(&vehiclesResp); err != nil {
		s.logger.Error("failed to decode CTA API response", "error", err)
		return nil, newAPIError(http.StatusBadGateway, fmt.Sprintf("failed to decode CTA API response: %v", err), nil)
	}

	// The CTA API can return both vehicles AND errors in the same response
	// (e.g., vehicles for routes with active buses, and "no data found" errors for routes without).
	// Only treat it as an error if there are no vehicles AND the errors are not just "no data found".
	if len(vehiclesResp.BustimeResponse.Vehicles) == 0 && len(vehiclesResp.BustimeResponse.Error) > 0 {
		if isNoDataError(vehiclesResp.BustimeResponse.Error) {
			s.logger.Info("no vehicles found for routes", "routes", routes)
			return []vehicle{}, nil
		}
		s.logger.Error("CTA API returned error", "errors", vehiclesResp.BustimeResponse.Error)
		return nil, newAPIError(http.StatusBadGateway, "CTA API returned error", vehiclesResp.BustimeResponse)
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

	s.logger.Info("successfully fetched vehicles", "routes", routes, "count", len(vehicles))
	if s.tracker != nil {
		if err := s.tracker.TrackCall(ctaGetVehiclesURL); err != nil {
			s.logger.Error("failed to track API call", "error", err)
		}
	}
	return vehicles, nil
}

// isNorthOrEastbound determines direction based on heading (0-359 degrees).
// North: 316-360 or 0-45 (heading toward 0)
// East: 46-135 (heading toward 90)
// South: 136-225 (heading toward 180)
// West: 226-315 (heading toward 270)
// Returns true for North/East, false for South/West.
func isNorthOrEastbound(heading string) bool {
	hdg, err := strconv.Atoi(heading)
	if err != nil {
		return false // default to south/west if parsing fails
	}
	// Normalize to 0-359
	hdg = hdg % 360
	if hdg < 0 {
		hdg += 360
	}
	// North: 316-360 or 0-45, East: 46-135
	return hdg >= 316 || hdg <= 135
}

func (s *CTAService) GetRouteStats(ctx context.Context) ([]routeStats, error) {
	s.logger.Info("calculating route stats")

	routes, err := s.GetRoutes(ctx)
	if err != nil {
		return nil, err
	}

	vehicles, err := s.GetAllVehicles(ctx)
	if err != nil {
		return nil, err
	}

	// Build a map of route number -> stats
	statsMap := make(map[string]*routeStats)
	for _, r := range routes {
		statsMap[r.RouteNumber] = &routeStats{
			RouteNumber: r.RouteNumber,
			RouteName:   r.RouteName,
		}
	}

	// Count vehicles by direction
	for _, v := range vehicles {
		stat, ok := statsMap[v.Route]
		if !ok {
			continue
		}
		if isNorthOrEastbound(v.Heading) {
			stat.NorthEastbound++
		} else {
			stat.SouthWestbound++
		}
		stat.TotalActive++
	}

	// Convert map to slice and sort by route number
	result := make([]routeStats, 0, len(statsMap))
	for _, stat := range statsMap {
		result = append(result, *stat)
	}
	sort.Slice(result, func(i, j int) bool {
		// Numeric sort for route numbers
		numI, errI := strconv.Atoi(result[i].RouteNumber)
		numJ, errJ := strconv.Atoi(result[j].RouteNumber)
		if errI == nil && errJ == nil {
			return numI < numJ
		}
		return result[i].RouteNumber < result[j].RouteNumber
	})

	s.logger.Info("successfully calculated route stats", "routes", len(result), "totalVehicles", len(vehicles))
	return result, nil
}

// RidershipService provides business logic for ridership data
type RidershipService struct {
	repo   *DatabaseGatway
	logger *slog.Logger
}

func NewRidershipService(repo *DatabaseGatway, logger *slog.Logger) *RidershipService {
	if logger == nil {
		logger = slog.Default()
	}
	return &RidershipService{repo: repo, logger: logger}
}

func (s *RidershipService) GetYearlyTotals() ([]YearlyTotal, error) {
	s.logger.Info("fetching yearly totals")
	return s.repo.GetYearlyTotals()
}

func (s *RidershipService) GetMonthlyTotals(year int) ([]MonthlyTotal, error) {
	s.logger.Info("fetching monthly totals", "year", year)
	return s.repo.GetMonthlyTotals(year)
}

func (s *RidershipService) GetTopRoutes(year int, limit int) ([]TopRoute, error) {
	s.logger.Info("fetching top routes", "year", year, "limit", limit)
	return s.repo.GetTopRoutes(year, limit)
}

func (s *RidershipService) GetRouteYearlyTotals(route string) ([]RouteYearlyTotal, error) {
	s.logger.Info("fetching route yearly totals", "route", route)
	return s.repo.GetRouteYearlyTotals(route)
}

func (s *RidershipService) GetRouteDaily(route string, year *int) ([]DailyRidership, error) {
	s.logger.Info("fetching route daily data", "route", route, "year", year)
	return s.repo.GetRouteDaily(route, year)
}

func (s *RidershipService) GetAvailableYears() ([]int, error) {
	s.logger.Info("fetching available years")
	return s.repo.GetAvailableYears()
}

func (s *RidershipService) GetDailyTotals(year *int, month *int) ([]DailyTotal, error) {
	s.logger.Info("fetching daily totals", "year", year, "month", month)
	return s.repo.GetDailyTotals(year, month)
}
