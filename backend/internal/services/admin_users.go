package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/mail"
	"strings"
	"time"

	"transcript_app/backend/internal/dtos"

	"github.com/google/uuid"
)

const maxAdminUsersPageSize = 100

type AdminUserFilters struct {
	Page     int
	PageSize int
	Search   string
	Role     string
	Status   string
}

type AdminCreateUserInput struct {
	Name     string
	Email    string
	Role     string
	Password string
}

type AdminUpdateUserInput struct {
	Name *string
	Role *string
}

func ListAdminUsers(ctx context.Context, filters AdminUserFilters) (dtos.AdminUserListResponse, error) {
	filters = normalizeAdminUserFilters(filters)
	where, args, err := adminUserWhere(filters)
	if err != nil {
		return dtos.AdminUserListResponse{}, err
	}

	var total int
	countQuery := `SELECT COUNT(*) FROM users` + where
	if err := Database.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return dtos.AdminUserListResponse{}, err
	}

	offset := (filters.Page - 1) * filters.PageSize
	queryArgs := append(append([]interface{}{}, args...), filters.PageSize, offset)
	limitPlaceholder := len(args) + 1
	offsetPlaceholder := len(args) + 2
	query := fmt.Sprintf(`SELECT id, name, email, role, is_active, created_at, updated_at, last_login_at FROM users%s ORDER BY created_at DESC, id DESC LIMIT $%d OFFSET $%d`, where, limitPlaceholder, offsetPlaceholder)
	rows, err := Database.QueryContext(ctx, query, queryArgs...)
	if err != nil {
		return dtos.AdminUserListResponse{}, err
	}
	defer rows.Close()

	items := []dtos.AdminUserSummary{}
	for rows.Next() {
		user, err := scanAdminUser(rows)
		if err != nil {
			return dtos.AdminUserListResponse{}, err
		}
		items = append(items, adminUserDTO(user))
	}
	if err := rows.Err(); err != nil {
		return dtos.AdminUserListResponse{}, err
	}

	totalPages := 0
	if total > 0 {
		totalPages = (total + filters.PageSize - 1) / filters.PageSize
	}
	return dtos.AdminUserListResponse{
		Items:      items,
		Pagination: dtos.Pagination{Page: filters.Page, PageSize: filters.PageSize, Total: total, TotalPages: totalPages, HasNextPage: filters.Page < totalPages},
	}, nil
}

