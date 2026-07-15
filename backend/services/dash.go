package services

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// DashFormat is a single playable representation (video or audio) extracted from
// YouTube and served to the client as a DASH Representation. The client (shaka)
// does all demux/decode; the server only proxies the bytes.
type DashFormat struct {
	FormatID  string
	URL       string
	Codecs    string
	Height    int
	Width     int
	Bandwidth int64
	IsAudio   bool
	InitRange  string // e.g. "0-728"
	IndexRange string // e.g. "729-1016"; empty => whole-file single segment
}

// DashManifest is the fully-built DASH manifest plus metadata.
type DashManifest struct {
	DurationSec float64
	Video       []DashFormat
	Audio       []DashFormat
}

// GetDashManifest builds data for a client-playable DASH manifest for a video
// using only YouTube's native MP4 representations (avc1/av01 video + AAC audio).
// No server transcode/merge happens — the browser muxes+decodes via MSE
// (shaka-player). heightCap <= 0 means no cap (all resolutions). forceAvc1
// restricts to H.264.
func GetDashManifest(videoID string, heightCap int, forceAvc1 bool) (*DashManifest, error) {
	urlStr := fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID)
	cmdArgs := []string{
		"--dump-json",
		"--no-warnings",
		"--quiet",
		"--force-ipv4",
		"--no-playlist",
		"--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		urlStr,
	}
	cacheKey := "dash_formats:" + videoID
	out, err := RunYtDlpCached(cacheKey, 3600, cmdArgs...)
	if err != nil {
		return nil, err
	}

	var raw struct {
		Duration float64 `json:"duration"`
		Formats  []struct {
			FormatID string      `json:"format_id"`
			Ext      string      `json:"ext"`
			Height   interface{} `json:"height"`
			Width    interface{} `json:"width"`
			URL      string      `json:"url"`
			VCodec   string      `json:"vcodec"`
			ACodec   string      `json:"acodec"`
			Filesize interface{} `json:"filesize"`
		} `json:"formats"`
	}
	if err := json.Unmarshal(out, &raw); err != nil {
		return nil, err
	}

	dur := raw.Duration
	if dur <= 0 {
		dur = 0 // static MPD without duration is still playable
	}

	var video, audio []DashFormat
	for _, f := range raw.Formats {
		if f.URL == "" {
			continue
		}
		isMp4Video := f.Ext == "mp4" && f.VCodec != "none"
		isMp4Audio := (f.Ext == "mp4" || f.Ext == "m4a") && strings.Contains(f.ACodec, "mp4a")
		if !isMp4Video && !isMp4Audio {
			continue
		}
		var h int
		switch v := f.Height.(type) {
		case float64:
			h = int(v)
		case int:
			h = v
		}
		var w int
		switch v := f.Width.(type) {
		case float64:
			w = int(v)
		case int:
			w = v
		}
		var fs int64
		switch v := f.Filesize.(type) {
		case float64:
			fs = int64(v)
		case int64:
			fs = v
		}

		if f.VCodec != "none" {
			if forceAvc1 && !strings.HasPrefix(f.VCodec, "avc1") {
				continue
			}
			if h == 0 {
				continue
			}
			if heightCap > 0 && h > heightCap {
				continue
			}
			if w == 0 {
				w = int(math.Round(float64(h) * 16.0 / 9.0))
			}
			video = append(video, DashFormat{
				FormatID:  f.FormatID,
				URL:       f.URL,
				Codecs:    f.VCodec,
				Height:    h,
				Width:     w,
				Bandwidth: estimateBandwidth(fs, dur, h),
				IsAudio:   false,
			})
		} else if strings.Contains(f.ACodec, "mp4a") {
			audio = append(audio, DashFormat{
				FormatID:  f.FormatID,
				URL:       f.URL,
				Codecs:    "mp4a.40.2",
				Bandwidth: estimateBandwidth(fs, dur, 0),
				IsAudio:   true,
			})
		}
	}

	if len(video) == 0 {
		return nil, fmt.Errorf("no mp4 video representations available")
	}
	if len(audio) == 0 {
		return nil, fmt.Errorf("no mp4/aac audio representation available")
	}

	var wg sync.WaitGroup
	for i := range video {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			video[i].InitRange, video[i].IndexRange = probeMp4(video[i].URL)
		}(i)
	}
	for i := range audio {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			audio[i].InitRange, audio[i].IndexRange = probeMp4(audio[i].URL)
		}(i)
	}
	wg.Wait()

	return &DashManifest{DurationSec: dur, Video: video, Audio: audio}, nil
}

