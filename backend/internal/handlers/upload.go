// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: upload.go
// Description: HTTP handler for upload
// First Written on: 03/07/2026
// Edited on: 21/07/2026
package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"transcript_app/backend/internal/dtos"
	"transcript_app/backend/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
)

type uploadMetadata struct {
	Category        string
	ReferenceNumber string
	Notes           string
	Speakers        string
}

const maxReferenceNumberLength = 100

type uploadResult struct {
	FileID           string
	Filename         string
	MinioURL         string
	LocalPath        string
	Status           string
	Category         string
	ReferenceNumber  string
	Notes            string
	Speakers         string
	CreatedAt        string
	OwnerUserID      string
	OwnerDisplayName string
	OwnerEmail       string
}

// UploadFile handles file uploads, saves to MinIO, and records metadata in Qdrant
func UploadFile(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file not provided"})
		return
	}
	metadata := uploadMetadata{
		Category:        c.PostForm("category"),
		ReferenceNumber: c.PostForm("reference_number"),
		Notes:           c.PostForm("notes"),
		Speakers:        c.PostForm("speakers"),
	}
	metadata.ReferenceNumber = strings.TrimSpace(metadata.ReferenceNumber)
	if err := validateReferenceNumber(metadata.ReferenceNumber); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Reference number is required"})
		return
	}

	result, err := processUpload(c, file, metadata)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	auditRequestEvent(c, services.AuditEventInput{Action: "transcript.uploaded", Category: "transcript", ResourceType: "transcript", ResourceID: result.FileID, Outcome: services.AuditOutcomeSuccess, Metadata: uploadAuditMetadata(result)})

	c.JSON(http.StatusOK, gin.H{
		"file_id":          result.FileID,
		"filename":         result.Filename,
		"minio_url":        result.MinioURL,
		"local_path":       result.LocalPath,
		"status":           result.Status,
		"category":         result.Category,
		"reference_number": result.ReferenceNumber,
		"notes":            result.Notes,
		"speakers":         result.Speakers,
	})
}

func APIUploadFile(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "A media file is required", nil)
		return
	}
	settings, err := services.GetSystemSettings(c.Request.Context())
	if err != nil {
		writeServiceError(c, err)
		return
	}
	metadata := uploadMetadata{
		Category:        c.PostForm("category"),
		ReferenceNumber: firstNonEmpty(c.PostForm("referenceNumber"), c.PostForm("reference_number")),
		Notes:           c.PostForm("notes"),
		Speakers:        firstNonEmpty(c.PostForm("requestedSpeakers"), c.PostForm("speakers")),
	}
	if !settings.UploadsEnabled {
		writeAPIError(c, http.StatusForbidden, services.ErrCodeForbidden, "Uploads are currently disabled", nil)
		return
	}
	if file.Size > int64(settings.MaximumUploadSizeMB)*1024*1024 {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "File exceeds the configured upload size limit", nil)
		return
	}
	if !services.UploadFormatAllowed(file.Filename, settings) {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "File format is not allowed", nil)
		return
	}
	metadata.ReferenceNumber = strings.TrimSpace(metadata.ReferenceNumber)
	metadata.Category = strings.TrimSpace(metadata.Category)
	if err := validateReferenceNumber(metadata.ReferenceNumber); err != nil {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "Reference number is required", nil)
		return
	}
	if settings.RequireCategory && strings.TrimSpace(metadata.Category) == "" {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "Category is required", nil)
		return
	}

	result, err := processUpload(c, file, metadata)
	if err != nil {
		log.Printf("api upload failed: %v", err)
		writeAPIError(c, http.StatusInternalServerError, services.ErrCodeInternal, "Upload could not be accepted", nil)
		return
	}

	auditRequestEvent(c, services.AuditEventInput{Action: "transcript.uploaded", Category: "transcript", ResourceType: "transcript", ResourceID: result.FileID, Outcome: services.AuditOutcomeSuccess, Metadata: uploadAuditMetadata(result)})
	c.JSON(http.StatusCreated, mapAPIUploadResponse(result))
}