func CreateAdminUser(ctx context.Context, input AdminCreateUserInput) (dtos.AdminUserDetail, error) {
	name, email, role, err := validateAdminUserInput(input.Name, input.Email, input.Role)
	if err != nil {
		return dtos.AdminUserDetail{}, err
	}
	if err := ValidatePasswordStrength(input.Password); err != nil {
		return dtos.AdminUserDetail{}, newServiceError(ErrCodeWeakPassword, err)
	}

	var exists bool
	if err := Database.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM users WHERE email = $1)`, email).Scan(&exists); err != nil {
		return dtos.AdminUserDetail{}, err
	}
	if exists {
		return dtos.AdminUserDetail{}, newServiceError(ErrCodeEmailExists, errors.New("email already exists"))
	}

	passwordHash, err := HashPassword(input.Password)
	if err != nil {
		return dtos.AdminUserDetail{}, newServiceError(ErrCodeWeakPassword, err)
	}
	id := uuid.NewString()
	row := Database.QueryRowContext(ctx, `INSERT INTO users (id, name, email, password_hash, role, is_active) VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id, name, email, role, is_active, created_at, updated_at, last_login_at`, id, name, email, passwordHash, role)
	user, err := scanAdminUserRow(row)
	if err != nil {
		return dtos.AdminUserDetail{}, err
	}
	return adminUserDTO(user), nil
}

func GetAdminUser(ctx context.Context, userID string) (dtos.AdminUserDetail, error) {
	if _, err := uuid.Parse(userID); err != nil {
		return dtos.AdminUserDetail{}, newServiceError(ErrCodeUserNotFound, errors.New("user not found"))
	}
	row := Database.QueryRowContext(ctx, `SELECT id, name, email, role, is_active, created_at, updated_at, last_login_at FROM users WHERE id = $1`, userID)
	user, err := scanAdminUserRow(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return dtos.AdminUserDetail{}, newServiceError(ErrCodeUserNotFound, errors.New("user not found"))
		}
		return dtos.AdminUserDetail{}, err
	}
	return adminUserDTO(user), nil
}

func UpdateAdminUser(ctx context.Context, actorID, userID string, input AdminUpdateUserInput) (dtos.AdminUserDetail, error) {
	if _, err := uuid.Parse(userID); err != nil {
		return dtos.AdminUserDetail{}, newServiceError(ErrCodeUserNotFound, errors.New("user not found"))
	}
	tx, err := Database.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return dtos.AdminUserDetail{}, err
	}
	defer tx.Rollback()

	current, err := getAdminUserForUpdate(ctx, tx, userID)
	if err != nil {
		return dtos.AdminUserDetail{}, err
	}
	name := current.Name
	if input.Name != nil {
		name = strings.TrimSpace(*input.Name)
		if name == "" {
			return dtos.AdminUserDetail{}, newServiceError(ErrCodeInvalidUserInput, errors.New("name is required"))
		}
	}
	role := current.Role
	if input.Role != nil {
		role = strings.ToLower(strings.TrimSpace(*input.Role))
		if !isValidUserRole(role) {
			return dtos.AdminUserDetail{}, newServiceError(ErrCodeInvalidRole, errors.New("invalid role"))
		}
	}
	if current.ID == actorID && current.Role == UserRoleAdmin && current.IsActive && role == UserRoleUser {
		if err := ensureAnotherActiveAdmin(ctx, tx, current.ID); err != nil {
			return dtos.AdminUserDetail{}, err
		}
	}
	if current.Role == UserRoleAdmin && current.IsActive && role == UserRoleUser {
		if err := ensureAnotherActiveAdmin(ctx, tx, current.ID); err != nil {
			return dtos.AdminUserDetail{}, err
		}
	}
	row := tx.QueryRowContext(ctx, `UPDATE users SET name = $1, role = $2, updated_at = NOW() WHERE id = $3 RETURNING id, name, email, role, is_active, created_at, updated_at, last_login_at`, name, role, userID)
	updated, err := scanAdminUserRow(row)
	if err != nil {
		return dtos.AdminUserDetail{}, err
	}
	if err := tx.Commit(); err != nil {
		return dtos.AdminUserDetail{}, err
	}
	return adminUserDTO(updated), nil
}

func ActivateAdminUser(ctx context.Context, userID string) (dtos.AdminUserDetail, error) {
	if _, err := uuid.Parse(userID); err != nil {
		return dtos.AdminUserDetail{}, newServiceError(ErrCodeUserNotFound, errors.New("user not found"))
	}
	row := Database.QueryRowContext(ctx, `UPDATE users SET is_active = TRUE, updated_at = NOW() WHERE id = $1 RETURNING id, name, email, role, is_active, created_at, updated_at, last_login_at`, userID)
	user, err := scanAdminUserRow(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return dtos.AdminUserDetail{}, newServiceError(ErrCodeUserNotFound, errors.New("user not found"))
		}
		return dtos.AdminUserDetail{}, err
	}
	return adminUserDTO(user), nil
}

func DeactivateAdminUser(ctx context.Context, actorID, userID string) (dtos.AdminUserDetail, error) {
	if actorID == userID {
		return dtos.AdminUserDetail{}, newServiceError(ErrCodeCannotDeactivateSelf, errors.New("cannot deactivate self"))
	}
	if _, err := uuid.Parse(userID); err != nil {
		return dtos.AdminUserDetail{}, newServiceError(ErrCodeUserNotFound, errors.New("user not found"))
	}
	tx, err := Database.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return dtos.AdminUserDetail{}, err
	}
	defer tx.Rollback()

	current, err := getAdminUserForUpdate(ctx, tx, userID)
	if err != nil {
		return dtos.AdminUserDetail{}, err
	}
	if current.Role == UserRoleAdmin && current.IsActive {
		if err := ensureAnotherActiveAdmin(ctx, tx, current.ID); err != nil {
			return dtos.AdminUserDetail{}, err
		}
	}
	row := tx.QueryRowContext(ctx, `UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id, name, email, role, is_active, created_at, updated_at, last_login_at`, userID)
	updated, err := scanAdminUserRow(row)
	if err != nil {
		return dtos.AdminUserDetail{}, err
	}
	if err := revokeAllSessionsForUser(ctx, tx, userID); err != nil {
		return dtos.AdminUserDetail{}, err
	}
	if err := tx.Commit(); err != nil {
		return dtos.AdminUserDetail{}, err
	}
	return adminUserDTO(updated), nil
}

func ResetAdminUserPassword(ctx context.Context, userID, newPassword string) error {
	if _, err := uuid.Parse(userID); err != nil {
		return newServiceError(ErrCodeUserNotFound, errors.New("user not found"))
	}
	if err := ValidatePasswordStrength(newPassword); err != nil {
		return newServiceError(ErrCodeWeakPassword, err)
	}
	passwordHash, err := HashPassword(newPassword)
	if err != nil {
		return newServiceError(ErrCodeWeakPassword, err)
	}
	tx, err := Database.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	result, err := tx.ExecContext(ctx, `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, passwordHash, userID)
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return newServiceError(ErrCodeUserNotFound, errors.New("user not found"))
	}
	if err := revokeAllSessionsForUser(ctx, tx, userID); err != nil {
		return err
	}
	return tx.Commit()
}

