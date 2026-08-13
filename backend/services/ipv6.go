package services

import (
	"log"
	"net"
	"os"
	"strings"
	"sync"
	"time"
)

// IPv6 handling (KB §2): YouTube blocks many residential IPv4 routes but
// allows the same traffic over IPv6. The connectivity is probed once at
// startup; when routable, yt-dlp is passed --force-ipv6. FORCE_IPV6=1 always
// forces IPv6, FORCE_IPV6=0 never. Network-level failures automatically flip
// to the other family and retry.
var (
	ipv6StateMu   sync.RWMutex
	ipv6Available bool
	ipv6Probed    bool
)

// ipv6ProbeTargets are public IPv6 endpoints used to test routability. A
// single dead target (e.g. Google DNS blocked by an ISP) must not produce a
// false "IPv6 not routable", so several independent networks are tried, and
// YouTube's own AAAA address as a last resort.
var ipv6ProbeTargets = []string{
	"[2001:4860:4860::8888]:443", // Google DNS
	"[2606:4700:4700::1111]:443", // Cloudflare DNS
	"[2620:fe::fe]:443",          // Quad9
}

// ipv6ProbeResults records per-target probe outcomes for diagnostics.
var ipv6ProbeResults = map[string]string{}

const ipv6ProbeTimeout = 3 * time.Second

func init() {
	probeIPv6()
}

// forceIPv6Setting maps the FORCE_IPV6 env var to a policy: "ipv6" | "ipv4" | "auto".
func forceIPv6Setting() string {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("FORCE_IPV6"))) {
	case "1", "true", "yes", "on":
		return "ipv6"
	case "0", "false", "no", "off":
		return "ipv4"
	}
	return "auto"
}

// probeIPv6 checks whether IPv6 is actually routable from this host by
// attempting TCP connects to several public IPv6 endpoints (and YouTube's own
// AAAA address). The result is cached; on Synology "assigned but not routed"
// setups every connect times out and we fall back to IPv4 (which may be
// bot-blocked — the settings page shows the probe details).
func probeIPv6() {
	ipv6StateMu.Lock()
	defer ipv6StateMu.Unlock()
	if ipv6Probed {
		return
	}

	tryDial := func(target string) error {
		conn, err := net.DialTimeout("tcp6", target, ipv6ProbeTimeout)
		if err == nil {
			conn.Close()
			return nil
		}
		return err
	}

	for _, target := range ipv6ProbeTargets {
		err := tryDial(target)
		if err == nil {
			ipv6Available = true
			ipv6Probed = true
			ipv6ProbeResults[target] = "ok"
			log.Printf("[ipv6] IPv6 is routable (probe target %s), yt-dlp will prefer IPv6", target)
			return
		}
		ipv6ProbeResults[target] = err.Error()
		log.Printf("[ipv6] probe %s failed: %v", target, err)
	}

	// Last resort: YouTube's own IPv6 address (resolved via DNS).
	if aaaa := firstIPv6Addr("youtube.com"); aaaa != "" {
		target := net.JoinHostPort(aaaa, "443")
		err := tryDial(target)
		if err == nil {
			ipv6Available = true
			ipv6Probed = true
			ipv6ProbeResults["youtube.com (AAAA)"] = "ok"
			log.Printf("[ipv6] IPv6 is routable (youtube AAAA %s), yt-dlp will prefer IPv6", aaaa)
			return
		}
		ipv6ProbeResults["youtube.com (AAAA)"] = err.Error()
		log.Printf("[ipv6] probe youtube AAAA %s failed: %v", aaaa, err)
	}

	log.Printf("[ipv6] IPv6 not routable, falling back to IPv4")
	ipv6Probed = true
}

// firstIPv6Addr returns the first IPv6 (AAAA) address for a hostname, or "".
func firstIPv6Addr(host string) string {
	addrs, err := net.LookupHost(host)
	if err != nil {
		return ""
	}
	for _, a := range addrs {
		ip := net.ParseIP(a)
		if ip != nil && ip.To4() == nil {
			return a
		}
	}
	return ""
}

// ipFamilyArgs returns the --force-ipv6/--force-ipv4 flag to pass to yt-dlp,
// based on the FORCE_IPV6 override or the startup probe result.
func ipFamilyArgs() []string {
	return ipFamilyArgsFor(currentIPFamily())
}

// ipFamilyArgsFor returns the family flag for an explicit family choice.
func ipFamilyArgsFor(family string) []string {
	if family == "ipv6" {
		return []string{"--force-ipv6"}
	}
	return []string{"--force-ipv4"}
}

// currentIPFamily resolves the preferred IP family once (override wins, then
// the probe result, defaulting to IPv4).
func currentIPFamily() string {
	switch forceIPv6Setting() {
	case "ipv6":
		return "ipv6"
	case "ipv4":
		return "ipv4"
	}
	ipv6StateMu.RLock()
	defer ipv6StateMu.RUnlock()
	if ipv6Available {
		return "ipv6"
	}
	return "ipv4"
}

// alternateIPFamily returns the other family.
func alternateIPFamily(family string) string {
	if family == "ipv6" {
		return "ipv4"
	}
	return "ipv6"
}

// isNetworkFailure distinguishes network-level failures (flip IP family and
// retry) from rate limits (retry with backoff) and cookie rejections / bot
// blocks (refresh session). Matches the signatures yt-dlp emits.
func isNetworkFailure(stderr string) bool {
	s := strings.ToLower(stderr)
	for _, pat := range []string{
		"network is unreachable",
		"network unreachable",
		"no route to host",
		"connect() timed out",
		"connection timed out",
		"temporary failure in name resolution",
		"getaddrinfo failed",
		"network error",
	} {
		if strings.Contains(s, pat) {
			return true
		}
	}
	return false
}

// stripFamilyArgs removes any --force-ipv4/--force-ipv6 flags from an arg
// list so the family can be injected centrally.
func stripFamilyArgs(args []string) []string {
	out := args[:0]
	for _, a := range args {
		if a != "--force-ipv4" && a != "--force-ipv6" {
			out = append(out, a)
		}
	}
	return out
}

// IPv6Status describes the current IPv6 configuration for the settings page.
type IPv6Status struct {
	Force     string            `json:"force"`     // "auto" | "ipv6" | "ipv4"
	Available bool              `json:"available"` // probe result (IPv6 routable)
	Probed    bool              `json:"probed"`
	Targets   map[string]string `json:"targets,omitempty"` // probe target -> outcome
}

// GetIPv6Status reports the IPv6 probe state and override policy.
func GetIPv6Status() IPv6Status {
	ipv6StateMu.RLock()
	defer ipv6StateMu.RUnlock()
	return IPv6Status{
		Force:     forceIPv6Setting(),
		Available: ipv6Available,
		Probed:    ipv6Probed,
		Targets:   ipv6ProbeResults,
	}
}
