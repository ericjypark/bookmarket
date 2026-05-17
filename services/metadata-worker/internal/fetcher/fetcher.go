package fetcher

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/html"
)

const maxMetadataBytes = 1024 * 1024
const browserUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"

const browserMetadataExpression = `JSON.stringify((() => {
  const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
  const attr = (selector, name = 'content') => {
    const element = document.querySelector(selector);
    return element ? clean(element.getAttribute(name)) : '';
  };
  const resolve = (value) => {
    if (!value || value.startsWith('data:')) return '';
    try { return new URL(value, document.baseURI).href; } catch { return ''; }
  };
  const faviconSelectors = [
    'link[rel~="icon"][type="image/svg+xml"]',
    'link[rel~="icon"][sizes="32x32"]',
    'link[rel~="icon"][sizes="16x16"]',
    'link[rel~="icon"]',
    'link[rel="shortcut icon"]',
    'link[rel~="apple-touch-icon"]',
    'link[rel~="apple-touch-icon-precomposed"]'
  ];
  const favicon = faviconSelectors.map((selector) => resolve(attr(selector, 'href'))).find(Boolean) || '';
  return {
    title: attr('meta[property="og:title"]') || attr('meta[name="og:title"]') || attr('meta[name="twitter:title"]') || clean(document.title),
    description: attr('meta[property="og:description"]') || attr('meta[name="og:description"]') || attr('meta[name="twitter:description"]') || attr('meta[name="description"]'),
    canonicalUrl: resolve(attr('link[rel="canonical"]', 'href')) || attr('meta[property="og:url"]') || attr('meta[name="twitter:url"]') || document.location.href,
    faviconUrl: favicon
  };
})())`

type Result struct {
	CanonicalURL string
	Title        string
	Description  string
	FaviconURL   string
	FetchedAt    time.Time
}

type FetchError struct {
	Code      string
	Message   string
	Retryable bool
}

func (e FetchError) Error() string {
	return e.Message
}

type Fetcher struct {
	client             *http.Client
	timeout            time.Duration
	obscuraEnabled     bool
	obscuraPath        string
	obscuraStealth     bool
	oembedProvidersURL string
	oembedDisabled     bool
	oembedMu           sync.Mutex
	oembedProviders    []oEmbedProvider
	oembedLoaded       bool
}

type Options struct {
	Timeout              time.Duration
	HostResolveOverrides map[string][]netip.Addr
	ObscuraEnabled       bool
	ObscuraPath          string
	ObscuraStealth       bool
	OEmbedProvidersURL   string
	OEmbedDisabled       bool
}

func New(timeout time.Duration) *Fetcher {
	return NewWithHostResolveOverrides(timeout, nil)
}

func NewWithHostResolveOverrides(timeout time.Duration, overrides map[string][]netip.Addr) *Fetcher {
	return NewWithOptions(Options{
		Timeout:              timeout,
		HostResolveOverrides: overrides,
	})
}

func NewWithOptions(options Options) *Fetcher {
	timeout := options.Timeout
	if timeout <= 0 {
		timeout = 8 * time.Second
	}

	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&ssrfSafeDialer{
			timeout:              timeout,
			hostResolveOverrides: normalizeHostResolveOverrides(options.HostResolveOverrides),
		}).DialContext,
		ResponseHeaderTimeout: timeout,
		IdleConnTimeout:       30 * time.Second,
		TLSHandshakeTimeout:   timeout,
	}

	client := &http.Client{
		Timeout:   timeout,
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 3 {
				return errors.New("metadata redirect limit exceeded")
			}
			return ValidatePublicURL(req.URL.String())
		},
	}

	return &Fetcher{
		client:             client,
		timeout:            timeout,
		obscuraEnabled:     options.ObscuraEnabled,
		obscuraPath:        firstNonEmpty(options.ObscuraPath, "obscura"),
		obscuraStealth:     options.ObscuraStealth,
		oembedProvidersURL: firstNonEmpty(options.OEmbedProvidersURL, "https://oembed.com/providers.json"),
		oembedDisabled:     options.OEmbedDisabled,
	}
}

