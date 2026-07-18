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