func processUpload(c *gin.Context, file *multipart.FileHeader, uploadMeta uploadMetadata) (uploadResult, error) {
	if file == nil || file.Filename == "" {
		return uploadResult{}, fmt.Errorf("file not provided")
	}
	uploadMeta.ReferenceNumber = strings.TrimSpace(uploadMeta.ReferenceNumber)
	uploadMeta.Category = strings.TrimSpace(uploadMeta.Category)
	if err := validateReferenceNumber(uploadMeta.ReferenceNumber); err != nil {
		return uploadResult{}, err
	}

	// Generate unique file ID
	fileID := uuid.NewString()
	localPath := filepath.Join(os.TempDir(), fmt.Sprintf("%s_%s", fileID, filepath.Base(file.Filename)))

	// Save file locally
	if err := c.SaveUploadedFile(file, localPath); err != nil {
		return uploadResult{}, fmt.Errorf("failed to save file")
	}

	// Upload to MinIO
	bucket := "uploads"
	ctx := context.Background()
	objectName := fmt.Sprintf("%s_%s", fileID, file.Filename)

	_, err := services.MinioClient.FPutObject(ctx, bucket, objectName, localPath, minio.PutObjectOptions{
		ContentType: "application/octet-stream",
	})
	if err != nil {
		return uploadResult{}, fmt.Errorf("failed to upload to MinIO: %v", err)
	}

	// Build file URL (based on environment variable)
	minioEndpoint := os.Getenv("MINIO_ENDPOINT")
	if minioEndpoint == "" {
		minioEndpoint = "minio:9000" // default fallback for internal Docker network
	}
	fileURL := fmt.Sprintf("http://%s/%s/%s", minioEndpoint, bucket, objectName)

	createdAt := time.Now().UTC().Format(time.RFC3339)
	user, _ := CurrentUser(c)

	// Prepare metadata payload for Qdrant
	payload := map[string]interface{}{
		"type":               "parent",
		"job_id":             fileID,
		"filename":           file.Filename,
		"minio_url":          fileURL,
		"local_path":         localPath,
		"status":             "uploaded",
		"category":           uploadMeta.Category,
		"reference_number":   uploadMeta.ReferenceNumber,
		"notes":              uploadMeta.Notes,
		"speakers":           uploadMeta.Speakers,
		"timestamp":          createdAt,
		"owner_user_id":      user.ID,
		"owner_display_name": user.Name,
		"owner_email":        user.Email,
	}

	// Insert metadata into Qdrant
	if err := services.InsertFileMetadata(fileID, payload); err != nil {
		log.Printf("âš ï¸ Failed to insert metadata into Qdrant: %v", err)
	} else {
		log.Printf("âœ… Successfully inserted metadata for file %s", fileID)
	}

	settings, _ := services.GetSystemSettings(ctx)
	// Push job to conversion queue (which handles both video and audio)
	if !settings.ProcessingEnabled || !settings.AutomaticProcessing {
		log.Printf("â„¹ï¸ Processing enqueue skipped for file %s by system settings", fileID)
	} else if services.RedisClient == nil {
		log.Printf("âš ï¸ RedisClient is nil - cannot push to queue")
	} else {
		job := map[string]string{
			"file_id":   fileID,
			"minio_url": fileURL,
			"filename":  file.Filename,
		}
		jobJSON, err := json.Marshal(job)
		if err != nil {
			log.Printf("âš ï¸ Failed to marshal Redis job: %v", err)
		} else {
			log.Printf("ðŸ“¤ Attempting to push job to conversion queue...")
			err = services.RedisClient.LPush(ctx, "conversion_queue", jobJSON).Err()
			if err != nil {
				log.Printf("âš ï¸ Failed to push job to Redis: %v", err)
			} else {
				log.Printf("âœ… Pushed conversion job to Redis for file %s", fileID)
			}
		}
	}

	return uploadResult{
		FileID:           fileID,
		Filename:         file.Filename,
		MinioURL:         fileURL,
		LocalPath:        localPath,
		Status:           "uploaded",
		Category:         uploadMeta.Category,
		ReferenceNumber:  uploadMeta.ReferenceNumber,
		Notes:            uploadMeta.Notes,
		Speakers:         uploadMeta.Speakers,
		CreatedAt:        createdAt,
		OwnerUserID:      user.ID,
		OwnerDisplayName: user.Name,
		OwnerEmail:       user.Email,
	}, nil
}

func mapAPIUploadResponse(result uploadResult) dtos.UploadResponse {
	return dtos.UploadResponse{
		Job: dtos.UploadJob{
			JobID:            result.FileID,
			Filename:         result.Filename,
			Category:         result.Category,
			ReferenceNumber:  result.ReferenceNumber,
			Notes:            result.Notes,
			Status:           result.Status,
			CreatedAt:        result.CreatedAt,
			SpeakerCount:     parseSpeakerCount(result.Speakers),
			SegmentCount:     0,
			AnalysisStatus:   "not_started",
			OwnerUserID:      result.OwnerUserID,
			OwnerDisplayName: result.OwnerDisplayName,
			OwnerEmail:       result.OwnerEmail,
		},
		Message: "Upload accepted for processing",
	}
}

func parseSpeakerCount(value string) int {
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 0 {
		return 0
	}
	return parsed
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func validateReferenceNumber(value string) error {
	value = strings.TrimSpace(value)
	if value == "" {
		return fmt.Errorf("reference number is required")
	}
	if len([]rune(value)) > maxReferenceNumberLength {
		return fmt.Errorf("reference number must be %d characters or fewer", maxReferenceNumberLength)
	}
	return nil
}

func uploadAuditMetadata(result uploadResult) map[string]interface{} {
	return map[string]interface{}{
		"jobId":             result.FileID,
		"filename":          result.Filename,
		"category":          result.Category,
		"referenceNumber":   result.ReferenceNumber,
		"requestedSpeakers": parseSpeakerCount(result.Speakers),
	}
}
