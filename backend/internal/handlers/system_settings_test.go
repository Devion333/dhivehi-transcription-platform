package handlers

import (
	"bytes"
	"context"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"transcript_app/backend/internal/dtos"
	"transcript_app/backend/internal/services"

	"github.com/gin-gonic/gin"
)

func TestAdminSettingsRoutesRejectNonAdminAndAllowAdmin(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/api/admin/settings", func(c *gin.Context) {
		c.Set(authUserContextKey, dtos.AuthUser{ID: "user", Role: services.UserRoleUser})
	}, RequireRole(services.UserRoleAdmin), APIAdminGetSettings)
	userRecorder := httptest.NewRecorder()
	router.ServeHTTP(userRecorder, httptest.NewRequest(http.MethodGet, "/api/admin/settings", nil))
	if userRecorder.Code != http.StatusForbidden {
		t.Fatalf("expected non-admin 403, got %d", userRecorder.Code)
	}

	router = gin.New()
	router.GET("/api/admin/settings", func(c *gin.Context) {
		c.Set(authUserContextKey, dtos.AuthUser{ID: "admin", Role: services.UserRoleAdmin})
	}, RequireRole(services.UserRoleAdmin), APIAdminGetSettings)
	adminRecorder := httptest.NewRecorder()
	router.ServeHTTP(adminRecorder, httptest.NewRequest(http.MethodGet, "/api/admin/settings", nil))
	if adminRecorder.Code != http.StatusOK {
		t.Fatalf("expected admin 200, got %d body=%s", adminRecorder.Code, adminRecorder.Body.String())
	}
}

func TestAdminUpdateSettingsRejectsInvalidUpdate(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.PUT("/api/admin/settings", func(c *gin.Context) {
		c.Set(authUserContextKey, dtos.AuthUser{ID: "admin", Role: services.UserRoleAdmin})
	}, APIAdminUpdateSettings)
	recorder := httptest.NewRecorder()
	body := `{"uploadsEnabled":true,"maximumUploadSizeMb":0,"allowedUploadFormats":["mp3"],"enabledDownloadFormats":["txt"],"enabledAnalysisOutputs":["summary"],"maximumProcessingRetries":3,"retryDelayMinutes":5,"sessionDurationMinutes":60,"maximumFailedLoginAttempts":5,"accountLockoutMinutes":15}`
	req := httptest.NewRequest(http.MethodPut, "/api/admin/settings", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected invalid update 400, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestAdminUpdateSettingsRejectsDeprecatedReferenceToggle(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.PUT("/api/admin/settings", func(c *gin.Context) {
		c.Set(authUserContextKey, dtos.AuthUser{ID: "admin", Role: services.UserRoleAdmin})
	}, APIAdminUpdateSettings)
	recorder := httptest.NewRecorder()
	body := `{"requireReferenceNumber":false}`
	req := httptest.NewRequest(http.MethodPut, "/api/admin/settings", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected deprecated reference toggle 400, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestAdminSettingsDoNotExposeDeprecatedRetentionFields(t *testing.T) {
	settings := services.DefaultSystemSettings()
	restore := services.SetSystemSettingsProviderForTest(func(context.Context) (services.SystemSettings, error) { return settings, nil })
	t.Cleanup(restore)
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/api/admin/settings", func(c *gin.Context) {
		c.Set(authUserContextKey, dtos.AuthUser{ID: "admin", Role: services.UserRoleAdmin})
	}, RequireRole(services.UserRoleAdmin), APIAdminGetSettings)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/admin/settings", nil))
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected admin settings 200, got %d body=%s", recorder.Code, recorder.Body.String())
	}
	body := recorder.Body.String()
	for _, field := range []string{"transcriptRetentionDays", "mediaRetentionDays", "failedUploadRetentionDays"} {
		if strings.Contains(body, field) {
			t.Fatalf("admin settings response should not expose %s: %s", field, body)
		}
	}
}

func TestAdminUpdateSettingsRejectsDeprecatedRetentionFields(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.PUT("/api/admin/settings", func(c *gin.Context) {
		c.Set(authUserContextKey, dtos.AuthUser{ID: "admin", Role: services.UserRoleAdmin})
	}, APIAdminUpdateSettings)
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/api/admin/settings", strings.NewReader(`{"transcriptRetentionDays":30}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected deprecated retention field 400, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestRestoreDefaultsRequiresConfirmationAndRefreshesFormData(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/api/admin/settings/restore-defaults", func(c *gin.Context) {
		c.Set(authUserContextKey, dtos.AuthUser{ID: "admin", Role: services.UserRoleAdmin})
	}, APIAdminRestoreDefaultSettings)
	missing := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/admin/settings/restore-defaults", strings.NewReader(`{"confirm":false}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(missing, req)
	if missing.Code != http.StatusBadRequest {
		t.Fatalf("expected missing confirmation 400, got %d", missing.Code)
	}

	confirmed := httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/admin/settings/restore-defaults", strings.NewReader(`{"confirm":true}`))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(confirmed, req)
	if confirmed.Code != http.StatusOK || !strings.Contains(confirmed.Body.String(), "settings") {
		t.Fatalf("expected restored settings response, got %d body=%s", confirmed.Code, confirmed.Body.String())
	}
}