func (f *Fetcher) Fetch(ctx context.Context, rawURL string) (Result, error) {
	if err := ValidatePublicURL(rawURL); err != nil {
		return Result{}, FetchError{Code: "INVALID_URL", Message: err.Error(), Retryable: false}
	}

	result, err := f.fetchOverHTTP(ctx, rawURL)
	if err == nil {
		if shouldTryBrowserFallbackForResult(result, rawURL) {
			if oembedResult, oembedErr := f.fetchWithOEmbed(ctx, rawURL); oembedErr == nil {
				oembedResult.FaviconURL = firstNonEmpty(oembedResult.FaviconURL, result.FaviconURL)
				return oembedResult, nil
			}
			if browserResult, browserErr := f.fetchWithObscura(ctx, rawURL); browserErr == nil {
				return browserResult, nil
			}
		}
		return result, nil
	}

	if shouldTryBrowserFallbackForError(err, rawURL) {
		if oembedResult, oembedErr := f.fetchWithOEmbed(ctx, rawURL); oembedErr == nil {
			return oembedResult, nil
		}
		if browserResult, browserErr := f.fetchWithObscura(ctx, rawURL); browserErr == nil {
			return browserResult, nil
		}
	}

	return Result{}, err
}

func (f *Fetcher) fetchOverHTTP(ctx context.Context, rawURL string) (Result, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return Result{}, FetchError{Code: "INVALID_URL", Message: err.Error(), Retryable: false}
	}
	req.Header.Set("User-Agent", browserUserAgent)
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Cache-Control", "no-cache")

	resp, err := f.client.Do(req)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) || strings.Contains(strings.ToLower(err.Error()), "timeout") {
			return Result{}, FetchError{Code: "TIMEOUT", Message: "Metadata fetch timed out", Retryable: true}
		}
		return Result{}, FetchError{Code: "FETCH_FAILED", Message: err.Error(), Retryable: true}
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		retryable := resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500
		return Result{}, FetchError{
			Code:      fmt.Sprintf("HTTP_%d", resp.StatusCode),
			Message:   fmt.Sprintf("Metadata fetch returned HTTP %d", resp.StatusCode),
			Retryable: retryable,
		}
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxMetadataBytes))
	if err != nil {
		return Result{}, FetchError{Code: "READ_FAILED", Message: err.Error(), Retryable: true}
	}

	result := ParseHTMLMetadata(string(body), resp.Request.URL)
	return finalizeResult(result, resp.Request.URL, time.Now().UTC()), nil
}

func (f *Fetcher) fetchWithObscura(ctx context.Context, rawURL string) (Result, error) {
	if !f.obscuraEnabled {
		return Result{}, FetchError{Code: "BROWSER_UNAVAILABLE", Message: "Obscura metadata fallback is disabled", Retryable: false}
	}

	obscuraPath, err := exec.LookPath(f.obscuraPath)
	if err != nil {
		return Result{}, FetchError{Code: "BROWSER_UNAVAILABLE", Message: "Obscura binary is not available", Retryable: false}
	}

	timeoutSeconds := int(f.timeout.Seconds())
	if timeoutSeconds < 1 {
		timeoutSeconds = 8
	}

	args := []string{
		"fetch",
		rawURL,
		"--eval",
		browserMetadataExpression,
		"--wait-until",
		"networkidle0",
		"--timeout",
		strconv.Itoa(timeoutSeconds),
		"--quiet",
	}
	if f.obscuraStealth {
		args = append(args, "--stealth")
	}

	commandCtx, cancel := context.WithTimeout(ctx, f.timeout+2*time.Second)
	defer cancel()

	cmd := exec.CommandContext(commandCtx, obscuraPath, args...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		message := cleanText(stderr.String(), 500)
		if message == "" {
			message = err.Error()
		}
		return Result{}, FetchError{Code: "BROWSER_FETCH_FAILED", Message: message, Retryable: true}
	}

	metadata, err := parseBrowserMetadata(stdout.Bytes())
	if err != nil {
		return Result{}, FetchError{Code: "BROWSER_PARSE_FAILED", Message: err.Error(), Retryable: true}
	}

	baseURL, _ := url.Parse(rawURL)
	if isEmptyRenderedPathMetadata(metadata, baseURL) {
		return Result{}, FetchError{Code: "BROWSER_WEAK_METADATA", Message: "Obscura returned no page-specific metadata", Retryable: true}
	}
	result := Result{
		Title:        metadata.Title,
		Description:  metadata.Description,
		CanonicalURL: resolveURL(baseURL, metadata.CanonicalURL),
		FaviconURL:   resolveURL(baseURL, metadata.FaviconURL),
	}
	finalized := finalizeResult(result, baseURL, time.Now().UTC())
	if isWeakRenderedMetadata(finalized, baseURL) {
		return Result{}, FetchError{Code: "BROWSER_WEAK_METADATA", Message: "Obscura returned only generic site metadata", Retryable: true}
	}
	return finalized, nil
}

