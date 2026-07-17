package services

import (
	"context"
	"database/sql"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

const (
	adminID = "11111111-1111-1111-1111-111111111111"
	userID  = "22222222-2222-2222-2222-222222222222"
)

func adminUserRows() *sqlmock.Rows {
	now := time.Now().UTC()
	return sqlmock.NewRows([]string{"id", "name", "email", "role", "is_active", "created_at", "updated_at", "last_login_at"}).
		AddRow(userID, "Analyst", "analyst@example.com", "user", true, now, now, sql.NullTime{})
}

func TestListAdminUsersPaginationAndFilters(t *testing.T) {
	mock := withMockDatabase(t)
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT COUNT(*) FROM users WHERE (LOWER(name) LIKE $1 OR LOWER(email) LIKE $1) AND role = $2 AND is_active = TRUE`)).
		WithArgs("%ana%", "user").WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT id, name, email, role, is_active, created_at, updated_at, last_login_at FROM users WHERE (LOWER(name) LIKE $1 OR LOWER(email) LIKE $1) AND role = $2 AND is_active = TRUE ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4`)).
		WithArgs("%ana%", "user", 100, 0).WillReturnRows(adminUserRows())
	result, err := ListAdminUsers(context.Background(), AdminUserFilters{Page: -1, PageSize: 500, Search: "Ana", Role: "user", Status: "active"})
	if err != nil {
		t.Fatalf("ListAdminUsers failed: %v", err)
	}
	if result.Pagination.Page != 1 || result.Pagination.PageSize != 100 || len(result.Items) != 1 {
		t.Fatalf("unexpected list result: %#v", result)
	}
}

func TestListAdminUsersInvalidRole(t *testing.T) {
	_ = withMockDatabase(t)
	_, err := ListAdminUsers(context.Background(), AdminUserFilters{Role: "owner"})
	if err == nil || !strings.Contains(err.Error(), "invalid role") {
		t.Fatalf("expected invalid role error, got %v", err)
	}
}

func TestCreateAdminUserSuccess(t *testing.T) {
	mock := withMockDatabase(t)
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT EXISTS (SELECT 1 FROM users WHERE email = $1)`)).WithArgs("analyst@example.com").WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	mock.ExpectQuery(regexp.QuoteMeta(`INSERT INTO users (id, name, email, password_hash, role, is_active) VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id, name, email, role, is_active, created_at, updated_at, last_login_at`)).
		WithArgs(sqlmock.AnyArg(), "Analyst", "analyst@example.com", sqlmock.AnyArg(), "user").WillReturnRows(adminUserRows())
	user, err := CreateAdminUser(context.Background(), AdminCreateUserInput{Name: " Analyst ", Email: "Analyst@Example.com", Role: "user", Password: "valid-password-1"})
	if err != nil {
		t.Fatalf("CreateAdminUser failed: %v", err)
	}
	if user.Email != "analyst@example.com" || user.Role != "user" {
		t.Fatalf("unexpected user: %#v", user)
	}
}

func TestCreateAdminUserDuplicateEmail(t *testing.T) {
	mock := withMockDatabase(t)
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT EXISTS (SELECT 1 FROM users WHERE email = $1)`)).WithArgs("analyst@example.com").WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	_, err := CreateAdminUser(context.Background(), AdminCreateUserInput{Name: "Analyst", Email: "analyst@example.com", Role: "user", Password: "valid-password-1"})
	if err == nil {
		t.Fatal("expected duplicate email error")
	}
}

func TestCreateAdminUserInvalidRoleAndWeakPassword(t *testing.T) {
	_ = withMockDatabase(t)
	if _, err := CreateAdminUser(context.Background(), AdminCreateUserInput{Name: "Analyst", Email: "analyst@example.com", Role: "owner", Password: "valid-password-1"}); err == nil {
		t.Fatal("expected invalid role")
	}
	if _, err := CreateAdminUser(context.Background(), AdminCreateUserInput{Name: "Analyst", Email: "analyst@example.com", Role: "user", Password: "short"}); err == nil {
		t.Fatal("expected weak password")
	}
}

