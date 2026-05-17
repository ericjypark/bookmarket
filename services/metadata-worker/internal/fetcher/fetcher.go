package fetcher

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"

	"golang.org/x/net/html"
)

const maxMetadataBytes = 1024 * 1024

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
	client *http.Client
}

func New(timeout time.Duration) *Fetcher {
	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&ssrfSafeDialer{
			timeout: timeout,
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

	return &Fetcher{client: client}
}

func (f *Fetcher) Fetch(ctx context.Context, rawURL string) (Result, error) {
	if err := ValidatePublicURL(rawURL); err != nil {
		return Result{}, FetchError{Code: "INVALID_URL", Message: err.Error(), Retryable: false}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return Result{}, FetchError{Code: "INVALID_URL", Message: err.Error(), Retryable: false}
	}
	req.Header.Set("User-Agent", "BookmarketMetadataWorker/1.0")
	req.Header.Set("Accept", "text/html,application/xhtml+xml")

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
	result.FetchedAt = time.Now().UTC()
	if result.CanonicalURL == "" {
		result.CanonicalURL = resp.Request.URL.String()
	}
	if result.Title == "" {
		result.Title = resp.Request.URL.Hostname()
	}
	return result, nil
}

func ParseHTMLMetadata(body string, baseURL *url.URL) Result {
	doc, err := html.Parse(strings.NewReader(body))
	if err != nil {
		return Result{}
	}

	result := Result{}
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.ElementNode {
			switch strings.ToLower(node.Data) {
			case "title":
				if result.Title == "" {
					result.Title = strings.TrimSpace(nodeText(node))
				}
			case "meta":
				name := strings.ToLower(attr(node, "name"))
				property := strings.ToLower(attr(node, "property"))
				content := strings.TrimSpace(attr(node, "content"))
				if result.Description == "" && content != "" && (name == "description" || property == "og:description") {
					result.Description = content
				}
				if result.Title == "" && content != "" && property == "og:title" {
					result.Title = content
				}
			case "link":
				rel := strings.ToLower(attr(node, "rel"))
				href := strings.TrimSpace(attr(node, "href"))
				if href == "" {
					break
				}
				if result.CanonicalURL == "" && rel == "canonical" {
					result.CanonicalURL = resolveURL(baseURL, href)
				}
				if result.FaviconURL == "" && iconRel(rel) {
					result.FaviconURL = resolveURL(baseURL, href)
				}
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(doc)

	result.Title = strings.Join(strings.Fields(result.Title), " ")
	result.Description = strings.Join(strings.Fields(result.Description), " ")
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
	timeout time.Duration
}

func (d *ssrfSafeDialer) DialContext(ctx context.Context, network string, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, err
	}
	ips, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
	if err != nil {
		return nil, err
	}
	var lastErr error
	dialer := net.Dialer{Timeout: d.timeout}
	for _, ip := range ips {
		if !isPublicIP(ip) {
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

func iconRel(rel string) bool {
	for _, part := range strings.Fields(rel) {
		if part == "icon" || part == "shortcut" || part == "apple-touch-icon" {
			return true
		}
	}
	return false
}

func resolveURL(baseURL *url.URL, value string) string {
	parsed, err := url.Parse(value)
	if err != nil {
		return ""
	}
	if baseURL != nil {
		return baseURL.ResolveReference(parsed).String()
	}
	return parsed.String()
}
