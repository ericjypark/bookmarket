package fetcher

import (
	"net/url"
	"testing"
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
