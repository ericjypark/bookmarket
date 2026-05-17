package fetcher

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

func TestValidatePublicURLRejectsRestrictedTargets(t *testing.T) {
	restricted := []string{
		"http://localhost:3000",
		"http://127.0.0.1:3000",
		"http://[::1]:3000",
		"file:///etc/passwd",
	}

	for _, rawURL := range restricted {
		if err := ValidatePublicURL(rawURL); err == nil {
			t.Fatalf("expected %s to be rejected", rawURL)
		}
	}
}

func TestParseHTMLMetadata(t *testing.T) {
	baseURL, err := url.Parse("https://example.com/articles/post")
	if err != nil {
		t.Fatal(err)
	}

	result := ParseHTMLMetadata(`
		<html>
			<head>
				<title> Example   Title </title>
				<meta name="description" content=" Example description ">
				<link rel="canonical" href="/canonical-post">
				<link rel="shortcut icon" href="/favicon.ico">
			</head>
		</html>
	`, baseURL)

	if result.Title != "Example Title" {
		t.Fatalf("unexpected title: %q", result.Title)
	}
	if result.Description != "Example description" {
		t.Fatalf("unexpected description: %q", result.Description)
	}
	if result.CanonicalURL != "https://example.com/canonical-post" {
		t.Fatalf("unexpected canonical URL: %q", result.CanonicalURL)
	}
	if result.FaviconURL != "https://example.com/favicon.ico" {
		t.Fatalf("unexpected favicon URL: %q", result.FaviconURL)
	}
}

func TestParseHTMLMetadataPrefersSocialAndJSONLDMetadata(t *testing.T) {
	baseURL, err := url.Parse("https://example.com/articles/post")
	if err != nil {
		t.Fatal(err)
	}

	result := ParseHTMLMetadata(`
		<html>
			<head>
				<title>Plain title</title>
				<meta property="og:title" content=" Open Graph title ">
				<meta name="twitter:description" content=" Twitter description ">
				<meta property="og:url" content="https://example.com/og-post">
				<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">
				<link rel="icon" type="image/svg+xml" href="/favicon.svg">
				<script type="application/ld+json">
					{
						"headline": "JSON-LD title",
						"description": "JSON-LD description",
						"logo": { "url": "/logo.png" }
					}
				</script>
			</head>
		</html>
	`, baseURL)

	if result.Title != "Open Graph title" {
		t.Fatalf("unexpected title: %q", result.Title)
	}
	if result.Description != "Twitter description" {
		t.Fatalf("unexpected description: %q", result.Description)
	}
	if result.CanonicalURL != "https://example.com/og-post" {
		t.Fatalf("unexpected canonical URL: %q", result.CanonicalURL)
	}
	if result.FaviconURL != "https://example.com/favicon.svg" {
		t.Fatalf("unexpected favicon URL: %q", result.FaviconURL)
	}
}

func TestFetchWithObscuraParsesRenderedMetadata(t *testing.T) {
	tempDir := t.TempDir()
	obscuraPath := filepath.Join(tempDir, "obscura")
	if err := os.WriteFile(
		obscuraPath,
		[]byte("#!/bin/sh\nprintf '%s\\n' '{\"title\":\"Rendered title\",\"description\":\"Rendered description\",\"canonicalUrl\":\"/rendered\",\"faviconUrl\":\"/icon.svg\"}'\n"),
		0o755,
	); err != nil {
		t.Fatal(err)
	}

	fetcher := NewWithOptions(Options{
		Timeout:        time.Second,
		ObscuraEnabled: true,
		ObscuraPath:    obscuraPath,
	})
	result, err := fetcher.fetchWithObscura(context.Background(), "https://example.com/source")
	if err != nil {
		t.Fatal(err)
	}

	if result.Title != "Rendered title" {
		t.Fatalf("unexpected title: %q", result.Title)
	}
	if result.Description != "Rendered description" {
		t.Fatalf("unexpected description: %q", result.Description)
	}
	if result.CanonicalURL != "https://example.com/rendered" {
		t.Fatalf("unexpected canonical URL: %q", result.CanonicalURL)
	}
	if result.FaviconURL != "https://example.com/icon.svg" {
		t.Fatalf("unexpected favicon URL: %q", result.FaviconURL)
	}
}

func TestFetchWithObscuraRejectsGenericPathMetadata(t *testing.T) {
	tempDir := t.TempDir()
	obscuraPath := filepath.Join(tempDir, "obscura")
	if err := os.WriteFile(
		obscuraPath,
		[]byte("#!/bin/sh\nprintf '%s\\n' '{\"title\":\"LinkedIn\",\"description\":\"\",\"canonicalUrl\":\"https://www.linkedin.com/in/chws\",\"faviconUrl\":\"\"}'\n"),
		0o755,
	); err != nil {
		t.Fatal(err)
	}

	fetcher := NewWithOptions(Options{
		Timeout:        time.Second,
		ObscuraEnabled: true,
		ObscuraPath:    obscuraPath,
	})
	if _, err := fetcher.fetchWithObscura(context.Background(), "https://www.linkedin.com/in/chws/"); err == nil {
		t.Fatal("expected generic path metadata to be rejected")
	}
}

