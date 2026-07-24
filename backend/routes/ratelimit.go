package routes

import (
	"log"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// RateLimiter implements per-IP token bucket rate limiting.
type RateLimiter struct {
	mu       sync.Mutex
	clients  map[string]*clientBucket
	rate     int           // tokens per interval
	interval time.Duration // refill interval
	burst    int           // max tokens (bucket capacity)
}

type clientBucket struct {
	tokens   int
	lastFill time.Time
}

// NewRateLimiter creates a rate limiter with the given config.
// rate: requests allowed per interval, burst: max burst capacity.
func NewRateLimiter(rate int, interval time.Duration, burst int) *RateLimiter {
	rl := &RateLimiter{
		clients:  make(map[string]*clientBucket),
		rate:     rate,
		interval: interval,
		burst:    burst,
	}
	go rl.cleanupLoop()
	return rl
}

// Allow reports whether a request from the given IP should be permitted.
func (rl *RateLimiter) Allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	b, ok := rl.clients[ip]
	if !ok {
		b = &clientBucket{tokens: rl.burst - 1, lastFill: now}
		rl.clients[ip] = b
		return true
	}

	// Refill tokens based on elapsed time.
	elapsed := now.Sub(b.lastFill)
	refill := int(elapsed / rl.interval) * rl.rate
	if refill > 0 {
		b.tokens += refill
		if b.tokens > rl.burst {
			b.tokens = rl.burst
		}
		b.lastFill = now
	}

	if b.tokens <= 0 {
		return false
	}
	b.tokens--
	return true
}

// cleanupLoop periodically removes stale entries to prevent memory leaks.
func (rl *RateLimiter) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		rl.mu.Lock()
		cutoff := time.Now().Add(-10 * rl.interval)
		for ip, b := range rl.clients {
			if b.lastFill.Before(cutoff) {
				delete(rl.clients, ip)
			}
		}
		rl.mu.Unlock()
	}
}

// RateLimitMiddleware returns a Gin middleware that enforces per-IP rate limiting.
func RateLimitMiddleware(rl *RateLimiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		if !rl.Allow(ip) {
			log.Printf("[ratelimit] Rate limit exceeded for %s on %s", ip, c.Request.URL.Path)
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "Rate limit exceeded. Please try again later."})
			c.Abort()
			return
		}
		c.Next()
	}
}

// parseRateLimitConfig reads rate limit settings from environment variables
// and returns a configured RateLimiter. Falls back to sensible defaults.
//
//	RATE_LIMIT_RATE=60        (requests per interval, default: 60)
//	RATE_LIMIT_INTERVAL=1m    (interval window, default: 1m)
//	RATE_LIMIT_BURST=20       (burst capacity, default: 20)
func parseRateLimitConfig() *RateLimiter {
	rate := 60
	if v := os.Getenv("RATE_LIMIT_RATE"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			rate = n
		}
	}

	interval := time.Minute
	if v := os.Getenv("RATE_LIMIT_INTERVAL"); v != "" {
		if d, err := time.ParseDuration(v); err == nil && d > 0 {
			interval = d
		}
	}

	burst := 20
	if v := os.Getenv("RATE_LIMIT_BURST"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			burst = n
		}
	}

	log.Printf("[ratelimit] Configured: %d requests per %v (burst=%d)", rate, interval, burst)
	return NewRateLimiter(rate, interval, burst)
}
