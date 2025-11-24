package main

import (
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
)

const maxRouteParams = 10

type Handlers struct {
	ctaService *CTAService
}

func NewHandlers(ctaService *CTAService) *Handlers {
	return &Handlers{ctaService: ctaService}
}

func (h *Handlers) Health(c echo.Context) error {
	return c.String(http.StatusOK, "CTA backend is running")
}

func (h *Handlers) GetRoutes(c echo.Context) error {
	routes, err := h.ctaService.GetRoutes(c.Request().Context())
	if err != nil {
		return writeError(c, err)
	}

	return c.JSON(http.StatusOK, routes)
}

func (h *Handlers) GetVehicleLocations(c echo.Context) error {
	routeParam := strings.TrimSpace(c.QueryParam("rt"))
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
