package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"

	"transcript_app/backend/internal/dtos"
	"transcript_app/backend/internal/services"

	"github.com/gin-gonic/gin"
)

const adminJSONMaxBytes = 1 << 20

func APIAdminListUsers(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	response, err := services.ListAdminUsers(c.Request.Context(), services.AdminUserFilters{
		Page: page, PageSize: pageSize, Search: c.Query("search"), Role: c.Query("role"), Status: c.Query("status"),
	})
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, response)
}

func APIAdminCreateUser(c *gin.Context) {
	var request dtos.AdminCreateUserRequest
	if !decodeAdminJSON(c, &request) {
		return
	}
	user, err := services.CreateAdminUser(c.Request.Context(), services.AdminCreateUserInput{Name: request.Name, Email: request.Email, Role: request.Role, Password: request.Password})
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusCreated, dtos.AdminUserResponse{User: user})
}

func APIAdminGetUser(c *gin.Context) {
	user, err := services.GetAdminUser(c.Request.Context(), c.Param("userId"))
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, dtos.AdminUserResponse{User: user})
}

func APIAdminUpdateUser(c *gin.Context) {
	var request dtos.AdminUpdateUserRequest
	if !decodeAdminJSON(c, &request) {
		return
	}
	actor, ok := CurrentUser(c)
	if !ok {
		writeUnauthenticated(c)
		return
	}
	user, err := services.UpdateAdminUser(c.Request.Context(), actor.ID, c.Param("userId"), services.AdminUpdateUserInput{Name: request.Name, Role: request.Role})
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, dtos.AdminUserResponse{User: user})
}

func APIAdminActivateUser(c *gin.Context) {
	user, err := services.ActivateAdminUser(c.Request.Context(), c.Param("userId"))
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, dtos.AdminUserResponse{User: user})
}

func APIAdminDeactivateUser(c *gin.Context) {
	actor, ok := CurrentUser(c)
	if !ok {
		writeUnauthenticated(c)
		return
	}
	user, err := services.DeactivateAdminUser(c.Request.Context(), actor.ID, c.Param("userId"))
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, dtos.AdminUserResponse{User: user})
}

func APIAdminResetUserPassword(c *gin.Context) {
	var request dtos.AdminResetPasswordRequest
	if !decodeAdminJSON(c, &request) {
		return
	}
	if err := services.ResetAdminUserPassword(c.Request.Context(), c.Param("userId"), request.NewPassword); err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, dtos.AuthMessageResponse{Message: "Password updated"})
}

func decodeAdminJSON(c *gin.Context, target interface{}) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, adminJSONMaxBytes)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "Request is invalid", nil)
		return false
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeAPIError(c, http.StatusBadRequest, services.ErrCodeBadRequest, "Request is invalid", nil)
		return false
	}
	return true
}