func TestUpdateAdminUserNameAndRole(t *testing.T) {
	mock := withMockDatabase(t)
	name := "Updated"
	role := "admin"
	now := time.Now().UTC()
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT id, name, email, password_hash, role, is_active, created_at, updated_at, last_login_at FROM users WHERE id = $1 FOR UPDATE`)).
		WithArgs(userID).WillReturnRows(sqlmock.NewRows([]string{"id", "name", "email", "password_hash", "role", "is_active", "created_at", "updated_at", "last_login_at"}).AddRow(userID, "Analyst", "analyst@example.com", "hash", "user", true, now, now, sql.NullTime{}))
	mock.ExpectQuery(regexp.QuoteMeta(`UPDATE users SET name = $1, role = $2, updated_at = NOW() WHERE id = $3 RETURNING id, name, email, role, is_active, created_at, updated_at, last_login_at`)).
		WithArgs("Updated", "admin", userID).WillReturnRows(sqlmock.NewRows([]string{"id", "name", "email", "role", "is_active", "created_at", "updated_at", "last_login_at"}).AddRow(userID, "Updated", "analyst@example.com", "admin", true, now, now, sql.NullTime{}))
	mock.ExpectCommit()
	updated, err := UpdateAdminUser(context.Background(), adminID, userID, AdminUpdateUserInput{Name: &name, Role: &role})
	if err != nil {
		t.Fatalf("UpdateAdminUser failed: %v", err)
	}
	if updated.Name != "Updated" || updated.Role != "admin" {
		t.Fatalf("unexpected updated user: %#v", updated)
	}
}

func TestCannotDemoteLastActiveAdmin(t *testing.T) {
	mock := withMockDatabase(t)
	role := "user"
	now := time.Now().UTC()
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT id, name, email, password_hash").WithArgs(adminID).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "email", "password_hash", "role", "is_active", "created_at", "updated_at", "last_login_at"}).AddRow(adminID, "Admin", "admin@example.com", "hash", "admin", true, now, now, sql.NullTime{}))
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE FOR UPDATE`)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(adminID))
	mock.ExpectRollback()
	_, err := UpdateAdminUser(context.Background(), adminID, adminID, AdminUpdateUserInput{Role: &role})
	if err == nil {
		t.Fatal("expected last admin safeguard")
	}
}

func TestActivateAdminUser(t *testing.T) {
	mock := withMockDatabase(t)
	mock.ExpectQuery(regexp.QuoteMeta(`UPDATE users SET is_active = TRUE, updated_at = NOW() WHERE id = $1 RETURNING id, name, email, role, is_active, created_at, updated_at, last_login_at`)).
		WithArgs(userID).WillReturnRows(adminUserRows())
	if _, err := ActivateAdminUser(context.Background(), userID); err != nil {
		t.Fatalf("ActivateAdminUser failed: %v", err)
	}
}

func TestDeactivateRevokesSessionsAndRejectsSelf(t *testing.T) {
	if _, err := DeactivateAdminUser(context.Background(), adminID, adminID); err == nil {
		t.Fatal("expected self-deactivation rejection")
	}
	mock := withMockDatabase(t)
	now := time.Now().UTC()
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT id, name, email, password_hash").WithArgs(userID).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "email", "password_hash", "role", "is_active", "created_at", "updated_at", "last_login_at"}).AddRow(userID, "Analyst", "analyst@example.com", "hash", "user", true, now, now, sql.NullTime{}))
	mock.ExpectQuery(regexp.QuoteMeta(`UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id, name, email, role, is_active, created_at, updated_at, last_login_at`)).
		WithArgs(userID).WillReturnRows(sqlmock.NewRows([]string{"id", "name", "email", "role", "is_active", "created_at", "updated_at", "last_login_at"}).AddRow(userID, "Analyst", "analyst@example.com", "user", false, now, now, sql.NullTime{}))
	mock.ExpectExec(regexp.QuoteMeta(`UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`)).WithArgs(userID).WillReturnResult(sqlmock.NewResult(1, 2))
	mock.ExpectCommit()
	user, err := DeactivateAdminUser(context.Background(), adminID, userID)
	if err != nil {
		t.Fatalf("DeactivateAdminUser failed: %v", err)
	}
	if user.IsActive {
		t.Fatal("expected inactive user")
	}
}

func TestCannotDeactivateLastActiveAdmin(t *testing.T) {
	mock := withMockDatabase(t)
	now := time.Now().UTC()
	mock.ExpectBegin()
	mock.ExpectQuery("SELECT id, name, email, password_hash").WithArgs(adminID).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "email", "password_hash", "role", "is_active", "created_at", "updated_at", "last_login_at"}).AddRow(adminID, "Admin", "admin@example.com", "hash", "admin", true, now, now, sql.NullTime{}))
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE FOR UPDATE`)).WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(adminID))
	mock.ExpectRollback()
	_, err := DeactivateAdminUser(context.Background(), userID, adminID)
	if err == nil {
		t.Fatal("expected last admin safeguard")
	}
}

func TestResetPasswordHashesAndRevokesSessions(t *testing.T) {
	mock := withMockDatabase(t)
	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`)).
		WithArgs(sqlmock.AnyArg(), userID).WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec(regexp.QuoteMeta(`UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`)).WithArgs(userID).WillReturnResult(sqlmock.NewResult(1, 2))
	mock.ExpectCommit()
	if err := ResetAdminUserPassword(context.Background(), userID, "new-valid-password"); err != nil {
		t.Fatalf("ResetAdminUserPassword failed: %v", err)
	}
}

func TestAdminDTOExcludesPasswordHash(t *testing.T) {
	user := adminUserDTO(AuthUserRecord{ID: userID, Name: "Analyst", Email: "analyst@example.com", Role: "user", IsActive: true, CreatedAt: time.Now(), UpdatedAt: time.Now()})
	if strings.Contains(strings.ToLower(user.Email+user.Name+user.Role), "hash") {
		t.Fatal("safe DTO leaked hash-like data")
	}
}
