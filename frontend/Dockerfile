FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies first to leverage Docker layer caching
COPY frontend/cta-map/package*.json ./
RUN npm ci

# Copy the remaining source and build the production bundle
COPY frontend/cta-map/ .
RUN npm run build

FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
