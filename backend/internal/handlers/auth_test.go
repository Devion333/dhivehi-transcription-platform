// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: auth_test.go
// Description: Unit tests
// First Written on: 03/07/2026
// Edited on: 21/07/2026
package handlers

import (
	"bytes"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"transcript_app/backend/internal/dtos"
	"transcript_app/backend/internal/services"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/gin-gonic/gin"
)

func TestRequireRoleForbidsNonAdmin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/admin-test", func(c *gin.Context) {
		c.Set(authUserContextKey, dtos.AuthUser{ID: "u1", Role: "user"})
	}, RequireRole("admin"), func(c *gin.Context) {
		c.Status(http.StatusOK)
	})
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/admin-test", nil))
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", recorder.Code)
	}
}

func TestRequireRolePermitsAdmin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/admin-test", func(c *gin.Context) {
		c.Set(authUserContextKey, dtos.AuthUser{ID: "u1", Role: "admin"})
	}, RequireRole("admin"), func(c *gin.Context) {
		c.Status(http.StatusOK)
	})
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/admin-test", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
}

func TestRequireRoleUnauthenticatedReturns401(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/admin-test", RequireRole("admin"), func(c *gin.Context) {
		c.Status(http.StatusOK)
	})
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/admin-test", nil))
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", recorder.Code)
	}
}

func TestSessionCookieAttributes(t *testing.T) {
	t.Setenv("SESSION_COOKIE_NAME", "transcript_session_test")
	t.Setenv("SESSION_SECURE", "true")
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	setSessionCookie(c, "raw-token")
	cookies := recorder.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("expected one cookie, got %d", len(cookies))
	}
	cookie := cookies[0]
	if cookie.Name != "transcript_session_test" || !cookie.HttpOnly || !cookie.Secure || cookie.SameSite != http.SameSiteLaxMode || cookie.Path != "/" {
		t.Fatalf("unexpected cookie attributes: %#v", cookie)
	}
	if services.HashSessionToken(cookie.Value) == cookie.Value {
		t.Fatal("cookie should contain raw opaque token, not stored hash")
	}
}

func TestClearSessionCookieAttributes(t *testing.T) {
	t.Setenv("SESSION_COOKIE_NAME", "transcript_session_test")
	t.Setenv("SESSION_SECURE", "true")
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	clearSessionCookie(c)
	cookies := recorder.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("expected one cookie, got %d", len(cookies))
	}
	cookie := cookies[0]
	if cookie.Name != "transcript_session_test" || !cookie.HttpOnly || !cookie.Secure || cookie.SameSite != http.SameSiteLaxMode || cookie.Path != "/" || cookie.MaxAge != -1 {
		t.Fatalf("unexpected clearing cookie attributes: %#v", cookie)
	}
}

func TestChangePasswordUnauthenticatedReturns401(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/api/auth/change-password", RequireAuth(), APIChangePassword)
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/auth/change-password", bytes.NewBufferString(`{"currentPassword":"current-password-1","newPassword":"new-password-1","confirmPassword":"new-password-1"}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", recorder.Code)
	}
}

func TestProfileUnauthenticatedReturns401(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/api/account/profile", RequireAuth(), APIGetAccountProfile)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/account/profile", nil))
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", recorder.Code)
	}
}

func TestProfileUpdateRejectsUnknownImmutableFields(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.PATCH("/api/account/profile", setAuthUserForTest, APIUpdateAccountProfile)

	for _, body := range []string{`{"displayName":"Updated","email":"other@example.com"}`, `{"displayName":"Updated","role":"admin"}`, `{"displayName":"Updated","status":"inactive"}`, `{"displayName":"Updated","unknown":true}`} {
		recorder := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPatch, "/api/account/profile", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(recorder, req)
		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 for %s, got %d", body, recorder.Code)
		}
	}
}

func TestProfileUpdateRequiresJSONContentType(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.PATCH("/api/account/profile", setAuthUserForTest, APIUpdateAccountProfile)
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPatch, "/api/account/profile", bytes.NewBufferString(`{"displayName":"Updated"}`))
	router.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("expected 415, got %d", recorder.Code)
	}
}

