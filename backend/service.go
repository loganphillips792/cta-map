package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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
	apiKey string
	client *http.Client
}

func NewCTAService(apiKey string, client *http.Client) *CTAService {
	if client == nil {
		client = &http.Client{Timeout: defaultHTTPTimeout}
	}
	return &CTAService{
		apiKey: apiKey,
		client: client,
	}
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
	if s.apiKey == "" {
		return nil, newAPIError(http.StatusInternalServerError, fmt.Sprintf("%s is not set", apiKeyEnv), nil)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, ctaGetRoutesURL, nil)
	if err != nil {
		return nil, err
	}

	query := req.URL.Query()
	query.Set("format", "json")
	query.Set("key", s.apiKey)
	req.URL.RawQuery = query.Encode()

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, newAPIError(http.StatusBadGateway, fmt.Sprintf("CTA API request failed: %v", err), nil)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, newAPIError(http.StatusBadGateway, fmt.Sprintf("CTA API returned status %d: %s", resp.StatusCode, string(body)), nil)
	}

	var routesResp ctaRoutesResponse
	if err := json.NewDecoder(resp.Body).Decode(&routesResp); err != nil {
		return nil, newAPIError(http.StatusBadGateway, fmt.Sprintf("failed to decode CTA API response: %v", err), nil)
	}

	if len(routesResp.BustimeResponse.Error) > 0 {
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

	return routes, nil
}

func (s *CTAService) GetAllVehicles(ctx context.Context) ([]vehicle, error) {
	routes, err := s.GetRoutes(ctx)
	if err != nil {
		return nil, err
	}

	routeIDs := make([]string, len(routes))
	for i, r := range routes {
		routeIDs[i] = r.RouteNumber
	}

	allVehicles := make([]vehicle, 0)
	batchSize := 10
	for i := 0; i < len(routeIDs); i += batchSize {
		end := i + batchSize
		if end > len(routeIDs) {
			end = len(routeIDs)
		}
		batch := routeIDs[i:end]
		vehicles, err := s.GetVehicles(ctx, batch)
		if err != nil {
			return nil, err
		}
		allVehicles = append(allVehicles, vehicles...)
	}

	return allVehicles, nil
}

func (s *CTAService) GetVehicles(ctx context.Context, routes []string) ([]vehicle, error) {
	if s.apiKey == "" {
		return nil, newAPIError(http.StatusInternalServerError, fmt.Sprintf("%s is not set", apiKeyEnv), nil)
	}
	if len(routes) == 0 {
		return nil, newAPIError(http.StatusBadRequest, "at least one route designator is required", nil)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, ctaGetVehiclesURL, nil)
	if err != nil {
		return nil, err
	}

	query := req.URL.Query()
	query.Set("format", "json")
	query.Set("key", s.apiKey)
	query.Set("rt", strings.Join(routes, ","))
	req.URL.RawQuery = query.Encode()

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, newAPIError(http.StatusBadGateway, fmt.Sprintf("CTA API request failed: %v", err), nil)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, newAPIError(http.StatusBadGateway, fmt.Sprintf("CTA API returned status %d: %s", resp.StatusCode, string(body)), nil)
	}

	var vehiclesResp ctaVehiclesResponse
	if err := json.NewDecoder(resp.Body).Decode(&vehiclesResp); err != nil {
		return nil, newAPIError(http.StatusBadGateway, fmt.Sprintf("failed to decode CTA API response: %v", err), nil)
	}

	// The CTA API can return both vehicles AND errors in the same response
	// (e.g., vehicles for routes with active buses, and "no data found" errors for routes without).
	// Only treat it as an error if there are no vehicles AND the errors are not just "no data found".
	if len(vehiclesResp.BustimeResponse.Vehicles) == 0 && len(vehiclesResp.BustimeResponse.Error) > 0 {
		if isNoDataError(vehiclesResp.BustimeResponse.Error) {
			return []vehicle{}, nil
		}
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

	return vehicles, nil
}
