package routes

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"kvtube-go/services"

	"github.com/gin-gonic/gin"
)

// Settings status response.
type settingsStatus struct {
	YtDlp struct {
		Version  string `json:"version"`
		AutoUpdate bool `json:"auto_update"`
		LastCheckAt string `json:"last_check_at,omitempty"`
	} `json:"ytdlp"`
	Cookies services.CookiesStatus `json:"cookies"`
	IPv6    services.IPv6Status    `json:"ipv6"`
	Server  struct {
		Time string `json:"time"`
	} `json:"server"`
}

// handleSettingsStatus reports the current yt-dlp, cookies, and IPv6 configuration.
// GET /api/settings/status
func handleSettingsStatus(c *gin.Context) {
	var st settingsStatus
	st.YtDlp.Version = services.YtDlpVersion()
	st.YtDlp.AutoUpdate = services.YtDlpUpdateEnabled()
	st.YtDlp.LastCheckAt = services.YtDlpLastUpdateAt()
	st.Cookies = services.GetCookiesStatus()
	st.IPv6 = services.GetIPv6Status()
	st.Server.Time = time.Now().Format(time.RFC3339)
	c.JSON(http.StatusOK, st)
}

// handleCookiesUpload persists an uploaded Netscape-format cookies file.
// POST /api/settings/cookies (multipart field "file")
func handleCookiesUpload(c *gin.Context) {
	file, _, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing file upload field 'file'"})
		return
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, 10<<20))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Failed to read upload: %v", err)})
		return
	}

	if err := services.SaveCookiesFile(data); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	log.Printf("[settings] Cookies file uploaded (%d bytes)", len(data))
	c.JSON(http.StatusOK, gin.H{"ok": true, "cookies": services.GetCookiesStatus()})
}

// handleCookiesDelete removes the persisted cookies file.
// DELETE /api/settings/cookies
func handleCookiesDelete(c *gin.Context) {
	if err := services.RemoveCookiesFile(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "cookies": services.GetCookiesStatus()})
}

// handleCookiesFetch exports cookies from a local browser automatically.
// POST /api/settings/cookies/fetch?browser=chrome
func handleCookiesFetch(c *gin.Context) {
	browser := c.DefaultQuery("browser", "chrome")
	if err := services.FetchCookiesFromBrowser(browser); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	log.Printf("[settings] Cookies fetched from browser %q", browser)
	c.JSON(http.StatusOK, gin.H{"ok": true, "cookies": services.GetCookiesStatus()})
}

// handleYtDlpUpdate triggers a manual yt-dlp nightly update.
// POST /api/settings/ytdlp/update
func handleYtDlpUpdate(c *gin.Context) {
	before, after, err := services.UpdateYtDlpNow()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error(), "before": before, "after": after})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "before": before, "after": after})
}

// handleSettingsDiagnose runs network diagnostics from inside the server
// (IPv4/IPv6 reachability of YouTube). With ?test=1 it also runs a real
// yt-dlp extraction through the playback retry chain.
// GET /api/settings/diagnose[?test=1]
func handleSettingsDiagnose(c *gin.Context) {
	diag := services.RunNetworkDiagnostics()
	if c.Query("test") != "" {
		diag.ExtractionTest = new(services.ExtractionResult)
		*diag.ExtractionTest = services.RunExtractionTest(c.Query("video"))
	}
	c.JSON(http.StatusOK, diag)
}
