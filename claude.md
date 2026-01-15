# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CTA Map is a full-stack application for visualizing Chicago Transit Authority bus data, including real-time vehicle locations and historical ridership statistics.

## Development Commands

### Frontend (from `frontend/cta-map/`)
```bash
npm run dev          # Start Vite dev server
npm run build        # TypeScript compile + Vite build
npm run lint         # Run ESLint
npm run test:e2e     # Run Playwright tests
```

### Backend (from `backend/`)
```bash
go run .             # Run the server (requires CTA_API_KEY env var)
go build             # Build the binary
```

### Environment Variables
- `CTA_API_KEY` - Required for backend to call CTA Bus Tracker API
- `JAWG_ACCESS_TOKEN` - Backend env var for Jawg map tiles (served to frontend via `/api/config`)
- `VITE_API_BASE_URL` - Frontend API base URL for local dev only (defaults to `/api`)
- `RIDERSHIP_DB_PATH` - Path to SQLite ridership database (defaults to `data/ridership.db`)
- `API_TRACKER_DB_PATH` - Path to SQLite database for tracking CTA API calls (defaults to `data/api_tracker.db`)

## Architecture

### Backend (Go + Echo)
Follows Handler → Service → Database Gateway pattern:
- `handlers.go` - HTTP request handlers (Handlers, RidershipHandlers)
- `service.go` - Business logic (CTAService, RidershipService)
- `database_gateway.go` - SQLite queries for ridership data (DatabaseGatway)
- `main.go` - Server setup, routing, middleware

API endpoints:
- `/api/config` - Frontend runtime configuration (Jawg token, etc.)
- `/api/routes` - All CTA bus routes
- `/api/vehicles/locations?rt=...` - Vehicles for specific routes (max 10)
- `/api/vehicles/all` - All active vehicles
- `/api/routes/stats` - Vehicle counts by route and direction
- `/api/ridership/*` - Historical ridership data endpoints
- `/api/tracking/counts` - CTA API call counts (total, today, by endpoint)

### Frontend (React + TypeScript + Vite)
- `src/api/cta.ts` - API client functions and types
- `src/pages/` - Route components (MapPage, StatsPage)
- `src/components/` - Reusable components
- Uses React Query for data fetching, Leaflet for maps, ECharts for charts

## Standards

- Vanilla CSS only (no Tailwind or CSS libraries)
- Prioritize readability over cleverness
- Ask clarifying questions before making architectural changes
