package main

import (
	"log"
	"os"
	"strings"
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
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, PATCH, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Origin, Content-Type, Accept")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
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
		api.GET("/auth/me", handlers.RequireAuth(), handlers.APIMe)
		api.GET("/health", handlers.APIHealth)

		protected := api.Group("")
		protected.Use(handlers.RequireAuth())
		{
			protected.POST("/uploads", handlers.APIUploadFile)
			protected.GET("/stats", handlers.APIStats)
			protected.GET("/search/transcripts", handlers.APISearchTranscripts)
			protected.GET("/transcripts", handlers.APIListTranscripts)
			protected.GET("/transcripts/:jobId", handlers.APIGetTranscript)
			protected.PATCH("/transcripts/:jobId/segments/:segmentId", handlers.APIUpdateSegment)
			protected.GET("/transcripts/:jobId/analysis", handlers.APIGetAnalysis)
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
			admin.GET("/audit/:eventId", handlers.APIAdminGetAuditEvent)
			admin.GET("/jobs", handlers.APIAdminListJobs)
			admin.GET("/jobs/health", handlers.APIAdminJobHealth)
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
	if origin == "" {
		return false
	}
	allowed := strings.Split(os.Getenv("FRONTEND_ORIGIN"), ",")
	if len(allowed) == 1 && strings.TrimSpace(allowed[0]) == "" {
		allowed = []string{"http://localhost:3000"}
	}
	for _, item := range allowed {
		if strings.TrimSpace(item) == origin {
			return true
		}
	}
	return false
}
