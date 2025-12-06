# Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app

COPY frontend/cta-map/package*.json ./
RUN npm ci
COPY frontend/cta-map/ .
RUN npm run build

# Build backend
FROM golang:1.21-alpine AS backend-builder
WORKDIR /app

# Install build dependencies for CGO (required for SQLite)
RUN apk add --no-cache gcc musl-dev

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ .
RUN CGO_ENABLED=1 GOOS=linux go build -o cta-server

# Final image
FROM alpine:3.19

RUN adduser -D appuser && \
    apk add --no-cache ca-certificates

WORKDIR /app

# Copy the backend binary
COPY --from=backend-builder /app/cta-server /usr/local/bin/cta-server

# Copy the frontend static files
COPY --from=frontend-builder /app/dist ./static

# Create data directory (ridership database can be mounted at runtime)
RUN mkdir -p ./data && chown appuser:appuser ./data

USER appuser

ENV PORT=8080
ENV STATIC_DIR=/app/static
ENV RIDERSHIP_DB_PATH=/app/data/ridership.db

EXPOSE 8080

CMD ["cta-server"]
