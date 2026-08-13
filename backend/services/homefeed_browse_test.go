package services

import (
	"testing"
)

// Realistic Innertube browse response shape for FEwhat_to_watch: a rich grid
// of richItemRenderer > videoRenderer entries, plus a continuation item.
const sampleBrowse = `{
  "contents": {
    "twoColumnBrowseResultsRenderer": {
      "tabs": [
        {
          "tabRenderer": {
            "content": {
              "richGridRenderer": {
                "contents": [
                  {
                    "richItemRenderer": {
                      "content": {
                        "videoRenderer": {
                          "videoId": "AAAAAAAAAAA",
                          "title": {"runs": [{"text": "First Video Title"}]},
                          "ownerText": {"runs": [{"text": "Channel One"}]},
                          "lengthText": {"simpleText": "12:34"},
                          "publishedTimeText": {"simpleText": "3 days ago"},
                          "viewCountText": {"simpleText": "1,234,567 views"}
                        }
                      }
                    }
                  },
                  {
                    "richItemRenderer": {
                      "content": {
                        "videoRenderer": {
                          "videoId": "BBBBBBBBBBB",
                          "title": {"runs": [{"text": "Second "}, {"text": "Video"}]},
                          "ownerText": {"runs": [{"text": "Channel Two"}]},
                          "lengthText": {"runs": [{"text": "5:01"}]},
                          "publishedTimeText": {"simpleText": "1 week ago"},
                          "viewCountText": {"simpleText": "999 views"}
                        }
                      }
                    }
                  },
                  {
                    "continuationItemRenderer": {
                      "continuationEndpoint": {
                        "continuationCommand": {"token": "NEXT_TOKEN_XYZ"}
                      }
                    }
                  }
                ]
              }
            }
          }
        }
      ]
    }
  }
}`

func TestParseBrowsePage(t *testing.T) {
	videos, next := parseBrowsePage([]byte(sampleBrowse))
	if len(videos) != 2 {
		t.Fatalf("expected 2 videos, got %d", len(videos))
	}
	if next != "NEXT_TOKEN_XYZ" {
		t.Fatalf("expected continuation token NEXT_TOKEN_XYZ, got %q", next)
	}

	v0 := videos[0]
	if v0.ID != "AAAAAAAAAAA" || v0.Title != "First Video Title" {
		t.Errorf("video 0 mismatch: %+v", v0)
	}
	if v0.Uploader != "Channel One" {
		t.Errorf("video 0 uploader = %q", v0.Uploader)
	}
	if v0.Duration != "12:34" {
		t.Errorf("video 0 duration = %q", v0.Duration)
	}
	if v0.UploadDate != "3 days ago" {
		t.Errorf("video 0 upload date = %q", v0.UploadDate)
	}
	if v0.ViewCount != 1234567 {
		t.Errorf("video 0 view count = %d, want 1234567", v0.ViewCount)
	}
	if v0.Thumbnail != "https://i.ytimg.com/vi/AAAAAAAAAAA/hqdefault.jpg" {
		t.Errorf("video 0 thumbnail = %q", v0.Thumbnail)
	}

	// runs concatenation + runs-based lengthText
	v1 := videos[1]
	if v1.Title != "Second Video" {
		t.Errorf("video 1 title = %q, want 'Second Video'", v1.Title)
	}
	if v1.Duration != "5:01" {
		t.Errorf("video 1 duration = %q", v1.Duration)
	}
	if v1.ViewCount != 999 {
		t.Errorf("video 1 view count = %d", v1.ViewCount)
	}
}

func TestParseBrowsePageContinuation(t *testing.T) {
	// Continuation payloads carry items under onResponseReceivedEndpoints.
	payload := `{
	  "onResponseReceivedEndpoints": [
	    {
	      "appendContinuationItemsAction": {
	        "continuationItems": [
	          {
	            "richItemRenderer": {
	              "content": {
	                "videoRenderer": {
	                  "videoId": "CCCCCCCCCCC",
	                  "title": {"runs": [{"text": "Continuation Video"}]},
	                  "ownerText": {"runs": [{"text": "Channel C"}]}
	                }
	              }
	            }
	          }
	        ]
	      }
	    }
	  ]
	}`
	videos, next := parseBrowsePage([]byte(payload))
	if len(videos) != 1 {
		t.Fatalf("expected 1 continuation video, got %d", len(videos))
	}
	if videos[0].ID != "CCCCCCCCCCC" || videos[0].Title != "Continuation Video" {
		t.Errorf("continuation video mismatch: %+v", videos[0])
	}
	if next != "" {
		t.Errorf("unexpected continuation token %q", next)
	}
}

func TestNetscapeCookiesForDomain(t *testing.T) {
	data := []byte(`# Netscape HTTP Cookie File
.youtube.com	TRUE	/	TRUE	9999999999	SID	abc123
www.youtube.com	FALSE	/	FALSE	9999999999	VISITOR_INFO1_LIVE	xyz
.example.com	TRUE	/	TRUE	9999999999	OTHER	skipme
.youtube.com	TRUE	/	TRUE	1	EXPIRED_COOKIE	dead
`)
	h := netscapeCookiesForDomain(data, "youtube.com")
	// Must include SID and VISITOR_INFO1_LIVE, exclude other domains and expired.
	if !contains(h, "SID=abc123") || !contains(h, "VISITOR_INFO1_LIVE=xyz") {
		t.Errorf("missing youtube cookies, header=%q", h)
	}
	if contains(h, "OTHER=skipme") || contains(h, "EXPIRED_COOKIE") {
		t.Errorf("should not include other/expired cookies, header=%q", h)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 || indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
