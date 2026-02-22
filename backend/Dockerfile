FROM golang:1.24-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git gcc musl-dev

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN CGO_ENABLED=1 GOOS=linux go build -o kv-tube .

FROM alpine:latest

RUN apk add --no-cache ca-certificates ffmpeg curl

WORKDIR /app

COPY --from=builder /app/kv-tube .

EXPOSE 8080

ENV KVTUBE_DATA_DIR=/app/data
ENV GIN_MODE=release

CMD ["./kv-tube"]
