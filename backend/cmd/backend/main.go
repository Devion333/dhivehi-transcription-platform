package main

import (
	"log"
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

	// Enable CORS for frontend
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, PATCH, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Origin, Content-Type, Accept")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	r.POST("/upload", handlers.UploadFile)
	r.POST("/transcripts/:job_id/analyse", handlers.AnalyseTranscript)
	r.GET("/transcripts", handlers.LegacyListTranscripts)
	r.GET("/transcripts/stats", handlers.LegacyTranscriptStats)

	api := r.Group("/api")
	{
		api.POST("/uploads", handlers.APIUploadFile)
		api.GET("/health", handlers.APIHealth)
		api.GET("/stats", handlers.APIStats)
		api.GET("/search/transcripts", handlers.APISearchTranscripts)
		api.GET("/transcripts", handlers.APIListTranscripts)
		api.GET("/transcripts/:jobId", handlers.APIGetTranscript)
		api.PATCH("/transcripts/:jobId/segments/:segmentId", handlers.APIUpdateSegment)
		api.GET("/transcripts/:jobId/analysis", handlers.APIGetAnalysis)
		api.POST("/transcripts/:jobId/analyse", handlers.APIAnalyseTranscript)
	}

	log.Println("🚀 Backend server starting on :8000")
	if err := r.Run(":8000"); err != nil {
		log.Fatalf("❌ Failed to start server: %v", err)
	}
}