func RevokeAllSessionsForUser(ctx context.Context, userID string) error {
	if _, err := uuid.Parse(userID); err != nil {
		return newServiceError(ErrCodeUserNotFound, errors.New("user not found"))
	}
	return revokeAllSessionsForUser(ctx, Database, userID)
}

type sessionRevoker interface {
	ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error)
}

func revokeAllSessionsForUser(ctx context.Context, execer sessionRevoker, userID string) error {
	_, err := execer.ExecContext(ctx, `UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`, userID)
	return err
}

func revokeOtherSessionsForUser(ctx context.Context, execer sessionRevoker, userID, currentTokenHash string) error {
	_, err := execer.ExecContext(ctx, `UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND token_hash <> $2 AND revoked_at IS NULL`, userID, currentTokenHash)
	return err
}

func normalizeAdminUserFilters(filters AdminUserFilters) AdminUserFilters {
	if filters.Page < 1 {
		filters.Page = 1
	}
	if filters.PageSize < 1 {
		filters.PageSize = 20
	}
	if filters.PageSize > maxAdminUsersPageSize {
		filters.PageSize = maxAdminUsersPageSize
	}
	filters.Search = strings.TrimSpace(filters.Search)
	filters.Role = strings.ToLower(strings.TrimSpace(filters.Role))
	filters.Status = strings.ToLower(strings.TrimSpace(filters.Status))
	return filters
}

