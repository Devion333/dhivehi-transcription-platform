// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: account_activity.go
// Description: HTTP handler for account_activity
// First Written on: 03/07/2026
// Edited on: 21/07/2026
package handlers

import (
	"net/http"
	"strconv"

	"transcript_app/backend/internal/services"

	"github.com/gin-gonic/gin"
)

func APIGetAccountActivity(c *gin.Context) {
	user, ok := CurrentUser(c)
	if !ok {
		writeUnauthenticated(c)
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	response, err := services.ListAccountActivity(c.Request.Context(), user.ID, page, pageSize)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, response)
}
