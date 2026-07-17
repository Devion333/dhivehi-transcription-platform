package handlers

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"

	"transcript_app/backend/internal/dtos"
	"transcript_app/backend/internal/services"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gin-gonic/gin"
)

func TestAdminAuditRouteForbidsStandardUser(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/api/admin/audit", func(c *gin.Context) {
		c.Set(authUserContextKey, dtos.AuthUser{ID: "u1", Role: "user"})
	}, RequireRole("admin"), APIAdminListAuditEvents)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/admin/audit", nil))
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", recorder.Code)
	}
}

func TestPDFExportAuditEndpointAcceptsOnlySafeFields(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	services.Database = db
	t.Cleanup(func() { services.Database = nil })
	mock.ExpectExec(regexp.QuoteMeta(`INSERT INTO audit_events (id, actor_user_id, actor_name, actor_email, actor_role, action, category, resource_type, resource_id, outcome, ip_address, user_agent, metadata_json) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)`)).
		WithArgs(sqlmock.AnyArg(), "11111111-1111-1111-1111-111111111111", "Admin", "admin@example.com", "admin", "export.pdf_generated", "export", "transcript", "job-1", "success", "192.0.2.1", "", sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	qdrant := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"result":{"points":[{"id":1,"payload":{"type":"parent","job_id":"job-1"}}]}}`))
	}))
	defer qdrant.Close()
	t.Setenv("QDRANT_HOST", qdrant.URL)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/api/audit/pdf-export", func(c *gin.Context) {
		c.Set(authUserContextKey, dtos.AuthUser{ID: "11111111-1111-1111-1111-111111111111", Name: "Admin", Email: "admin@example.com", Role: "admin"})
	}, APIAuditPDFExport)
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/audit/pdf-export", bytes.NewBufferString(`{"jobId":"job-1","format":"segmented","includeAnalysis":true,"outcome":"success"}`))
	req.Header.Set("Content-Type", "application/json")
	req.RemoteAddr = "192.0.2.1:1234"
	router.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestPDFExportAuditRejectsInvalidOutcome(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/api/audit/pdf-export", func(c *gin.Context) {
		c.Set(authUserContextKey, dtos.AuthUser{ID: "u1", Role: "admin"})
	}, APIAuditPDFExport)
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/audit/pdf-export", bytes.NewBufferString(`{"jobId":"job-1","format":"segmented","outcome":"other"}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", recorder.Code)
	}
}
