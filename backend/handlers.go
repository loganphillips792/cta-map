package main

import (
	"log/slog"
	"net/http"
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