func (f *Fetcher) fetchWithOEmbed(ctx context.Context, rawURL string) (Result, error) {
	endpoint, ok, err := f.oEmbedEndpointForURL(ctx, rawURL)
	if err != nil {
		return Result{}, err
	}
	if !ok {
		return Result{}, FetchError{Code: "OEMBED_UNAVAILABLE", Message: "No oEmbed provider matched URL", Retryable: false}
	}

	endpointURL, err := url.Parse(endpoint.URL)
	if err != nil {
		return Result{}, FetchError{Code: "OEMBED_INVALID_PROVIDER", Message: err.Error(), Retryable: false}
	}
	query := endpointURL.Query()
	query.Set("url", rawURL)
	query.Set("format", "json")
	query.Set("omit_script", "1")
	query.Set("dnt", "1")
	endpointURL.RawQuery = query.Encode()

	if err := ValidatePublicURL(endpointURL.String()); err != nil {
		return Result{}, FetchError{Code: "OEMBED_INVALID_PROVIDER", Message: err.Error(), Retryable: false}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpointURL.String(), nil)
	if err != nil {
		return Result{}, FetchError{Code: "OEMBED_FETCH_FAILED", Message: err.Error(), Retryable: true}
	}
	req.Header.Set("User-Agent", browserUserAgent)
	req.Header.Set("Accept", "application/json,text/json;q=0.9,*/*;q=0.8")

	resp, err := f.client.Do(req)
	if err != nil {
		return Result{}, FetchError{Code: "OEMBED_FETCH_FAILED", Message: err.Error(), Retryable: true}
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return Result{}, FetchError{
			Code:      fmt.Sprintf("OEMBED_HTTP_%d", resp.StatusCode),
			Message:   fmt.Sprintf("oEmbed fetch returned HTTP %d", resp.StatusCode),
			Retryable: resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500,
		}
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxMetadataBytes))
	if err != nil {
		return Result{}, FetchError{Code: "OEMBED_READ_FAILED", Message: err.Error(), Retryable: true}
	}

	result, err := parseOEmbedMetadata(body, rawURL, endpoint.ProviderName)
	if err != nil {
		return Result{}, FetchError{Code: "OEMBED_PARSE_FAILED", Message: err.Error(), Retryable: true}
	}
	baseURL, _ := url.Parse(rawURL)
	return finalizeResult(result, baseURL, time.Now().UTC()), nil
}

func (f *Fetcher) oEmbedEndpointForURL(ctx context.Context, rawURL string) (oEmbedEndpoint, bool, error) {
	providers, err := f.loadOEmbedProviders(ctx)
	if err != nil {
		return oEmbedEndpoint{}, false, err
	}
	for _, provider := range providers {
		for _, endpoint := range provider.Endpoints {
			for _, scheme := range endpoint.Schemes {
				if wildcardURLMatch(scheme, rawURL) {
					endpoint.ProviderName = provider.ProviderName
					return endpoint, true, nil
				}
			}
		}
	}
	return oEmbedEndpoint{}, false, nil
}

