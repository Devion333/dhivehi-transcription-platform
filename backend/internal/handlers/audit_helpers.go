package handlers

import (
	"log"
	"strings"

	"transcript_app/backend/internal/dtos"
	"transcript_app/backend/internal/services"

	"github.com/gin-gonic/gin"
)

func auditActor(c *gin.Context) *dtos.AuthUser {
	user, ok := CurrentUser(c)
	if !ok {
		return nil
	}
	return &user
}

func auditRequestEvent(c *gin.Context, input services.AuditEventInput) {
	if input.Actor == nil {
		input.Actor = auditActor(c)
	}
	input.IPAddress = c.ClientIP()
	input.UserAgent = strings.TrimSpace(c.Request.UserAgent())
	if err := services.RecordAuditEvent(c.Request.Context(), input); err != nil {
		log.Printf("audit insert failed for %s: %v", input.Action, err)
	}
}

func auditRequestEventWithActor(c *gin.Context, actor *dtos.AuthUser, input services.AuditEventInput) {
	input.Actor = actor
	input.IPAddress = c.ClientIP()
	input.UserAgent = strings.TrimSpace(c.Request.UserAgent())
	if err := services.RecordAuditEvent(c.Request.Context(), input); err != nil {
		log.Printf("audit insert failed for %s: %v", input.Action, err)
	}
}