func TestFetchWithObscuraRejectsEmptyPathMetadata(t *testing.T) {
	tempDir := t.TempDir()
	obscuraPath := filepath.Join(tempDir, "obscura")
	if err := os.WriteFile(
		obscuraPath,
		[]byte("#!/bin/sh\nprintf '%s\\n' '{\"title\":\"\",\"description\":\"\",\"canonicalUrl\":\"https://www.linkedin.com/in/chws\",\"faviconUrl\":\"\"}'\n"),
		0o755,
	); err != nil {
		t.Fatal(err)
	}

	fetcher := NewWithOptions(Options{
		Timeout:        time.Second,
		ObscuraEnabled: true,
		ObscuraPath:    obscuraPath,
	})
	if _, err := fetcher.fetchWithObscura(context.Background(), "https://www.linkedin.com/in/chws/"); err == nil {
		t.Fatal("expected empty path metadata to be rejected")
	}
}

func TestParseOEmbedMetadataUsesReadableHTML(t *testing.T) {
	result, err := parseOEmbedMetadata(
		[]byte(`{
			"author_name":"Frederik",
			"provider_name":"X",
			"url":"https://twitter.com/froessell/status/2024028482053853349",
			"html":"<blockquote><p><a href=\"https://t.co/al8ZE594vu\">detail.design</a> is the kind of resource I wish existed 10 years ago.<br><br>A curated collection of tiny UI details</p></blockquote>"
		}`),
		"https://x.com/froessell/status/2024028482053853349?s=46",
		"X",
	)
	if err != nil {
		t.Fatal(err)
	}

	expectedText := "detail.design is the kind of resource I wish existed 10 years ago. A curated collection of tiny UI details"
	if result.Title != "Frederik on X: "+expectedText {
		t.Fatalf("unexpected title: %q", result.Title)
	}
	if result.Description != expectedText {
		t.Fatalf("unexpected description: %q", result.Description)
	}
	if result.CanonicalURL != "https://twitter.com/froessell/status/2024028482053853349" {
		t.Fatalf("unexpected canonical URL: %q", result.CanonicalURL)
	}
}

func TestWildcardURLMatchMatchesOEmbedSchemes(t *testing.T) {
	if !wildcardURLMatch("https://x.com/*/status/*", "https://x.com/froessell/status/2024028482053853349?s=46") {
		t.Fatal("expected X status URL to match provider scheme")
	}
	if !wildcardURLMatch("https://*.twitter.com/*/status/*", "https://mobile.twitter.com/froessell/status/2024028482053853349") {
		t.Fatal("expected Twitter subdomain status URL to match provider scheme")
	}
	if wildcardURLMatch("https://x.com/*/status/*", "https://example.com/froessell/status/2024028482053853349") {
		t.Fatal("expected different host not to match")
	}
}

func TestFetchUsesObscuraForGenericSocialPathMetadata(t *testing.T) {
	tempDir := t.TempDir()
	obscuraPath := filepath.Join(tempDir, "obscura")
	if err := os.WriteFile(
		obscuraPath,
		[]byte("#!/bin/sh\nprintf '%s\\n' '{\"title\":\"Eric Park (@ericjypark) - Instagram photos and videos\",\"description\":\"\",\"canonicalUrl\":\"https://www.instagram.com/ericjypark/\",\"faviconUrl\":\"https://static.cdninstagram.com/favicon.webp\"}'\n"),
		0o755,
	); err != nil {
		t.Fatal(err)
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()

	server := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(`<html><head><title>Instagram</title><link rel="icon" href="/favicon.ico"></head></html>`))
		}),
	}
	defer server.Close()
	go func() {
		_ = server.Serve(listener)
	}()

	port := strconv.Itoa(listener.Addr().(*net.TCPAddr).Port)
	fetcher := NewWithOptions(Options{
		Timeout:        time.Second,
		ObscuraEnabled: true,
		ObscuraPath:    obscuraPath,
		OEmbedDisabled: true,
		HostResolveOverrides: map[string][]netip.Addr{
			"www.instagram.com": {netip.MustParseAddr("127.0.0.1")},
		},
	})

	result, err := fetcher.Fetch(context.Background(), fmt.Sprintf("http://www.instagram.com:%s/ericjypark/", port))
	if err != nil {
		t.Fatal(err)
	}

	if result.Title != "Eric Park (@ericjypark) - Instagram photos and videos" {
		t.Fatalf("unexpected title: %q", result.Title)
	}
	if result.CanonicalURL != "https://www.instagram.com/ericjypark/" {
		t.Fatalf("unexpected canonical URL: %q", result.CanonicalURL)
	}
	if result.FaviconURL != "https://static.cdninstagram.com/favicon.webp" {
		t.Fatalf("unexpected favicon URL: %q", result.FaviconURL)
	}
}

func TestAntiBot404FallbackOnlyForKnownProfileHosts(t *testing.T) {
	err := FetchError{Code: "HTTP_404", Message: "not found"}
	if !shouldTryBrowserFallbackForError(err, "https://www.linkedin.com/in/chws/") {
		t.Fatal("expected LinkedIn profile 404 to use browser fallback")
	}
	if shouldTryBrowserFallbackForError(err, "https://lobste.rs") {
		t.Fatal("expected root 404 to skip browser fallback")
	}
}

func TestSSRFSafeDialerUsesHostResolveOverride(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()

	accepted := make(chan error, 1)
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			accepted <- err
			return
		}
		_ = conn.Close()
		accepted <- nil
	}()

	port := strconv.Itoa(listener.Addr().(*net.TCPAddr).Port)
	dialer := ssrfSafeDialer{
		timeout: time.Second,
		hostResolveOverrides: map[string][]netip.Addr{
			"example.com": {netip.MustParseAddr("127.0.0.1")},
		},
	}

	conn, err := dialer.DialContext(context.Background(), "tcp", net.JoinHostPort("example.com", port))
	if err != nil {
		t.Fatal(err)
	}
	_ = conn.Close()

	if err := <-accepted; err != nil {
		t.Fatal(err)
	}
}