func TestChangePasswordRejectsConfirmationMismatch(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/api/auth/change-password", setAuthUserForTest, APIChangePassword)
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/auth/change-password", bytes.NewBufferString(`{"currentPassword":"current-password-1","newPassword":"new-password-1","confirmPassword":"other-password"}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", recorder.Code)
	}
	if !strings.Contains(recorder.Body.String(), services.ErrCodePasswordMismatch) {
		t.Fatalf("expected mismatch code, got %s", recorder.Body.String())
	}
}

func TestChangePasswordRejectsMalformedAndOversizedRequests(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/api/auth/change-password", setAuthUserForTest, APIChangePassword)

	malformed := httptest.NewRecorder()
	malformedReq := httptest.NewRequest(http.MethodPost, "/api/auth/change-password", bytes.NewBufferString(`{"currentPassword":"current-password-1","newPassword":"new-password-1","confirmPassword":"new-password-1","extra":true}`))
	malformedReq.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(malformed, malformedReq)
	if malformed.Code != http.StatusBadRequest {
		t.Fatalf("expected malformed 400, got %d", malformed.Code)
	}

	oversized := httptest.NewRecorder()
	oversizedReq := httptest.NewRequest(http.MethodPost, "/api/auth/change-password", bytes.NewBuffer(bytes.Repeat([]byte("a"), authJSONMaxBytes+1)))
	oversizedReq.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(oversized, oversizedReq)
	if oversized.Code != http.StatusBadRequest {
		t.Fatalf("expected oversized 400, got %d", oversized.Code)
	}
}

func TestChangePasswordSuccessAuditsWithoutSensitiveValues(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	services.Database = db
	t.Cleanup(func() { services.Database = nil })
	passwordHash, _ := services.HashPassword("current-password-1")
	now := time.Now()
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT id, name, email, password_hash, role, is_active, created_at, updated_at, last_login_at FROM users WHERE id = $1 FOR UPDATE`)).
		WithArgs("user-id").
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "email", "password_hash", "role", "is_active", "created_at", "updated_at", "last_login_at"}).
			AddRow("user-id", "User", "user@example.com", passwordHash, "user", true, now, now, sql.NullTime{}))
	mock.ExpectExec(regexp.QuoteMeta(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`)).
		WithArgs(sqlmock.AnyArg(), "user-id").WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec(regexp.QuoteMeta(`UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND token_hash <> $2 AND revoked_at IS NULL`)).
		WithArgs("user-id", services.HashSessionToken("current-token")).WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()
	mock.ExpectExec(regexp.QuoteMeta(`INSERT INTO audit_events (id, actor_user_id, actor_name, actor_email, actor_role, action, category, resource_type, resource_id, outcome, ip_address, user_agent, metadata_json) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)`)).
		WithArgs(sqlmock.AnyArg(), "user-id", "User", "user@example.com", "user", "password_change_succeeded", "authentication", "user", "user-id", "success", "192.0.2.1", nil, noPasswordAuditMetadata{}).
		WillReturnResult(sqlmock.NewResult(1, 1))

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/api/auth/change-password", setAuthUserForTest, APIChangePassword)
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/auth/change-password", bytes.NewBufferString(`{"currentPassword":"current-password-1","newPassword":"new-password-1","confirmPassword":"new-password-1"}`))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(&http.Cookie{Name: services.SessionCookieConfig().Name, Value: "current-token"})
	req.RemoteAddr = "192.0.2.1:1234"
	router.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func setAuthUserForTest(c *gin.Context) {
	c.Set(authUserContextKey, dtos.AuthUser{ID: "user-id", Name: "User", Email: "user@example.com", Role: "user"})
}

type noPasswordAuditMetadata struct{}

func (m noPasswordAuditMetadata) Match(value interface{}) bool {
	metadata, ok := value.(string)
	if !ok {
		return false
	}
	lower := strings.ToLower(metadata)
	return !strings.Contains(lower, "password") && !strings.Contains(metadata, "current-password-1") && !strings.Contains(metadata, "new-password-1")
}
