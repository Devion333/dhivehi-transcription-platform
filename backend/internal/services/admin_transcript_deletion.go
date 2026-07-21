// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: admin_transcript_deletion.go
// Description: Service layer for admin_transcript_deletion
// First Written on: 03/07/2026
// Edited on: 21/07/2026
package services

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"

	"transcript_app/backend/internal/dtos"

	"github.com/minio/minio-go/v7"
)

const transcriptProcessingReason = "TRANSCRIPT_PROCESSING"

type mediaObjectRef struct {
	Bucket string
	Key    string
}

type transcriptDeletionResources struct {
	Parent       QdrantPoint
	Segments     []QdrantPoint
	MediaObjects []mediaObjectRef
	Summary      dtos.AdminJobSummary
	QueueState   dtos.JobQueueState
}

type TranscriptDeletionPartialError struct {
	Response dtos.TranscriptDeletionResponse
}

func (e *TranscriptDeletionPartialError) Error() string {
	return "transcript deletion partially completed"
}

func GetTranscriptDeletionPreview(ctx context.Context, jobID string) (dtos.TranscriptDeletionPreview, error) {
	resources, err := collectTranscriptDeletionResources(ctx, jobID)
	if err != nil {
		return dtos.TranscriptDeletionPreview{}, err
	}
	var blockingReason *string
	canDelete := true
	if transcriptDeletionBlocked(resources) {
		reason := transcriptProcessingReason
		blockingReason = &reason
		canDelete = false
	}
	return dtos.TranscriptDeletionPreview{
		JobID:          jobID,
		Filename:       getString(resources.Parent.Payload, "filename", "Unknown"),
		Owner:          dtos.TranscriptDeletionOwner{DisplayName: getString(resources.Parent.Payload, "owner_display_name", ""), Email: getString(resources.Parent.Payload, "owner_email", "")},
		SegmentCount:   len(resources.Segments),
		MediaObjects:   len(resources.MediaObjects),
		Status:         resources.Summary.Status,
		CanDelete:      canDelete,
		BlockingReason: blockingReason,
	}, nil
}

func DeleteAdminTranscript(ctx context.Context, jobID, confirmation string) (dtos.TranscriptDeletionResponse, error) {
	jobID = strings.TrimSpace(jobID)
	if strings.TrimSpace(confirmation) != jobID {
		return dtos.TranscriptDeletionResponse{}, newServiceError(ErrCodeDeleteConfirmationMismatch, errors.New("delete confirmation mismatch"))
	}
	resources, err := collectTranscriptDeletionResources(ctx, jobID)
	if err != nil {
		return dtos.TranscriptDeletionResponse{}, err
	}
	if transcriptDeletionBlocked(resources) {
		return dtos.TranscriptDeletionResponse{}, newServiceError(ErrCodeTranscriptProcessing, errors.New("transcript is processing"))
	}

	response := dtos.TranscriptDeletionResponse{JobID: jobID, Deleted: true, SegmentCount: len(resources.Segments), MediaObjectCount: len(resources.MediaObjects)}
	failed := []string{}
	if err := deleteTranscriptMediaObjects(ctx, resources.MediaObjects); err != nil {
		failed = append(failed, "media")
	} else {
		response.CleanupCategories = append(response.CleanupCategories, "media")
	}
	if err := deleteSegmentPoints(jobID); err != nil {
		failed = append(failed, "qdrant_segments")
	} else {
		response.CleanupCategories = append(response.CleanupCategories, "qdrant_segments")
	}
	if err := deleteParentPoint(jobID); err != nil {
		failed = append(failed, "qdrant_parent")
	} else {
		response.CleanupCategories = append(response.CleanupCategories, "qdrant_parent")
	}
	if err := clearTranscriptRedisMetadata(ctx, jobID, resources.Segments); err != nil {
		failed = append(failed, "redis")
	} else {
		response.CleanupCategories = append(response.CleanupCategories, "redis")
	}
	if len(failed) > 0 {
		response.Deleted = false
		response.PartialCleanupCategories = failed
		return response, &TranscriptDeletionPartialError{Response: response}
	}
	return response, nil
}

func collectTranscriptDeletionResources(ctx context.Context, jobID string) (transcriptDeletionResources, error) {
	parent, err := GetParentTranscriptPoint(jobID)
	if err != nil {
		return transcriptDeletionResources{}, err
	}
	segments, err := ListSegmentPointsByParent(jobID)
	if err != nil {
		return transcriptDeletionResources{}, err
	}
	summary := adminJobSummary(parent.Payload, segments)
	queueState, _ := jobQueueState(ctx, summary.CurrentStage, jobID, segments)
	mediaObjects, err := collectMediaObjectRefs(parent.Payload, segments)
	if err != nil {
		return transcriptDeletionResources{}, err
	}
	return transcriptDeletionResources{Parent: parent, Segments: segments, MediaObjects: mediaObjects, Summary: summary, QueueState: queueState}, nil
}

