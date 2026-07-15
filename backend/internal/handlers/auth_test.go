package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"transcript_app/backend/internal/dtos"
	"transcript_app/backend/internal/services"

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
