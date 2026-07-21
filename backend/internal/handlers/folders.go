// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: folders.go
// Description: HTTP handler for folders
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

func APIListFolders(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	response, err := services.ListFolders(c.Request.Context(), transcriptAccessScope(c), services.FolderListFilters{Page: page, PageSize: pageSize, Search: c.Query("search"), OwnerUserID: c.Query("ownerUserId")})
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, response)
}

func APICreateFolder(c *gin.Context) {
	user, ok := CurrentUser(c)
	if !ok {
		writeUnauthenticated(c)
		return
	}
	var request dtos.FolderRequest
	if !decodeStrictAPIJSON(c, &request) {
		return
	}
	folder, err := services.CreateFolder(c.Request.Context(), transcriptAccessScope(c), user, request.Name, request.Description)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	auditRequestEvent(c, services.AuditEventInput{Action: "folder_created", Category: "folder", ResourceType: "folder", ResourceID: folder.ID, Outcome: services.AuditOutcomeSuccess, Metadata: map[string]interface{}{"folderId": folder.ID}})
	c.JSON(http.StatusCreated, dtos.FolderResponse{Folder: folder})
}

func APIGetFolder(c *gin.Context) {
	response, err := services.GetFolderDetail(c.Request.Context(), transcriptAccessScope(c), strings.TrimSpace(c.Param("folderId")))
	if err != nil {
		writeServiceError(c, err)
		return
	}
	c.JSON(http.StatusOK, response)
}

func APIUpdateFolder(c *gin.Context) {
	folderID := strings.TrimSpace(c.Param("folderId"))
	var request dtos.FolderRequest
	if !decodeStrictAPIJSON(c, &request) {
		return
	}
	folder, err := services.UpdateFolder(c.Request.Context(), transcriptAccessScope(c), folderID, request.Name, request.Description)
	if err != nil {
		writeServiceError(c, err)
		return
	}
	auditRequestEvent(c, services.AuditEventInput{Action: "folder_updated", Category: "folder", ResourceType: "folder", ResourceID: folder.ID, Outcome: services.AuditOutcomeSuccess, Metadata: map[string]interface{}{"folderId": folder.ID}})
	c.JSON(http.StatusOK, dtos.FolderResponse{Folder: folder})
}

func APIDeleteFolder(c *gin.Context) {
	folderID := strings.TrimSpace(c.Param("folderId"))
	if err := services.DeleteFolder(c.Request.Context(), transcriptAccessScope(c), folderID); err != nil {
		writeServiceError(c, err)
		return
	}
	auditRequestEvent(c, services.AuditEventInput{Action: "folder_deleted", Category: "folder", ResourceType: "folder", ResourceID: folderID, Outcome: services.AuditOutcomeSuccess, Metadata: map[string]interface{}{"folderId": folderID}})
	c.JSON(http.StatusOK, gin.H{"deleted": true})
}

func APIAddTranscriptToFolder(c *gin.Context) {
	folderID := strings.TrimSpace(c.Param("folderId"))
	var request dtos.FolderTranscriptRequest
	if !decodeStrictAPIJSON(c, &request) {
		return
	}
	if err := services.AddTranscriptToFolder(c.Request.Context(), transcriptAccessScope(c), folderID, request.JobID); err != nil {
		writeServiceError(c, err)
		return
	}
	auditRequestEvent(c, services.AuditEventInput{Action: "transcript_added_to_folder", Category: "folder", ResourceType: "folder", ResourceID: folderID, Outcome: services.AuditOutcomeSuccess, Metadata: map[string]interface{}{"folderId": folderID, "jobId": strings.TrimSpace(request.JobID)}})
	c.JSON(http.StatusOK, gin.H{"added": true})
}

func APIRemoveTranscriptFromFolder(c *gin.Context) {
	folderID := strings.TrimSpace(c.Param("folderId"))
	jobID := strings.TrimSpace(c.Param("jobId"))
	if err := services.RemoveTranscriptFromFolder(c.Request.Context(), transcriptAccessScope(c), folderID, jobID); err != nil {
		writeServiceError(c, err)
		return
	}
	auditRequestEvent(c, services.AuditEventInput{Action: "transcript_removed_from_folder", Category: "folder", ResourceType: "folder", ResourceID: folderID, Outcome: services.AuditOutcomeSuccess, Metadata: map[string]interface{}{"folderId": folderID, "jobId": jobID}})
	c.JSON(http.StatusOK, gin.H{"removed": true})
}