func estimateBandwidth(filesize int64, dur float64, height int) int64 {
	if dur > 0 && filesize > 0 {
		b := int64(float64(filesize) * 8 / dur)
		if b > 0 {
			return b
		}
	}
	switch {
	case height >= 2160:
		return 14_000_000
	case height >= 1440:
		return 7_000_000
	case height >= 1080:
		return 3_000_000
	case height >= 720:
		return 1_500_000
	case height >= 480:
		return 700_000
	default:
		return 400_000
	}
}

// probeMp4 fetches the head of an MP4 and locates the moov/sidx boxes so we can
// emit a seekable DASH SegmentBase. Returns (initRange, indexRange). If no sidx
// is found, indexRange is empty (client treats the file as one segment).
func probeMp4(rawURL string) (string, string) {
	probeMu.Lock()
	if r, ok := probeCache[rawURL]; ok {
		probeMu.Unlock()
		return r.init, r.index
	}
	probeMu.Unlock()

	init, index := "0-0", ""
	func() {
		client := &http.Client{Timeout: 20 * time.Second}
		req, err := http.NewRequest("GET", rawURL, nil)
		if err != nil {
			return
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
		req.Header.Set("Referer", "https://www.youtube.com/")
		req.Header.Set("Range", "bytes=0-2097151")
		resp, err := client.Do(req)
		if err != nil {
			return
		}
		defer resp.Body.Close()
		buf, err := io.ReadAll(io.LimitReader(resp.Body, 2_097_152))
		if err != nil || len(buf) < 16 {
			return
		}
		init, index = parseMp4Ranges(buf)
	}()

	probeMu.Lock()
	probeCache[rawURL] = probeResult{init: init, index: index}
	probeMu.Unlock()
	return init, index
}

// parseMp4Ranges walks top-level MP4 boxes looking for moov (init) and sidx
// (segment index). Returns initRange (ftyp+moov) and indexRange (sidx box).
// When sidx is absent, indexRange is "".
func parseMp4Ranges(buf []byte) (string, string) {
	i := 0
	var moovEnd, sidxStart, sidxEnd int = -1, -1, -1
	for i+8 <= len(buf) {
		size := int(uint32(buf[i])<<24 | uint32(buf[i+1])<<16 | uint32(buf[i+2])<<8 | uint32(buf[i+3]))
		typ := string(buf[i+4 : i+8])
		if size == 0 {
			break
		}
		if size == 1 {
			if i+16 > len(buf) {
				break
			}
			size = int(uint64(buf[i+8])<<56 | uint64(buf[i+9])<<48 | uint64(buf[i+10])<<40 | uint64(buf[i+11])<<32 |
				uint64(buf[i+12])<<24 | uint64(buf[i+13])<<16 | uint64(buf[i+14])<<8 | uint64(buf[i+15]))
		}
		// MP4 box size is the total box size (header included); next box is at i+size.
		switch typ {
		case "moov":
			moovEnd = i + size
		case "sidx":
			sidxStart = i
			sidxEnd = i + size
		}
		i += size
		if sidxEnd > 0 && moovEnd > 0 {
			break
		}
	}
	init, index := "0-0", ""
	if moovEnd > 0 {
		init = fmt.Sprintf("0-%d", moovEnd-1)
	}
	if sidxStart >= 0 && sidxEnd > sidxStart {
		index = fmt.Sprintf("%d-%d", sidxStart, sidxEnd-1)
	}
	return init, index
}

type probeResult struct {
	init  string
	index string
}

var (
	probeMu    sync.Mutex
	probeCache = map[string]probeResult{}
)

// BuildDashMpd renders the DASH manifest XML. Video/audio bytes are fetched by
// the client through our proxy (/api/proxy) so CORS/IP-binding is handled and
// the server does no transcode.
func BuildDashMpd(m *DashManifest) string {
	var b strings.Builder
	dur := ""
	if m.DurationSec > 0 {
		dur = fmt.Sprintf("PT%gS", m.DurationSec)
	}
	durMs := int(math.Round(m.DurationSec * 1000))
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	b.WriteString(`<MPD type="static"`)
	if dur != "" {
		b.WriteString(fmt.Sprintf(` mediaPresentationDuration="%s"`, dur))
	}
	b.WriteString(` minBufferTime="PT2S" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" xmlns="urn:mpeg:dash:schema:mpd:2011">` + "\n")
	b.WriteString(`  <Period>` + "\n")

	b.WriteString(`    <AdaptationSet id="0" contentType="video" segmentAlignment="true">` + "\n")
	for _, v := range m.Video {
		writeDashRep(&b, v, durMs)
	}
	b.WriteString(`    </AdaptationSet>` + "\n")

	b.WriteString(`    <AdaptationSet id="1" contentType="audio" segmentAlignment="true">` + "\n")
	for _, a := range m.Audio {
		writeDashRep(&b, a, durMs)
	}
	b.WriteString(`    </AdaptationSet>` + "\n")

	b.WriteString(`  </Period>` + "\n")
	b.WriteString(`</MPD>` + "\n")
	return b.String()
}

func writeDashRep(b *strings.Builder, f DashFormat, durMs int) {
	mime := "video/mp4"
	if f.IsAudio {
		mime = "audio/mp4"
	}
	b.WriteString(fmt.Sprintf(`      <Representation id="%s" codecs="%s" mimeType="%s" bandwidth="%d"`,
		xmlEscape(f.FormatID), xmlEscape(f.Codecs), mime, f.Bandwidth))
	if !f.IsAudio {
		b.WriteString(fmt.Sprintf(` width="%d" height="%d"`, f.Width, f.Height))
	}
	b.WriteString(">\n")

	proxyURL := "/api/proxy?url=" + url.QueryEscape(f.URL)
	initURL := proxyURL
	// When we located the init (moov) box, fetch just those bytes as the init
	// segment via the proxy's `brange` so we don't download the whole file twice.
	// The media segment is the WHOLE file (not just the bytes after moov): a
	// progressive MP4's `stco` chunk offsets are absolute file offsets, so the
	// media SourceBuffer must start at byte 0 for them to resolve correctly.
	// Serving only the post-moov bytes would make Chrome read garbage where it
	// expects samples (audio decoder "UnsupportedConfig").
	if f.InitRange != "" && f.InitRange != "0-0" {
		initURL = proxyURL + "&brange=" + f.InitRange
	}
	b.WriteString(fmt.Sprintf(`        <BaseURL>%s</BaseURL>`+"\n", xmlEscape(proxyURL)))
	// One SegmentTemplate spanning the whole stream file as a single segment.
	// shaka fetches the init via initURL and the media via the proxied URL (whole
	// file), issuing Range requests for seeking. No server-side transcode required.
	b.WriteString(fmt.Sprintf(`        <SegmentTemplate timescale="1000" duration="%d" startNumber="1" initialization="%s" media="%s"/>`+"\n",
		durMs, xmlEscape(initURL), xmlEscape(proxyURL)))
	b.WriteString(`      </Representation>` + "\n")
}

func xmlEscape(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "\"", "&quot;", "'", "&apos;")
	return r.Replace(s)
}
