package fetcher

import (
	"context"
	"net"
	"net/netip"
	"net/url"
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
