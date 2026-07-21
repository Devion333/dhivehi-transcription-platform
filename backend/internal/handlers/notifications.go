// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: notifications.go
// Description: HTTP handler for notifications
// First Written on: 03/07/2026
// Edited on: 21/07/2026
package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"transcript_app/backend/internal/dtos"
	"transcript_app/backend/internal/services"

	"github.com/gin-gonic/gin"
)

func APIListNotifications(c *gin.Context) {
	user, ok := CurrentUser(c)
	if !ok {
		writeUnauthenticated(c)
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	unreadOnly := strings.EqualFold(c.Query("unreadOnly"), "true") || c.Query("unreadOnly") == "1"
	response, err := services.ListNotifications(c.Request.Context(), user.ID, services.NotificationListOptions{Page: page, PageSize: pageSize, UnreadOnly: unreadOnly})
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, response)
}

func APIGetUnreadNotificationCount(c *gin.Context) {
	user, ok := CurrentUser(c)
	if !ok {
		writeUnauthenticated(c)
		return
	}
	count, err := services.GetUnreadCount(c.Request.Context(), user.ID)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, dtos.NotificationUnreadCountResponse{Count: count})
}

func APIMarkNotificationRead(c *gin.Context) {
	user, ok := CurrentUser(c)
	if !ok {
		writeUnauthenticated(c)
		return
	}
	notificationID := strings.TrimSpace(c.Param("notificationId"))
	if notificationID == "" {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "notificationId is required", nil)
		return
	}
	notification, err := services.MarkRead(c.Request.Context(), user.ID, notificationID)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, dtos.NotificationReadResponse{Notification: notification})
}

func APIMarkAllNotificationsRead(c *gin.Context) {
	user, ok := CurrentUser(c)
	if !ok {
		writeUnauthenticated(c)
		return
	}
	updated, err := services.MarkAllRead(c.Request.Context(), user.ID)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, dtos.NotificationReadAllResponse{Updated: updated})
}