func (f *Fetcher) loadOEmbedProviders(ctx context.Context) ([]oEmbedProvider, error) {
	f.oembedMu.Lock()
	defer f.oembedMu.Unlock()

	if f.oembedLoaded {
		return f.oembedProviders, nil
	}
	if f.oembedDisabled {
		return nil, FetchError{Code: "OEMBED_UNAVAILABLE", Message: "oEmbed provider registry is disabled", Retryable: false}
	}
	if f.oembedProvidersURL == "" {
		return nil, FetchError{Code: "OEMBED_UNAVAILABLE", Message: "oEmbed provider registry is disabled", Retryable: false}
	}
	if err := ValidatePublicURL(f.oembedProvidersURL); err != nil {
		return nil, FetchError{Code: "OEMBED_INVALID_REGISTRY", Message: err.Error(), Retryable: false}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, f.oembedProvidersURL, nil)
	if err != nil {
		return nil, FetchError{Code: "OEMBED_REGISTRY_FETCH_FAILED", Message: err.Error(), Retryable: true}
	}
	req.Header.Set("User-Agent", browserUserAgent)
	req.Header.Set("Accept", "application/json")

	resp, err := f.client.Do(req)
	if err != nil {
		return nil, FetchError{Code: "OEMBED_REGISTRY_FETCH_FAILED", Message: err.Error(), Retryable: true}
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, FetchError{
			Code:      fmt.Sprintf("OEMBED_REGISTRY_HTTP_%d", resp.StatusCode),
			Message:   fmt.Sprintf("oEmbed provider registry returned HTTP %d", resp.StatusCode),
			Retryable: resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500,
		}
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxMetadataBytes))
	if err != nil {
		return nil, FetchError{Code: "OEMBED_REGISTRY_READ_FAILED", Message: err.Error(), Retryable: true}
	}

	var providers []oEmbedProvider
	if err := json.Unmarshal(body, &providers); err != nil {
		return nil, FetchError{Code: "OEMBED_REGISTRY_PARSE_FAILED", Message: err.Error(), Retryable: true}
	}
	f.oembedProviders = providers
	f.oembedLoaded = true
	return f.oembedProviders, nil
}

type browserMetadata struct {
	Title        string `json:"title"`
	Description  string `json:"description"`
	CanonicalURL string `json:"canonicalUrl"`
	FaviconURL   string `json:"faviconUrl"`
}

type oEmbedProvider struct {
	ProviderName string           `json:"provider_name"`
	Endpoints    []oEmbedEndpoint `json:"endpoints"`
}

type oEmbedEndpoint struct {
	ProviderName string
	Schemes      []string `json:"schemes"`
	URL          string   `json:"url"`
}

type oEmbedMetadata struct {
	Title        string `json:"title"`
	AuthorName   string `json:"author_name"`
	AuthorURL    string `json:"author_url"`
	HTML         string `json:"html"`
	URL          string `json:"url"`
	ProviderName string `json:"provider_name"`
	ProviderURL  string `json:"provider_url"`
}

func parseBrowserMetadata(output []byte) (browserMetadata, error) {
	trimmed := bytes.TrimSpace(output)
	if len(trimmed) == 0 {
		return browserMetadata{}, fmt.Errorf("Obscura returned empty metadata")
	}
	if trimmed[0] == '"' {
		var encoded string
		if err := json.Unmarshal(trimmed, &encoded); err == nil {
			trimmed = bytes.TrimSpace([]byte(encoded))
		}
	}

	start := bytes.IndexByte(trimmed, '{')
	end := bytes.LastIndexByte(trimmed, '}')
	if start < 0 || end < start {
		return browserMetadata{}, fmt.Errorf("Obscura returned non-JSON metadata")
	}

	var metadata browserMetadata
	if err := json.Unmarshal(trimmed[start:end+1], &metadata); err != nil {
		return browserMetadata{}, err
	}
	return metadata, nil
}

