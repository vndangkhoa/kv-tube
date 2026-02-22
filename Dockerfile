# ---- Backend Builder ----
FROM golang:1.24-alpine AS backend-builder
WORKDIR /app
RUN apk add --no-cache git gcc musl-dev
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=1 GOOS=linux go build -o kv-tube .

# ---- Frontend Builder ----
FROM node:20-alpine AS frontend-deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY --from=frontend-deps /app/node_modules ./node_modules
COPY frontend/ ./
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# ---- Final Unified Image ----
FROM alpine:latest

# Install dependencies for Go backend, Node.js frontend, and Supervisord
RUN apk add --no-cache \
    nodejs \
    ca-certificates \
    ffmpeg \
    curl \
    python3 \
    py3-pip \
    supervisor \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Copy Backend Binary
COPY --from=backend-builder /app/kv-tube /app/kv-tube

# Copy Frontend Standalone App
COPY --from=frontend-builder /app/public /app/frontend/public
COPY --from=frontend-builder /app/.next/standalone /app/frontend/
COPY --from=frontend-builder /app/.next/static /app/frontend/.next/static

# Copy Supervisord Config
COPY supervisord.conf /etc/supervisord.conf

# Setup Environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV KVTUBE_DATA_DIR=/app/data
ENV GIN_MODE=release
ENV NEXT_PUBLIC_API_URL=http://127.0.0.1:8080

EXPOSE 3000 8080

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
