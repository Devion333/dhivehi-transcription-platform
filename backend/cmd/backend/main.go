package main

import (
	"log"
	"net/http"
	"os"
	"strings"
	"transcript_app/backend/internal/dtos"
	"transcript_app/backend/internal/handlers"
	"transcript_app/backend/internal/services"

	"github.com/gin-gonic/gin"
)

func main() {
	// Initialize all services (MinIO, Qdrant, Redis) with auto-creation
	if err := services.InitializeServices(); err != nil {
		log.Fatalf("❌ Failed to initialize services: %v", err)
	}

	r := gin.Default()

	// Enable credentialed CORS for the configured frontend origin.
	r.Use(func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		if isAllowedOrigin(origin) {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
			c.Writer.Header().Set("Vary", "Origin")
			c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		}
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, PATCH, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Origin, Content-Type, Accept")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		if requiresTrustedBrowserOrigin(c.Request.Method) && !isTrustedBrowserOrigin(c.Request.Header.Get("Origin"), c.Request.Header.Get("Referer")) {
			c.AbortWithStatusJSON(http.StatusForbidden, dtos.APIErrorBody{Error: dtos.APIError{Code: services.ErrCodeForbidden, Message: "You do not have permission to perform this action", Details: nil}})
			return
		}
		c.Next()
	})

	r.POST("/upload", handlers.RequireAuth(), handlers.UploadFile)
	r.POST("/transcripts/:job_id/analyse", handlers.RequireAuth(), handlers.AnalyseTranscript)
	r.GET("/transcripts", handlers.RequireAuth(), handlers.LegacyListTranscripts)
	r.GET("/transcripts/stats", handlers.RequireAuth(), handlers.LegacyTranscriptStats)

	api := r.Group("/api")
	{
		api.POST("/auth/login", handlers.APILogin)
		api.POST("/auth/logout", handlers.RequireAuth(), handlers.APILogout)
		api.POST("/auth/change-password", handlers.RequireAuth(), handlers.APIChangePassword)
		api.GET("/auth/me", handlers.RequireAuth(), handlers.APIMe)
		api.GET("/health", handlers.APIHealth)

		protected := api.Group("")
		protected.Use(handlers.RequireAuth())
		{
			protected.POST("/uploads", handlers.APIUploadFile)
			protected.GET("/account/profile", handlers.APIGetAccountProfile)
			protected.PATCH("/account/profile", handlers.APIUpdateAccountProfile)
			protected.GET("/stats", handlers.APIStats)
			protected.GET("/search/transcripts", handlers.APISearchTranscripts)
			protected.GET("/notifications", handlers.APIListNotifications)
			protected.GET("/notifications/unread-count", handlers.APIGetUnreadNotificationCount)
			protected.POST("/notifications/read-all", handlers.APIMarkAllNotificationsRead)
			protected.POST("/notifications/:notificationId/read", handlers.APIMarkNotificationRead)
			protected.GET("/transcripts", handlers.APIListTranscripts)
			protected.GET("/transcripts/:jobId/status", handlers.APIGetTranscriptStatus)
			protected.GET("/transcripts/:jobId/download", handlers.APIDownloadTranscript)
			protected.GET("/transcripts/:jobId", handlers.APIGetTranscript)
			protected.PATCH("/transcripts/:jobId/speakers", handlers.APIUpdateSpeakerName)
			protected.PATCH("/transcripts/:jobId/segments/:segmentId", handlers.APIUpdateSegment)
			protected.GET("/transcripts/:jobId/analysis", handlers.APIGetAnalysis)
			protected.PATCH("/transcripts/:jobId/analysis/review", handlers.APIUpdateAnalysisReview)
			protected.POST("/transcripts/:jobId/analyse", handlers.APIAnalyseTranscript)
			protected.POST("/audit/pdf-export", handlers.APIAuditPDFExport)
		}

		admin := api.Group("/admin")
		admin.Use(handlers.RequireAuth(), handlers.RequireRole(services.UserRoleAdmin))
		{
			admin.GET("/users", handlers.APIAdminListUsers)
			admin.POST("/users", handlers.APIAdminCreateUser)
			admin.GET("/users/:userId", handlers.APIAdminGetUser)
			admin.PATCH("/users/:userId", handlers.APIAdminUpdateUser)
			admin.POST("/users/:userId/activate", handlers.APIAdminActivateUser)
			admin.POST("/users/:userId/deactivate", handlers.APIAdminDeactivateUser)
			admin.POST("/users/:userId/reset-password", handlers.APIAdminResetUserPassword)
			admin.GET("/audit", handlers.APIAdminListAuditEvents)
			admin.GET("/audit/export", handlers.APIAdminExportAuditEvents)
			admin.GET("/audit/:eventId", handlers.APIAdminGetAuditEvent)
			admin.GET("/jobs", handlers.APIAdminListJobs)
			admin.GET("/jobs/health", handlers.APIAdminJobHealth)
			admin.GET("/transcripts/:jobId/reassignment-options", handlers.APIAdminTranscriptReassignmentOptions)
			admin.POST("/transcripts/:jobId/reassign", handlers.APIAdminReassignTranscript)
			admin.GET("/transcripts/:jobId/deletion-preview", handlers.APIAdminTranscriptDeletionPreview)
			admin.DELETE("/transcripts/:jobId", handlers.APIAdminDeleteTranscript)
			admin.GET("/jobs/:jobId", handlers.APIAdminGetJob)
			admin.POST("/jobs/:jobId/retry", handlers.APIAdminRetryJob)
		}
	}

	log.Println("🚀 Backend server starting on :8000")
	if err := r.Run(":8000"); err != nil {
		log.Fatalf("❌ Failed to start server: %v", err)
	}
}

func isAllowedOrigin(origin string) bool {
	origin = strings.TrimRight(strings.TrimSpace(origin), "/")
	if origin == "" {
		return false
	}
	for _, item := range allowedOrigins() {
		if item == origin {
			return true
		}
	}
	return false
}

func requiresTrustedBrowserOrigin(method string) bool {
	switch method {
	case http.MethodPost, http.MethodPatch, http.MethodDelete:
		return true
	default:
		return false
	}
}

func isTrustedBrowserOrigin(origin, referer string) bool {
	if origin != "" {
		return isAllowedOrigin(origin)
	}
	if referer == "" {
		return true
	}
	for _, allowed := range allowedOrigins() {
		if strings.HasPrefix(referer, allowed+"/") || referer == allowed {
			return true
		}
	}
	return false
}

func allowedOrigins() []string {
	configured := strings.Split(os.Getenv("FRONTEND_ORIGIN"), ",")
	if len(configured) == 1 && strings.TrimSpace(configured[0]) == "" {
		configured = []string{"http://localhost:3000"}
	}
	allowed := []string{}
	for _, item := range configured {
		item = strings.TrimRight(strings.TrimSpace(item), "/")
		if item != "" {
			allowed = append(allowed, item)
		}
	}
	return allowed
}
