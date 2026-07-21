// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: worker_heartbeat.go
// Description: Service layer for worker_heartbeat
// First Written on: 03/07/2026
// Edited on: 21/07/2026
package services

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"transcript_app/backend/internal/dtos"
)

const (
	WorkerAvailabilityAvailable   = "available"
	WorkerAvailabilityUnavailable = "unavailable"
	WorkerAvailabilityUnknown     = "unknown"
	DefaultHeartbeatInterval      = 15 * time.Second
	DefaultHeartbeatTTL           = 60 * time.Second
	workerHeartbeatSetPrefix      = "worker_heartbeat_keys:"
)

type WorkerHeartbeatConfig struct {
	Interval        time.Duration
	TTL             time.Duration
	ExpectedWorkers map[string]bool
}

type WorkerHeartbeatRecord struct {
	WorkerType      string `json:"workerType"`
	InstanceID      string `json:"instanceId"`
	Status          string `json:"status"`
	Version         string `json:"version,omitempty"`
	Device          string `json:"device,omitempty"`
	ModelName       string `json:"modelName,omitempty"`
	StartedAt       string `json:"startedAt"`
	LastHeartbeatAt string `json:"lastHeartbeatAt"`
}

func WorkerHeartbeatConfigFromEnv() WorkerHeartbeatConfig {
	interval := heartbeatDurationFromEnv("WORKER_HEARTBEAT_INTERVAL_SECONDS", DefaultHeartbeatInterval)
	ttl := heartbeatDurationFromEnv("WORKER_HEARTBEAT_TTL_SECONDS", DefaultHeartbeatTTL)
	if ttl <= interval {
		ttl = interval * 4
	}
	return WorkerHeartbeatConfig{Interval: interval, TTL: ttl, ExpectedWorkers: ParseExpectedWorkers(os.Getenv("EXPECTED_WORKERS"))}
}

func ParseExpectedWorkers(value string) map[string]bool {
	if strings.TrimSpace(value) == "" {
		value = strings.Join(knownWorkerTypes(), ",")
	}
	result := map[string]bool{}
	for _, item := range strings.Split(value, ",") {
		workerType := strings.TrimSpace(item)
		if isKnownWorkerType(workerType) {
			result[workerType] = true
		}
	}
	return result
}

func GetWorkerHeartbeats(ctx context.Context, workerType string) ([]WorkerHeartbeatRecord, error) {
	if RedisClient == nil {
		return nil, fmt.Errorf("redis client is not initialized")
	}
	if !isKnownWorkerType(workerType) {
		return nil, nil
	}
	keys, err := RedisClient.SMembers(ctx, workerHeartbeatSetPrefix+workerType).Result()
	if err != nil {
		return nil, err
	}
	if len(keys) > 100 {
		keys = keys[:100]
	}
	records := []WorkerHeartbeatRecord{}
	for _, key := range keys {
		if !strings.HasPrefix(key, "worker_heartbeat:"+workerType+":") {
			continue
		}
		value, err := RedisClient.Get(ctx, key).Result()
		if err != nil || strings.TrimSpace(value) == "" {
			continue
		}
		var record WorkerHeartbeatRecord
		if err := json.Unmarshal([]byte(value), &record); err != nil {
			continue
		}
		if record.WorkerType == workerType && record.InstanceID != "" {
			records = append(records, record)
		}
	}
	return records, nil
}

func GetWorkerAvailabilitySummary(ctx context.Context) map[string]dtos.WorkerHealthSummary {
	config := WorkerHeartbeatConfigFromEnv()
	result := map[string]dtos.WorkerHealthSummary{}
	for _, workerType := range knownWorkerTypes() {
		if !config.ExpectedWorkers[workerType] {
			result[workerType] = dtos.WorkerHealthSummary{Status: WorkerAvailabilityUnknown}
			continue
		}
		records, err := GetWorkerHeartbeats(ctx, workerType)
		if err != nil {
			result[workerType] = dtos.WorkerHealthSummary{Status: WorkerAvailabilityUnknown}
			continue
		}
		result[workerType] = summarizeWorkerHeartbeats(records, config.TTL, time.Now().UTC())
	}
	return result
}

func WorkerAvailability(ctx context.Context, workerType string) string {
	summary := GetWorkerAvailabilitySummary(ctx)[workerType]
	if summary.Status == "" {
		return WorkerAvailabilityUnknown
	}
	return summary.Status
}

func summarizeWorkerHeartbeats(records []WorkerHeartbeatRecord, ttl time.Duration, now time.Time) dtos.WorkerHealthSummary {
	fresh := []time.Time{}
	for _, record := range records {
		if record.Status != WorkerAvailabilityAvailable {
			continue
		}
		lastHeartbeat, err := time.Parse(time.RFC3339, record.LastHeartbeatAt)
		if err != nil {
			continue
		}
		if now.Sub(lastHeartbeat.UTC()) <= ttl {
			fresh = append(fresh, lastHeartbeat.UTC())
		}
	}
	if len(fresh) == 0 {
		return dtos.WorkerHealthSummary{Status: WorkerAvailabilityUnavailable}
	}
	sort.Slice(fresh, func(i, j int) bool { return fresh[i].After(fresh[j]) })
	last := fresh[0].Format(time.RFC3339)
	return dtos.WorkerHealthSummary{Status: WorkerAvailabilityAvailable, Instances: len(fresh), LastHeartbeatAt: &last}
}

func heartbeatDurationFromEnv(key string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	seconds, err := strconv.Atoi(value)
	if err != nil || seconds < 1 {
		return fallback
	}
	return time.Duration(seconds) * time.Second
}

func knownWorkerTypes() []string {
	return []string{JobStageConversion, JobStageDiarization, JobStageTranscription, JobStageAnalysis}
}

func isKnownWorkerType(workerType string) bool {
	for _, known := range knownWorkerTypes() {
		if workerType == known {
			return true
		}
	}
	return false
}
