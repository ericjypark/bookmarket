package health

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandler(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	response := httptest.NewRecorder()

	Handler(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", response.Code)
	}

	body := response.Body.String()
	if body != "{\"status\":\"UP\",\"service\":\"metadata-worker\"}\n" {
		t.Fatalf("unexpected body: %s", body)
	}
}
