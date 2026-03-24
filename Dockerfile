# ---- Backend Builder ----
FROM golang:1.24-alpine AS backend-builder
ENV GOTOOLCHAIN=local
WORKDIR /app
RUN apk add --no-cache git gcc musl-dev
COPY backend/go.mod backend/go.sum ./
RUN (echo "module kvtube-go"; echo ""; echo "go 1.24.0"; tail -n +4 go.mod) > go.mod.new && mv go.mod.new go.mod && go mod tidy
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build -o kv-tube .

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
ENV NEXT_PUBLIC_API_URL=http://localhost:8080
RUN echo "NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL" && npm run build

# ---- Final Unified Image ----
FROM alpine:latest

# Install dependencies for Go backend, Node.js frontend, and Supervisord
RUN apk add --no-cache nodejs
RUN apk add --no-cache ca-certificates
RUN apk add --no-cache ffmpeg
RUN apk add --no-cache curl
RUN apk add --no-cache python3
RUN apk add --no-cache py3-pip
RUN apk add --no-cache supervisor
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
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
ENV KVTUBE_DATA_DIR=/app/data
ENV GIN_MODE=release
ENV NEXT_PUBLIC_API_URL=http://127.0.0.1:8080

EXPOSE 3000 8080

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