func TestMaintenanceModeAllowsReadRoutesAndBlocksMutations(t *testing.T) {
	settings := services.DefaultSystemSettings()
	settings.MaintenanceMode = true
	settings.MaintenanceMessage = "Down for maintenance"
	restore := services.SetSystemSettingsProviderForTest(func(context.Context) (services.SystemSettings, error) { return settings, nil })
	t.Cleanup(restore)
	gin.SetMode(gin.TestMode)
	for _, route := range []string{"/api/stats", "/api/transcripts", "/api/transcripts/job", "/api/transcripts/job/analysis", "/api/folders", "/api/search/transcripts", "/api/notifications", "/api/account/profile", "/api/auth/me", "/api/settings/public"} {
		recorder := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(recorder)
		c.Request = httptest.NewRequest(http.MethodGet, route, nil)
		if !maintenanceModeAllows(c, dtos.AuthUser{ID: "user", Role: services.UserRoleUser}) {
			t.Fatalf("maintenance mode should allow GET %s", route)
		}
	}

	for _, route := range []struct{ method, path string }{{http.MethodPost, "/api/uploads"}, {http.MethodPatch, "/api/transcripts/job/segments/seg"}, {http.MethodPatch, "/api/transcripts/job/speakers"}, {http.MethodPost, "/api/transcripts/job/analyse"}, {http.MethodPost, "/api/folders"}, {http.MethodPatch, "/api/transcripts/job/analysis/review"}} {
		recorder := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(recorder)
		c.Request = httptest.NewRequest(route.method, route.path, nil)
		if maintenanceModeAllows(c, dtos.AuthUser{ID: "user", Role: services.UserRoleUser}) {
			t.Fatalf("maintenance mode should block %s %s", route.method, route.path)
		}
		if recorder.Code != http.StatusServiceUnavailable || !strings.Contains(recorder.Body.String(), "maintenance_mode") {
			t.Fatalf("expected maintenance response, got %d body=%s", recorder.Code, recorder.Body.String())
		}
	}
}

func TestMaintenanceModeAllowsAdminMutationsAndAuthExceptions(t *testing.T) {
	settings := services.DefaultSystemSettings()
	settings.MaintenanceMode = true
	restore := services.SetSystemSettingsProviderForTest(func(context.Context) (services.SystemSettings, error) { return settings, nil })
	t.Cleanup(restore)
	gin.SetMode(gin.TestMode)
	for _, route := range []struct{ method, path string }{{http.MethodPost, "/api/uploads"}, {http.MethodPatch, "/api/transcripts/job/segments/seg"}, {http.MethodPost, "/api/auth/logout"}} {
		recorder := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(recorder)
		c.Request = httptest.NewRequest(route.method, route.path, nil)
		if !maintenanceModeAllows(c, dtos.AuthUser{ID: "admin", Role: services.UserRoleAdmin}) {
			t.Fatalf("maintenance mode should allow admin %s %s", route.method, route.path)
		}
	}
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	if !maintenanceModeAllows(c, dtos.AuthUser{ID: "user", Role: services.UserRoleUser}) {
		t.Fatal("maintenance mode should allow user logout")
	}
}