func transcriptDeletionBlocked(resources transcriptDeletionResources) bool {
	return resources.QueueState.Queued || resources.QueueState.Processing || strings.Contains(resources.Summary.Status, "processing") || strings.Contains(resources.Summary.CurrentStage, "processing") || resources.Summary.Status == "uploaded" || resources.Summary.Status == "converting" || resources.Summary.Status == "diarizing" || resources.Summary.Status == "transcribing"
}

func collectMediaObjectRefs(parent map[string]interface{}, segments []QdrantPoint) ([]mediaObjectRef, error) {
	seen := map[string]mediaObjectRef{}
	for _, key := range []string{"minio_url", "audio_url", "converted_audio_url", "converted_minio_url"} {
		if err := addMediaRef(seen, getString(parent, key, "")); err != nil {
			return nil, err
		}
	}
	for _, segment := range segments {
		for _, key := range []string{"minio_url", "audio_url"} {
			if err := addMediaRef(seen, getString(segment.Payload, key, "")); err != nil {
				return nil, err
			}
		}
	}
	refs := make([]mediaObjectRef, 0, len(seen))
	for _, ref := range seen {
		refs = append(refs, ref)
	}
	sort.Slice(refs, func(i, j int) bool { return refs[i].Bucket+refs[i].Key < refs[j].Bucket+refs[j].Key })
	return refs, nil
}

func addMediaRef(seen map[string]mediaObjectRef, raw string) error {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	ref, err := parseTrustedMediaRef(raw)
	if err != nil {
		return err
	}
	seen[ref.Bucket+"/"+ref.Key] = ref
	return nil
}

func parseTrustedMediaRef(raw string) (mediaObjectRef, error) {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return mediaObjectRef{}, newServiceError(ErrCodeUnsafeMediaReference, errors.New("unsafe media reference"))
	}
	path := strings.TrimPrefix(parsed.EscapedPath(), "/")
	unescaped, err := url.PathUnescape(path)
	if err != nil {
		return mediaObjectRef{}, newServiceError(ErrCodeUnsafeMediaReference, errors.New("unsafe media reference"))
	}
	parts := strings.SplitN(unescaped, "/", 2)
	if len(parts) != 2 || !allowedMediaBucket(parts[0]) || !safeObjectKey(parts[1]) {
		return mediaObjectRef{}, newServiceError(ErrCodeUnsafeMediaReference, errors.New("unsafe media reference"))
	}
	return mediaObjectRef{Bucket: parts[0], Key: parts[1]}, nil
}

func allowedMediaBucket(bucket string) bool {
	return bucket == "uploads" || bucket == "audio"
}

func safeObjectKey(key string) bool {
	key = strings.TrimSpace(key)
	if key == "" || key == "." || key == "/" || strings.HasPrefix(key, "/") || strings.Contains(key, "..") || strings.ContainsAny(key, "*?[]{}") || strings.Contains(key, "\\") {
		return false
	}
	return true
}

func deleteTranscriptMediaObjects(ctx context.Context, refs []mediaObjectRef) error {
	if MinioClient == nil {
		return nil
	}
	var failed bool
	for _, ref := range refs {
		if err := MinioClient.RemoveObject(ctx, ref.Bucket, ref.Key, minio.RemoveObjectOptions{}); err != nil {
			failed = true
		}
	}
	if failed {
		return errors.New("media cleanup failed")
	}
	return nil
}

func deleteSegmentPoints(jobID string) error {
	return qdrantDelete(map[string]interface{}{"must": []map[string]interface{}{{"key": "type", "match": map[string]string{"value": "segment"}}, {"key": "parent_job_id", "match": map[string]string{"value": jobID}}}})
}

func deleteParentPoint(jobID string) error {
	return qdrantDelete(map[string]interface{}{"must": []map[string]interface{}{{"key": "type", "match": map[string]string{"value": "parent"}}, {"key": "job_id", "match": map[string]string{"value": jobID}}}})
}

func qdrantDelete(filter map[string]interface{}) error {
	body := map[string]interface{}{"filter": filter}
	return qdrantRequest(http.MethodPost, fmt.Sprintf("/collections/%s/points/delete?wait=true", qdrantCollection), body, nil)
}

func clearTranscriptRedisMetadata(ctx context.Context, jobID string, segments []QdrantPoint) error {
	if RedisClient == nil {
		return nil
	}
	segmentIDs := map[string]bool{}
	for _, segment := range segments {
		segmentIDs[SegmentIDFromPayload(jobID, segment.Payload)] = true
	}
	for _, stage := range []string{JobStageConversion, JobStageDiarization, JobStageTranscription} {
		for _, kind := range []string{"queued", "failed"} {
			name := queueName(stage, kind)
			if name == "" {
				continue
			}
			entries, err := RedisClient.LRange(ctx, name, 0, queueScanLimit-1).Result()
			if err != nil {
				return err
			}
			for _, entry := range entries {
				job, ok := decodeQueueEntry(entry, stage)
				if ok && (job.JobID == jobID || segmentIDs[job.SegmentID]) {
					if err := RedisClient.LRem(ctx, name, 0, entry).Err(); err != nil {
						return err
					}
				}
			}
		}
	}
	_ = RedisClient.Del(ctx, "job:"+jobID, "retry:"+jobID, "job_retry:"+jobID).Err()
	return nil
}
