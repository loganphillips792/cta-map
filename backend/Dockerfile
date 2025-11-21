FROM golang:1.21-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o cta-backend

FROM alpine:3.18

RUN adduser -D appuser \
    && apk add --no-cache ca-certificates

USER appuser
WORKDIR /app

COPY --from=builder /app/cta-backend /usr/local/bin/cta-backend

ENV PORT=8080

EXPOSE 8080

CMD ["cta-backend"]