func TestMaintenanceRouteAllowedPolicy(t *testing.T) {
	if !maintenanceRouteAllowed(http.MethodGet, "/api/transcripts") || !maintenanceRouteAllowed(http.MethodHead, "/api/transcripts") || !maintenanceRouteAllowed(http.MethodOptions, "/api/uploads") {
		t.Fatal("safe read methods should be allowed")
	}
	if !maintenanceRouteAllowed(http.MethodPost, "/api/auth/login") || !maintenanceRouteAllowed(http.MethodPost, "/api/auth/logout") {
		t.Fatal("auth operations should be allowed")
	}
	if maintenanceRouteAllowed(http.MethodPost, "/api/uploads") || maintenanceRouteAllowed(http.MethodPatch, "/api/transcripts/job/speakers") || maintenanceRouteAllowed(http.MethodDelete, "/api/folders/folder") {
		t.Fatal("mutation routes should not be allowed")
	}
}

func TestUploadSettingsRejectSizeAndFormat(t *testing.T) {
	settings := services.DefaultSystemSettings()
	settings.MaximumUploadSizeMB = 1
	settings.AllowedUploadFormats = []string{"mp3"}
	restore := services.SetSystemSettingsProviderForTest(func(context.Context) (services.SystemSettings, error) { return settings, nil })
	t.Cleanup(restore)
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/api/uploads", APIUploadFile)

	large := uploadRequest(t, "recording.mp3", bytes.Repeat([]byte("a"), 1024*1024+1))
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, large)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected large upload 400, got %d body=%s", recorder.Code, recorder.Body.String())
	}

	badFormat := uploadRequest(t, "recording.wav", []byte("audio"))
	recorder = httptest.NewRecorder()
	router.ServeHTTP(recorder, badFormat)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected bad format 400, got %d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestTranscriptActionRestrictions(t *testing.T) {
	settings := services.DefaultSystemSettings()
	settings.TranscriptEditingEnabled = false
	settings.SpeakerRenamingEnabled = false
	settings.TranscriptDownloadsEnabled = false
	settings.AnalysisEnabled = false
	restore := services.SetSystemSettingsProviderForTest(func(context.Context) (services.SystemSettings, error) { return settings, nil })
	t.Cleanup(restore)
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.PATCH("/api/transcripts/:jobId/segments/:segmentId", setAuthUserForTest, APIUpdateSegment)
	router.PATCH("/api/transcripts/:jobId/speakers", setAuthUserForTest, APIUpdateSpeakerName)
	router.GET("/api/transcripts/:jobId/download", setAuthUserForTest, APIDownloadTranscript)
	router.POST("/api/transcripts/:jobId/analyse", setAuthUserForTest, APIAnalyseTranscript)

	assertStatus(t, router, http.MethodPatch, "/api/transcripts/job/segments/seg", `{"transcriptText":"text"}`, http.StatusForbidden)
	assertStatus(t, router, http.MethodPatch, "/api/transcripts/job/speakers", `{"speakerKey":"SPEAKER_00","displayName":"Name"}`, http.StatusForbidden)
	assertStatus(t, router, http.MethodGet, "/api/transcripts/job/download?format=txt", ``, http.StatusForbidden)
	assertStatus(t, router, http.MethodPost, "/api/transcripts/job/analyse", ``, http.StatusForbidden)
}

func TestDownloadPerFormatRestriction(t *testing.T) {
	settings := services.DefaultSystemSettings()
	settings.EnabledDownloadFormats = []string{"txt"}
	restore := services.SetSystemSettingsProviderForTest(func(context.Context) (services.SystemSettings, error) { return settings, nil })
	t.Cleanup(restore)
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/api/transcripts/:jobId/download", setAuthUserForTest, APIDownloadTranscript)
	assertStatus(t, router, http.MethodGet, "/api/transcripts/job/download?format=pdf", ``, http.StatusForbidden)
}

func uploadRequest(t *testing.T, filename string, content []byte) *http.Request {
	t.Helper()
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatal(err)
	}
	_ = writer.WriteField("category", "meeting")
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/uploads", body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	return req
}

func assertStatus(t *testing.T, router *gin.Engine, method, path, body string, status int) {
	t.Helper()
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	router.ServeHTTP(recorder, req)
	if recorder.Code != status {
		t.Fatalf("expected %s %s status %d, got %d body=%s", method, path, status, recorder.Code, recorder.Body.String())
	}
}