func parseOEmbedMetadata(output []byte, rawURL string, providerName string) (Result, error) {
	var metadata oEmbedMetadata
	if err := json.Unmarshal(bytes.TrimSpace(output), &metadata); err != nil {
		return Result{}, err
	}

	providerName = firstNonEmpty(metadata.ProviderName, providerName, "oEmbed")
	text := firstNonEmpty(metadata.Title, textFromOEmbedHTML(metadata.HTML))
	text = cleanText(text, 1000)
	author := cleanText(metadata.AuthorName, 120)

	title := text
	if author != "" && text != "" {
		title = author + " on " + providerName + ": " + text
	} else if author != "" {
		title = author + " on " + providerName
	}
	if title == "" {
		return Result{}, fmt.Errorf("oEmbed metadata did not include a title or readable HTML")
	}

	canonicalURL := firstNonEmpty(metadata.URL, rawURL)
	return Result{
		Title:        cleanText(title, 500),
		Description:  text,
		CanonicalURL: canonicalURL,
	}, nil
}

func textFromOEmbedHTML(markup string) string {
	if strings.TrimSpace(markup) == "" {
		return ""
	}
	doc, err := html.Parse(strings.NewReader(markup))
	if err != nil {
		return ""
	}

	if text := firstElementText(doc, "p"); text != "" {
		return text
	}
	if text := firstElementText(doc, "blockquote"); text != "" {
		return text
	}
	return readableNodeText(doc)
}

