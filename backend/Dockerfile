FROM golang:1.21-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -o kv-tube .

FROM alpine:latest

RUN apk add --no-cache ca-certificates ffmpeg curl

WORKDIR /app

COPY --from=builder /app/kv-tube .
COPY data ./data

EXPOSE 8080

ENV KVTUBE_DATA_DIR=/app/data
ENV GIN_MODE=release

CMD ["./kv-tube"]
