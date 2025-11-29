package main

import (
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"
)

const maxRouteParams = 10

type Handlers struct {
	ctaService *CTAService
	logger     *slog.Logger
}

func NewHandlers(ctaService *CTAService, logger *slog.Logger) *Handlers {
	if logger == nil {
		logger = slog.Default()
	}
	return &Handlers{ctaService: ctaService, logger: logger}
}

func (h *Handlers) Health(c echo.Context) error {
	return c.String(http.StatusOK, "CTA backend is running")
}

func (h *Handlers) GetRoutes(c echo.Context) error {
	h.logger.Info("request received", "method", c.Request().Method, "path", c.Path())

	routes, err := h.ctaService.GetRoutes(c.Request().Context())
	if err != nil {
		return writeError(c, err)
	}

	return c.JSON(http.StatusOK, routes)
}

func (h *Handlers) GetAllVehicleLocations(c echo.Context) error {
	h.logger.Info("request received", "method", c.Request().Method, "path", c.Path())

	vehicles, err := h.ctaService.GetAllVehicles(c.Request().Context())
	if err != nil {
		return writeError(c, err)
	}

	return c.JSON(http.StatusOK, vehicles)
}

func (h *Handlers) GetRouteStats(c echo.Context) error {
	h.logger.Info("request received", "method", c.Request().Method, "path", c.Path())

	stats, err := h.ctaService.GetRouteStats(c.Request().Context())
	if err != nil {
		return writeError(c, err)
	}

	return c.JSON(http.StatusOK, stats)
}

func (h *Handlers) GetVehicleLocations(c echo.Context) error {
	routeParam := strings.TrimSpace(c.QueryParam("rt"))

	h.logger.Info("request received", "method", c.Request().Method, "path", c.Path(), "routes", routeParam)

	if routeParam == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "query parameter 'rt' is required (comma-separated route designators)")
	}

	routeIDs := make([]string, 0)
	for _, r := range strings.Split(routeParam, ",") {
		trimmed := strings.TrimSpace(r)
		if trimmed == "" {
			continue
		}
		routeIDs = append(routeIDs, trimmed)
	}

	if len(routeIDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "query parameter 'rt' is required (comma-separated route designators)")
	}
	if len(routeIDs) > maxRouteParams {
		return echo.NewHTTPError(http.StatusBadRequest, "a maximum of 10 routes can be requested at once")
	}

	vehicles, err := h.ctaService.GetVehicles(c.Request().Context(), routeIDs)
	if err != nil {
		return writeError(c, err)
	}

	return c.JSON(http.StatusOK, vehicles)
}

func writeError(c echo.Context, err error) error {
	if apiErr, ok := err.(*apiError); ok {
		if apiErr.payload != nil {
			return c.JSON(apiErr.status, apiErr.payload)
		}
		return echo.NewHTTPError(apiErr.status, apiErr.message)
	}

	return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
}

// RidershipHandlers handles HTTP requests for ridership data
type RidershipHandlers struct {
	service *RidershipService
	logger  *slog.Logger
}

func NewRidershipHandlers(service *RidershipService, logger *slog.Logger) *RidershipHandlers {
	if logger == nil {
		logger = slog.Default()
	}
	return &RidershipHandlers{service: service, logger: logger}
}

// GetYearlyTotals handles GET /api/ridership/yearly
func (h *RidershipHandlers) GetYearlyTotals(c echo.Context) error {
	h.logger.Info("request received", "method", c.Request().Method, "path", c.Path())

	totals, err := h.service.GetYearlyTotals()
	if err != nil {
		h.logger.Error("failed to get yearly totals", "error", err)
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, totals)
}

// GetMonthlyTotals handles GET /api/ridership/monthly?year=2023
func (h *RidershipHandlers) GetMonthlyTotals(c echo.Context) error {
	h.logger.Info("request received", "method", c.Request().Method, "path", c.Path())

	yearStr := c.QueryParam("year")
	if yearStr == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "year parameter is required")
	}

	year, err := strconv.Atoi(yearStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid year parameter")
	}

	totals, err := h.service.GetMonthlyTotals(year)
	if err != nil {
		h.logger.Error("failed to get monthly totals", "error", err)
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, totals)
}

// GetTopRoutes handles GET /api/ridership/top-routes?year=2023&limit=10
func (h *RidershipHandlers) GetTopRoutes(c echo.Context) error {
	h.logger.Info("request received", "method", c.Request().Method, "path", c.Path())

	yearStr := c.QueryParam("year")
	if yearStr == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "year parameter is required")
	}

	year, err := strconv.Atoi(yearStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid year parameter")
	}

	limit := 10
	if limitStr := c.QueryParam("limit"); limitStr != "" {
		limit, err = strconv.Atoi(limitStr)
		if err != nil || limit < 1 || limit > 100 {
			return echo.NewHTTPError(http.StatusBadRequest, "limit must be between 1 and 100")
		}
	}

	routes, err := h.service.GetTopRoutes(year, limit)
	if err != nil {
		h.logger.Error("failed to get top routes", "error", err)
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, routes)
}

// GetRouteYearly handles GET /api/ridership/route/:route/yearly
func (h *RidershipHandlers) GetRouteYearly(c echo.Context) error {
	h.logger.Info("request received", "method", c.Request().Method, "path", c.Path())

	route := c.Param("route")
	if route == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "route parameter is required")
	}

	totals, err := h.service.GetRouteYearlyTotals(route)
	if err != nil {
		h.logger.Error("failed to get route yearly totals", "error", err)
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, totals)
}

// GetRouteDaily handles GET /api/ridership/route/:route/daily?year=2023
func (h *RidershipHandlers) GetRouteDaily(c echo.Context) error {
	h.logger.Info("request received", "method", c.Request().Method, "path", c.Path())

	route := c.Param("route")
	if route == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "route parameter is required")
	}

	var year *int
	if yearStr := c.QueryParam("year"); yearStr != "" {
		y, err := strconv.Atoi(yearStr)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid year parameter")
		}
		year = &y
	}

	data, err := h.service.GetRouteDaily(route, year)
	if err != nil {
		h.logger.Error("failed to get route daily data", "error", err)
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, data)
}

// GetAvailableYears handles GET /api/ridership/years
func (h *RidershipHandlers) GetAvailableYears(c echo.Context) error {
	h.logger.Info("request received", "method", c.Request().Method, "path", c.Path())

	years, err := h.service.GetAvailableYears()
	if err != nil {
		h.logger.Error("failed to get available years", "error", err)
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, years)
}

// GetDailyTotals handles GET /api/ridership/daily?year=2023&month=6
// Both year and month are optional. If not provided, returns all daily data.
func (h *RidershipHandlers) GetDailyTotals(c echo.Context) error {
	h.logger.Info("request received", "method", c.Request().Method, "path", c.Path())

	var year *int
	var month *int

	if yearStr := c.QueryParam("year"); yearStr != "" {
		y, err := strconv.Atoi(yearStr)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid year parameter")
		}
		year = &y
	}

	if monthStr := c.QueryParam("month"); monthStr != "" {
		m, err := strconv.Atoi(monthStr)
		if err != nil || m < 1 || m > 12 {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid month parameter (must be 1-12)")
		}
		month = &m
	}

	totals, err := h.service.GetDailyTotals(year, month)
	if err != nil {
		h.logger.Error("failed to get daily totals", "error", err)
		return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
	}

	return c.JSON(http.StatusOK, totals)
}