func firstElementText(node *html.Node, tag string) string {
	var result string
	var walk func(*html.Node)
	walk = func(current *html.Node) {
		if result != "" {
			return
		}
		if current.Type == html.ElementNode && strings.EqualFold(current.Data, tag) {
			result = readableNodeText(current)
			return
		}
		for child := current.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(node)
	return result
}

func readableNodeText(node *html.Node) string {
	var builder strings.Builder
	var walk func(*html.Node)
	walk = func(current *html.Node) {
		if current.Type == html.TextNode {
			builder.WriteString(current.Data)
			builder.WriteByte(' ')
		}
		if current.Type == html.ElementNode && (strings.EqualFold(current.Data, "br") || strings.EqualFold(current.Data, "p") || strings.EqualFold(current.Data, "div")) {
			builder.WriteByte(' ')
		}
		for child := current.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(node)
	return cleanText(builder.String(), 1000)
}

func shouldTryBrowserFallbackForError(err error, rawURL string) bool {
	var fetchErr FetchError
	if !errors.As(err, &fetchErr) {
		return true
	}

	switch fetchErr.Code {
	case "HTTP_401", "HTTP_403", "HTTP_405", "HTTP_429", "HTTP_999":
		return true
	case "HTTP_404":
		return isLikelyAntiBot404(rawURL)
	default:
		return false
	}
}

func shouldTryBrowserFallbackForResult(result Result, rawURL string) bool {
	title := strings.ToLower(strings.TrimSpace(result.Title))
	if title == "" || title == "just a moment..." || title == "attention required! | cloudflare" {
		return true
	}

	parsed, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	return isWeakRenderedMetadata(result, parsed)
}

func isWeakRenderedMetadata(result Result, finalURL *url.URL) bool {
	if finalURL == nil || strings.Trim(finalURL.Path, "/") == "" || result.Description != "" {
		return false
	}

	host := strings.TrimPrefix(strings.ToLower(finalURL.Hostname()), "www.")
	hostLabel := strings.Split(host, ".")[0]
	title := strings.ToLower(strings.TrimSpace(result.Title))
	return title == host || title == hostLabel || title == strings.ToLower(titleFromURL(finalURL))
}

func isEmptyRenderedPathMetadata(metadata browserMetadata, finalURL *url.URL) bool {
	if finalURL == nil || strings.Trim(finalURL.Path, "/") == "" {
		return false
	}
	return strings.TrimSpace(metadata.Title) == "" && strings.TrimSpace(metadata.Description) == ""
}

func isLikelyAntiBot404(rawURL string) bool {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	if strings.Trim(parsed.Path, "/") == "" {
		return false
	}

	host := strings.TrimPrefix(strings.ToLower(parsed.Hostname()), "www.")
	switch host {
	case "linkedin.com", "instagram.com", "facebook.com", "threads.net", "tiktok.com", "x.com", "twitter.com":
		return true
	default:
		return false
	}
}

func finalizeResult(result Result, finalURL *url.URL, fetchedAt time.Time) Result {
	result.Title = cleanText(result.Title, 500)
	result.Description = cleanText(result.Description, 1000)
	result.FaviconURL = strings.TrimSpace(result.FaviconURL)
	result.CanonicalURL = strings.TrimSpace(result.CanonicalURL)
	result.FetchedAt = fetchedAt

	if result.CanonicalURL == "" && finalURL != nil {
		result.CanonicalURL = finalURL.String()
	}
	if result.Title == "" && finalURL != nil {
		result.Title = titleFromURL(finalURL)
	}
	if result.FaviconURL == "" && finalURL != nil {
		result.FaviconURL = googleFaviconURL(finalURL)
	}
	return result
}

func ParseHTMLMetadata(body string, baseURL *url.URL) Result {
	doc, err := html.Parse(strings.NewReader(body))
	if err != nil {
		return Result{}
	}

	type candidates struct {
		title            string
		ogTitle          string
		twitterTitle     string
		description      string
		ogDescription    string
		twitterDesc      string
		canonicalURL     string
		ogURL            string
		twitterURL       string
		jsonLDTitle      string
		jsonLDDesc       string
		jsonLDURL        string
		jsonLDFaviconURL string
		faviconURL       string
		faviconRank      int
	}

	found := candidates{faviconRank: 1000}
	result := Result{}
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.ElementNode {
			switch strings.ToLower(node.Data) {
			case "title":
				if found.title == "" {
					found.title = nodeText(node)
				}
			case "meta":
				name := strings.ToLower(attr(node, "name"))
				property := strings.ToLower(attr(node, "property"))
				content := strings.TrimSpace(attr(node, "content"))
				switch {
				case content == "":
				case property == "og:title":
					found.ogTitle = firstNonEmpty(found.ogTitle, content)
				case name == "og:title":
					found.ogTitle = firstNonEmpty(found.ogTitle, content)
				case name == "twitter:title":
					found.twitterTitle = firstNonEmpty(found.twitterTitle, content)
				case property == "og:description":
					found.ogDescription = firstNonEmpty(found.ogDescription, content)
				case name == "og:description":
					found.ogDescription = firstNonEmpty(found.ogDescription, content)
				case name == "twitter:description":
					found.twitterDesc = firstNonEmpty(found.twitterDesc, content)
				case name == "description":
					found.description = firstNonEmpty(found.description, content)
				case property == "og:url":
					found.ogURL = firstNonEmpty(found.ogURL, content)
				case name == "twitter:url":
					found.twitterURL = firstNonEmpty(found.twitterURL, content)
				}
			case "link":
				rel := strings.ToLower(attr(node, "rel"))
				href := strings.TrimSpace(attr(node, "href"))
				if href == "" {
					break
				}
				if found.canonicalURL == "" && relContains(rel, "canonical") {
					found.canonicalURL = resolveURL(baseURL, href)
				}
				if rank := iconRank(rel, strings.ToLower(attr(node, "type")), strings.ToLower(attr(node, "sizes"))); rank < found.faviconRank {
					if resolved := resolveURL(baseURL, href); resolved != "" {
						found.faviconURL = resolved
						found.faviconRank = rank
					}
				}
			case "script":
				if strings.Contains(strings.ToLower(attr(node, "type")), "ld+json") {
					title, description, canonicalURL, faviconURL := parseJSONLDMetadata(nodeText(node))
					found.jsonLDTitle = firstNonEmpty(found.jsonLDTitle, title)
					found.jsonLDDesc = firstNonEmpty(found.jsonLDDesc, description)
					found.jsonLDURL = firstNonEmpty(found.jsonLDURL, resolveURL(baseURL, canonicalURL))
					found.jsonLDFaviconURL = firstNonEmpty(found.jsonLDFaviconURL, resolveURL(baseURL, faviconURL))
				}
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(doc)

	result.Title = cleanText(firstNonEmpty(found.ogTitle, found.twitterTitle, found.jsonLDTitle, found.title), 500)
	result.Description = cleanText(firstNonEmpty(found.ogDescription, found.twitterDesc, found.description, found.jsonLDDesc), 1000)
	result.CanonicalURL = firstNonEmpty(found.canonicalURL, found.ogURL, found.twitterURL, found.jsonLDURL)
	result.FaviconURL = firstNonEmpty(found.faviconURL, found.jsonLDFaviconURL)

	return result
}

func ValidatePublicURL(rawURL string) error {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return err
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return fmt.Errorf("metadata URL must use http or https")
	}
	if parsed.Hostname() == "" {
		return fmt.Errorf("metadata URL must include a hostname")
	}

	ips, err := net.DefaultResolver.LookupNetIP(context.Background(), "ip", parsed.Hostname())
	if err != nil {
		return fmt.Errorf("metadata URL host could not be resolved: %w", err)
	}
	for _, ip := range ips {
		if !isPublicIP(ip) {
			return fmt.Errorf("metadata URL resolves to a restricted address")
		}
	}
	return nil
}

type ssrfSafeDialer struct {
	timeout              time.Duration
	hostResolveOverrides map[string][]netip.Addr
}

func (d *ssrfSafeDialer) DialContext(ctx context.Context, network string, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, err
	}

	ips, usingOverride, err := d.resolveHost(ctx, host)
	if err != nil {
		return nil, err
	}

	var lastErr error
	dialer := net.Dialer{Timeout: d.timeout}
	for _, ip := range ips {
		if !usingOverride && !isPublicIP(ip) {
			lastErr = fmt.Errorf("metadata URL resolves to a restricted address")
			continue
		}
		conn, err := dialer.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
		if err == nil {
			return conn, nil
		}
		lastErr = err
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, fmt.Errorf("metadata URL host has no usable addresses")
}

func (d *ssrfSafeDialer) resolveHost(ctx context.Context, host string) ([]netip.Addr, bool, error) {
	if ips := d.hostResolveOverrides[normalizeHostname(host)]; len(ips) > 0 {
		return ips, true, nil
	}
	ips, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
	return ips, false, err
}

func normalizeHostResolveOverrides(overrides map[string][]netip.Addr) map[string][]netip.Addr {
	normalized := map[string][]netip.Addr{}
	for host, ips := range overrides {
		normalizedHost := normalizeHostname(host)
		if normalizedHost == "" {
			continue
		}
		for _, ip := range ips {
			if ip.IsValid() {
				normalized[normalizedHost] = append(normalized[normalizedHost], ip.Unmap())
			}
		}
	}
	return normalized
}

func normalizeHostname(host string) string {
	return strings.TrimSuffix(strings.ToLower(strings.TrimSpace(host)), ".")
}

func isPublicIP(addr netip.Addr) bool {
	if !addr.IsValid() {
		return false
	}
	addr = addr.Unmap()
	return addr.IsGlobalUnicast() &&
		!addr.IsPrivate() &&
		!addr.IsLoopback() &&
		!addr.IsLinkLocalUnicast() &&
		!addr.IsUnspecified()
}

func nodeText(node *html.Node) string {
	var builder strings.Builder
	var walk func(*html.Node)
	walk = func(current *html.Node) {
		if current.Type == html.TextNode {
			builder.WriteString(current.Data)
		}
		for child := current.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(node)
	return builder.String()
}

func attr(node *html.Node, key string) string {
	for _, attribute := range node.Attr {
		if strings.EqualFold(attribute.Key, key) {
			return attribute.Val
		}
	}
	return ""
}

func relContains(rel string, target string) bool {
	for _, part := range strings.Fields(strings.ToLower(rel)) {
		if part == target {
			return true
		}
	}
	return false
}

func iconRank(rel string, iconType string, sizes string) int {
	if rel == "" {
		return 1000
	}
	if relContains(rel, "icon") {
		switch {
		case iconType == "image/svg+xml":
			return 1
		case strings.Contains(sizes, "32x32"):
			return 2
		case strings.Contains(sizes, "16x16"):
			return 3
		default:
			return 4
		}
	}
	if relContains(rel, "shortcut") {
		return 5
	}
	if relContains(rel, "apple-touch-icon") || relContains(rel, "apple-touch-icon-precomposed") {
		return 6
	}
	return 1000
}

func resolveURL(baseURL *url.URL, value string) string {
	value = strings.TrimSpace(value)
	if value == "" || strings.HasPrefix(strings.ToLower(value), "data:") {
		return ""
	}
	parsed, err := url.Parse(value)
	if err != nil {
		return ""
	}
	if baseURL != nil {
		return baseURL.ResolveReference(parsed).String()
	}
	return parsed.String()
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func cleanText(value string, maxLen int) string {
	cleaned := strings.Join(strings.Fields(value), " ")
	if maxLen > 0 && len(cleaned) > maxLen {
		return cleaned[:maxLen]
	}
	return cleaned
}

func titleFromURL(value *url.URL) string {
	host := strings.TrimPrefix(value.Hostname(), "www.")
	if host == "" {
		return value.String()
	}

	pathParts := strings.FieldsFunc(strings.Trim(value.Path, "/"), func(r rune) bool {
		return r == '/' || r == '-' || r == '_' || r == '.'
	})
	if len(pathParts) > 0 {
		lastPart := pathParts[len(pathParts)-1]
		if lastPart != "" && len(lastPart) <= 80 {
			return cleanText(host+" / "+lastPart, 120)
		}
	}
	return host
}

func googleFaviconURL(value *url.URL) string {
	host := value.Hostname()
	if host == "" {
		return ""
	}
	return "https://www.google.com/s2/favicons?domain=" + url.QueryEscape(host) + "&sz=64"
}

func wildcardURLMatch(pattern string, value string) bool {
	pattern = strings.TrimSpace(pattern)
	value = strings.TrimSpace(value)
	if pattern == "" || value == "" {
		return false
	}
	quoted := regexp.QuoteMeta(pattern)
	quoted = strings.ReplaceAll(quoted, `\*`, ".*")
	matched, err := regexp.MatchString("(?i)^"+quoted+"$", value)
	return err == nil && matched
}

func parseJSONLDMetadata(raw string) (title string, description string, canonicalURL string, faviconURL string) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", "", "", ""
	}

	var payload any
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return "", "", "", ""
	}
	return walkJSONLD(payload)
}

func walkJSONLD(value any) (title string, description string, canonicalURL string, faviconURL string) {
	switch typed := value.(type) {
	case []any:
		for _, item := range typed {
			otherTitle, otherDescription, otherCanonicalURL, otherFaviconURL := walkJSONLD(item)
			title, description, canonicalURL, faviconURL = mergeMetadata(
				title,
				description,
				canonicalURL,
				faviconURL,
				otherTitle,
				otherDescription,
				otherCanonicalURL,
				otherFaviconURL,
			)
			if title != "" && description != "" && canonicalURL != "" && faviconURL != "" {
				return title, description, canonicalURL, faviconURL
			}
		}
	case map[string]any:
		title = firstNonEmpty(stringValue(typed["headline"]), stringValue(typed["name"]))
		description = stringValue(typed["description"])
		canonicalURL = stringValue(typed["url"])
		faviconURL = firstNonEmpty(stringValue(typed["logo"]), stringValue(typed["publisher"]))
		if graph, ok := typed["@graph"]; ok {
			otherTitle, otherDescription, otherCanonicalURL, otherFaviconURL := walkJSONLD(graph)
			title, description, canonicalURL, faviconURL = mergeMetadata(
				title,
				description,
				canonicalURL,
				faviconURL,
				otherTitle,
				otherDescription,
				otherCanonicalURL,
				otherFaviconURL,
			)
		}
	}
	return title, description, canonicalURL, faviconURL
}

func mergeMetadata(title string, description string, canonicalURL string, faviconURL string, otherTitle string, otherDescription string, otherCanonicalURL string, otherFaviconURL string) (string, string, string, string) {
	return firstNonEmpty(title, otherTitle),
		firstNonEmpty(description, otherDescription),
		firstNonEmpty(canonicalURL, otherCanonicalURL),
		firstNonEmpty(faviconURL, otherFaviconURL)
}

func stringValue(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case map[string]any:
		return firstNonEmpty(stringValue(typed["url"]), stringValue(typed["@id"]), stringValue(typed["name"]))
	case []any:
		for _, item := range typed {
			if value := stringValue(item); value != "" {
				return value
			}
		}
	}
	return ""
}