func adminUserWhere(filters AdminUserFilters) (string, []interface{}, error) {
	clauses := []string{}
	args := []interface{}{}
	if filters.Search != "" {
		args = append(args, "%"+strings.ToLower(filters.Search)+"%")
		clauses = append(clauses, fmt.Sprintf(`(LOWER(name) LIKE $%d OR LOWER(email) LIKE $%d)`, len(args), len(args)))
	}
	if filters.Role != "" {
		if !isValidUserRole(filters.Role) {
			return "", nil, newServiceError(ErrCodeInvalidRole, errors.New("invalid role"))
		}
		args = append(args, filters.Role)
		clauses = append(clauses, fmt.Sprintf(`role = $%d`, len(args)))
	}
	if filters.Status != "" {
		switch filters.Status {
		case "active":
			clauses = append(clauses, `is_active = TRUE`)
		case "inactive":
			clauses = append(clauses, `is_active = FALSE`)
		default:
			return "", nil, newServiceError(ErrCodeInvalidUserInput, errors.New("invalid status"))
		}
	}
	if len(clauses) == 0 {
		return "", args, nil
	}
	return " WHERE " + strings.Join(clauses, " AND "), args, nil
}

func validateAdminUserInput(name, email, role string) (string, string, string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", "", "", newServiceError(ErrCodeInvalidUserInput, errors.New("name is required"))
	}
	email = NormalizeEmail(email)
	if email == "" {
		return "", "", "", newServiceError(ErrCodeInvalidUserInput, errors.New("email is required"))
	}
	if _, err := mail.ParseAddress(email); err != nil {
		return "", "", "", newServiceError(ErrCodeInvalidUserInput, errors.New("email is invalid"))
	}
	role = strings.ToLower(strings.TrimSpace(role))
	if !isValidUserRole(role) {
		return "", "", "", newServiceError(ErrCodeInvalidRole, errors.New("invalid role"))
	}
	return name, email, role, nil
}

func isValidUserRole(role string) bool {
	return role == UserRoleUser || role == UserRoleAdmin
}

func getAdminUserForUpdate(ctx context.Context, tx *sql.Tx, userID string) (AuthUserRecord, error) {
	row := tx.QueryRowContext(ctx, `SELECT id, name, email, password_hash, role, is_active, created_at, updated_at, last_login_at FROM users WHERE id = $1 FOR UPDATE`, userID)
	var user AuthUserRecord
	err := row.Scan(&user.ID, &user.Name, &user.Email, &user.PasswordHash, &user.Role, &user.IsActive, &user.CreatedAt, &user.UpdatedAt, &user.LastLoginAt)
	if errors.Is(err, sql.ErrNoRows) {
		return AuthUserRecord{}, newServiceError(ErrCodeUserNotFound, errors.New("user not found"))
	}
	return user, err
}

func ensureAnotherActiveAdmin(ctx context.Context, tx *sql.Tx, userID string) error {
	rows, err := tx.QueryContext(ctx, `SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE FOR UPDATE`)
	if err != nil {
		return err
	}
	defer rows.Close()
	count := 0
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return err
		}
		if id != userID {
			count++
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if count == 0 {
		return newServiceError(ErrCodeLastActiveAdmin, errors.New("last active administrator"))
	}
	return nil
}

type adminUserScanner interface {
	Scan(dest ...interface{}) error
}

func scanAdminUserRow(row adminUserScanner) (AuthUserRecord, error) {
	var user AuthUserRecord
	err := row.Scan(&user.ID, &user.Name, &user.Email, &user.Role, &user.IsActive, &user.CreatedAt, &user.UpdatedAt, &user.LastLoginAt)
	return user, err
}

func scanAdminUser(rows *sql.Rows) (AuthUserRecord, error) {
	return scanAdminUserRow(rows)
}

func adminUserDTO(user AuthUserRecord) dtos.AdminUserSummary {
	createdAt := user.CreatedAt.UTC().Format(time.RFC3339)
	updatedAt := user.UpdatedAt.UTC().Format(time.RFC3339)
	var lastLoginAt *string
	if user.LastLoginAt.Valid {
		value := user.LastLoginAt.Time.UTC().Format(time.RFC3339)
		lastLoginAt = &value
	}
	return dtos.AdminUserSummary{ID: user.ID, Name: user.Name, Email: user.Email, Role: user.Role, IsActive: user.IsActive, CreatedAt: createdAt, UpdatedAt: updatedAt, LastLoginAt: lastLoginAt}
}
