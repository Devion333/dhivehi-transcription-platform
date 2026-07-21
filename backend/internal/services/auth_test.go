// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: auth_test.go
// Description: Unit tests
// First Written on: 03/07/2026
// Edited on: 21/07/2026
package services

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func withMockDatabase(t *testing.T) sqlmock.Sqlmock {
	t.Helper()
	RedisClient = nil
	loginLimiter.Lock()
	loginLimiter.Buckets = map[string]loginBucket{}
	loginLimiter.Unlock()
	passwordChangeLimiter.Lock()
	passwordChangeLimiter.Buckets = map[string]loginBucket{}
	passwordChangeLimiter.Unlock()
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	t.Cleanup(func() {
		Database = nil
		RedisClient = nil
		_ = db.Close()
	})
	Database = db
	return mock
}

func TestPasswordHashAndVerify(t *testing.T) {
	hash, err := HashPassword("long-enough-password")
	if err != nil {
		t.Fatalf("HashPassword failed: %v", err)
	}
	if hash == "long-enough-password" {
		t.Fatal("password hash stored plaintext")
	}
	if !VerifyPassword("long-enough-password", hash) {
		t.Fatal("expected password to verify")
	}
	if VerifyPassword("wrong-password", hash) {
		t.Fatal("wrong password verified")
	}
}

func TestPasswordRejectsWeakInitialPassword(t *testing.T) {
	if err := ValidatePasswordStrength("short"); err == nil {
		t.Fatal("expected weak password rejection")
	}
}

func TestNormalizeEmail(t *testing.T) {
	if got := NormalizeEmail("  Admin@Example.COM "); got != "admin@example.com" {
		t.Fatalf("unexpected normalized email %q", got)
	}
}

func TestLoginSuccessExcludesPasswordHash(t *testing.T) {
	mock := withMockDatabase(t)
	passwordHash, err := HashPassword("valid-password-1")
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT id, name, email, password_hash, role, is_active, created_at, updated_at, last_login_at FROM users WHERE email = $1`)).
		WithArgs("admin@example.com").
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "email", "password_hash", "role", "is_active", "created_at", "updated_at", "last_login_at"}).
			AddRow("user-id", "Admin", "admin@example.com", passwordHash, "admin", true, now, now, sql.NullTime{}))
	mock.ExpectExec(regexp.QuoteMeta(`INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at) VALUES ($1, $2, $3, $4, $5)`)).
		WithArgs(sqlmock.AnyArg(), "user-id", sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec(regexp.QuoteMeta(`UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`)).
		WithArgs("user-id").WillReturnResult(sqlmock.NewResult(1, 1))

	user, token, err := Login(context.Background(), "Admin@Example.com", "valid-password-1", "127.0.0.1:1234")
	if err != nil {
		t.Fatalf("Login failed: %v", err)
	}
	if token == "" || user.Email != "admin@example.com" || user.Role != "admin" {
		t.Fatalf("unexpected login response: %#v token=%q", user, token)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestLoginInvalidCredentials(t *testing.T) {
	mock := withMockDatabase(t)
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT id, name, email, password_hash, role, is_active, created_at, updated_at, last_login_at FROM users WHERE email = $1`)).
		WithArgs("missing@example.com").WillReturnError(sql.ErrNoRows)
	_, _, err := Login(context.Background(), "missing@example.com", "valid-password-1", "127.0.0.1:2222")
	if err == nil {
		t.Fatal("expected invalid credentials")
	}
}

func TestLoginInactiveUser(t *testing.T) {
	mock := withMockDatabase(t)
	passwordHash, _ := HashPassword("valid-password-1")
	now := time.Now()
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT id, name, email, password_hash, role, is_active, created_at, updated_at, last_login_at FROM users WHERE email = $1`)).
		WithArgs("inactive@example.com").
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "email", "password_hash", "role", "is_active", "created_at", "updated_at", "last_login_at"}).
			AddRow("user-id", "Inactive", "inactive@example.com", passwordHash, "user", false, now, now, sql.NullTime{}))
	_, _, err := Login(context.Background(), "inactive@example.com", "valid-password-1", "127.0.0.1:3333")
	if err == nil {
		t.Fatal("expected inactive login rejection")
	}
}

func TestAuthenticateSessionRejectsExpiredOrRevoked(t *testing.T) {
	mock := withMockDatabase(t)
	mock.ExpectQuery("SELECT u.id, u.name, u.email, u.role, u.is_active").
		WithArgs(HashSessionToken("raw-token")).WillReturnError(sql.ErrNoRows)
	_, err := AuthenticateSession(context.Background(), "raw-token")
	if err == nil {
		t.Fatal("expected invalid session")
	}
}

func TestAuthenticateSessionThrottlesLastSeenUpdate(t *testing.T) {
	mock := withMockDatabase(t)
	recent := time.Now().UTC().Add(-time.Minute)
	mock.ExpectQuery("SELECT u.id, u.name, u.email, u.role, u.is_active, s.last_seen_at").
		WithArgs(HashSessionToken("raw-token")).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "email", "role", "is_active", "last_seen_at"}).
			AddRow("user-id", "User", "user@example.com", "user", true, recent))
	user, err := AuthenticateSession(context.Background(), "raw-token")
	if err != nil || user.ID != "user-id" {
		t.Fatalf("unexpected auth result: %#v err=%v", user, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestAuthenticateSessionUpdatesStaleLastSeen(t *testing.T) {
	mock := withMockDatabase(t)
	stale := time.Now().UTC().Add(-10 * time.Minute)
	mock.ExpectQuery("SELECT u.id, u.name, u.email, u.role, u.is_active, s.last_seen_at").
		WithArgs(HashSessionToken("raw-token")).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "email", "role", "is_active", "last_seen_at"}).
			AddRow("user-id", "User", "user@example.com", "user", true, stale))
	mock.ExpectExec(regexp.QuoteMeta(`UPDATE sessions SET last_seen_at = NOW() WHERE token_hash = $1`)).
		WithArgs(HashSessionToken("raw-token")).WillReturnResult(sqlmock.NewResult(1, 1))
	_, err := AuthenticateSession(context.Background(), "raw-token")
	if err != nil {
		t.Fatalf("AuthenticateSession failed: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestLoginAttemptLimitAndClear(t *testing.T) {
	RedisClient = nil
	loginLimiter.Lock()
	loginLimiter.Buckets = map[string]loginBucket{}
	loginLimiter.Unlock()
	ctx := context.Background()
	for i := 0; i < loginAttemptLimit; i++ {
		recordFailedLoginAttempt(ctx, "192.0.2.50:1234", "user@example.com")
	}
	if !isLoginRateLimited(ctx, "192.0.2.50:1234", "user@example.com") {
		t.Fatal("expected login attempt to be rate limited")
	}
	clearLoginAttempts(ctx, "192.0.2.50:1234", "user@example.com")
	if isLoginRateLimited(ctx, "192.0.2.50:1234", "user@example.com") {
		t.Fatal("expected successful login clear to remove rate limit")
	}
}

func TestRevokeSession(t *testing.T) {
	mock := withMockDatabase(t)
	mock.ExpectExec(regexp.QuoteMeta(`UPDATE sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`)).
		WithArgs(HashSessionToken("raw-token")).WillReturnResult(sqlmock.NewResult(1, 1))
	if err := RevokeSession(context.Background(), "raw-token"); err != nil {
		t.Fatalf("RevokeSession failed: %v", err)
	}
}

type passwordHashForNewPassword struct {
	NewPassword string
	OldPassword string
}

func (m passwordHashForNewPassword) Match(value driver.Value) bool {
	hash, ok := value.(string)
	return ok && VerifyPassword(m.NewPassword, hash) && !VerifyPassword(m.OldPassword, hash) && !strings.Contains(hash, m.NewPassword) && !strings.Contains(hash, m.OldPassword)
}

func TestChangeOwnPasswordRejectsIncorrectCurrentPassword(t *testing.T) {
	mock := withMockDatabase(t)
	passwordHash, _ := HashPassword("current-password-1")
	now := time.Now()
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT id, name, email, password_hash, role, is_active, created_at, updated_at, last_login_at FROM users WHERE id = $1 FOR UPDATE`)).
		WithArgs("user-id").
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "email", "password_hash", "role", "is_active", "created_at", "updated_at", "last_login_at"}).
			AddRow("user-id", "User", "user@example.com", passwordHash, "user", true, now, now, sql.NullTime{}))
	mock.ExpectRollback()

	err := ChangeOwnPassword(context.Background(), "user-id", "wrong-password", "new-password-1", "current-token")
	if err == nil {
		t.Fatal("expected error")
	}
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) || serviceErr.Code != ErrCodeInvalidCurrentPassword {
		t.Fatalf("expected invalid current password, got %#v", err)
	}
}

func TestChangeOwnPasswordRejectsWeakNewPassword(t *testing.T) {
	err := ChangeOwnPassword(context.Background(), "user-id", "current-password-1", "short", "current-token")
	if err == nil {
		t.Fatal("expected error")
	}
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) || serviceErr.Code != ErrCodePasswordPolicyFailed {
		t.Fatalf("expected policy error, got %#v", err)
	}
}

func TestChangeOwnPasswordRejectsUnchangedPassword(t *testing.T) {
	mock := withMockDatabase(t)
	passwordHash, _ := HashPassword("current-password-1")
	now := time.Now()
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT id, name, email, password_hash, role, is_active, created_at, updated_at, last_login_at FROM users WHERE id = $1 FOR UPDATE`)).
		WithArgs("user-id").
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "email", "password_hash", "role", "is_active", "created_at", "updated_at", "last_login_at"}).
			AddRow("user-id", "User", "user@example.com", passwordHash, "user", true, now, now, sql.NullTime{}))
	mock.ExpectRollback()

	err := ChangeOwnPassword(context.Background(), "user-id", "current-password-1", "current-password-1", "current-token")
	if err == nil {
		t.Fatal("expected error")
	}
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) || serviceErr.Code != ErrCodePasswordUnchanged {
		t.Fatalf("expected unchanged error, got %#v", err)
	}
}

func TestChangeOwnPasswordUpdatesPasswordAndRevokesOtherSessions(t *testing.T) {
	mock := withMockDatabase(t)
	passwordHash, _ := HashPassword("current-password-1")
	now := time.Now()
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT id, name, email, password_hash, role, is_active, created_at, updated_at, last_login_at FROM users WHERE id = $1 FOR UPDATE`)).
		WithArgs("user-id").
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "email", "password_hash", "role", "is_active", "created_at", "updated_at", "last_login_at"}).
			AddRow("user-id", "User", "user@example.com", passwordHash, "user", true, now, now, sql.NullTime{}))
	mock.ExpectExec(regexp.QuoteMeta(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`)).
		WithArgs(passwordHashForNewPassword{NewPassword: "new-password-1", OldPassword: "current-password-1"}, "user-id").
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec(regexp.QuoteMeta(`UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND token_hash <> $2 AND revoked_at IS NULL`)).
		WithArgs("user-id", HashSessionToken("current-token")).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	if err := ChangeOwnPassword(context.Background(), "user-id", "current-password-1", "new-password-1", "current-token"); err != nil {
		t.Fatalf("ChangeOwnPassword failed: %v", err)
	}
}

func TestChangeOwnPasswordRateLimit(t *testing.T) {
	RedisClient = nil
	passwordChangeLimiter.Lock()
	passwordChangeLimiter.Buckets = map[string]loginBucket{}
	passwordChangeLimiter.Unlock()
	for i := 0; i < passwordChangeAttemptLimit; i++ {
		recordFailedPasswordChangeAttempt(context.Background(), "user-id")
	}
	err := ChangeOwnPassword(context.Background(), "user-id", "current-password-1", "new-password-1", "current-token")
	if err == nil {
		t.Fatal("expected rate limit error")
	}
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) || serviceErr.Code != ErrCodeRateLimited {
		t.Fatalf("expected rate limit error, got %#v", err)
	}
}

func TestGetOwnProfileReturnsAuthenticatedProfile(t *testing.T) {
	mock := withMockDatabase(t)
	now := time.Date(2026, 7, 18, 12, 0, 0, 0, time.UTC)
	lastLogin := sql.NullTime{Time: now.Add(-time.Hour), Valid: true}
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT id, name, email, password_hash, role, is_active, created_at, updated_at, last_login_at FROM users WHERE id = $1`)).
		WithArgs("user-id").
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "email", "password_hash", "role", "is_active", "created_at", "updated_at", "last_login_at"}).AddRow("user-id", "User", "user@example.com", "hash", "user", true, now, now, lastLogin))
	profile, err := GetOwnProfile(context.Background(), "user-id")
	if err != nil {
		t.Fatalf("GetOwnProfile failed: %v", err)
	}
	if profile.ID != "user-id" || profile.DisplayName != "User" || profile.Status != "active" || profile.LastLoginAt == nil {
		t.Fatalf("unexpected profile: %+v", profile)
	}
}

func TestUpdateOwnProfileNormalizesDisplayName(t *testing.T) {
	mock := withMockDatabase(t)
	now := time.Now()
	mock.ExpectBegin()
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT id, name, email, password_hash, role, is_active, created_at, updated_at, last_login_at FROM users WHERE id = $1 FOR UPDATE`)).
		WithArgs("user-id").
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "email", "password_hash", "role", "is_active", "created_at", "updated_at", "last_login_at"}).AddRow("user-id", "Old", "user@example.com", "hash", "user", true, now, now, sql.NullTime{}))
	mock.ExpectExec(regexp.QuoteMeta(`UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2`)).
		WithArgs("Updated Name", "user-id").WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()
	profile, err := UpdateOwnProfile(context.Background(), "user-id", "  Updated   Name  ")
	if err != nil {
		t.Fatalf("UpdateOwnProfile failed: %v", err)
	}
	if profile.DisplayName != "Updated Name" || profile.Email != "user@example.com" || profile.Role != "user" {
		t.Fatalf("unexpected profile: %+v", profile)
	}
}

func TestNormalizeDisplayNameRejectsInvalidValues(t *testing.T) {
	for _, value := range []string{"", "   ", strings.Repeat("a", maxDisplayNameRunes+1), "Bad\x00Name"} {
		if _, err := NormalizeDisplayName(value); err == nil {
			t.Fatalf("expected %q to be rejected", value)
		}
	}
}

func TestProfileAuditMetadataExcludesDisplayNames(t *testing.T) {
	metadata, err := SanitizeAuditMetadata("profile_updated", map[string]interface{}{"changedFields": []string{"displayName"}, "oldDisplayName": "Old", "newDisplayName": "New"})
	if err != nil {
		t.Fatalf("sanitize failed: %v", err)
	}
	if metadata["oldDisplayName"] != nil || metadata["newDisplayName"] != nil {
		t.Fatalf("display names leaked into audit metadata: %+v", metadata)
	}
}

func TestBootstrapInitialAdminIdempotent(t *testing.T) {
	t.Setenv("INITIAL_ADMIN_NAME", "Admin")
	t.Setenv("INITIAL_ADMIN_EMAIL", "admin@example.com")
	t.Setenv("INITIAL_ADMIN_PASSWORD", "valid-password-1")
	mock := withMockDatabase(t)
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT EXISTS (SELECT 1 FROM users WHERE email = $1)`)).
		WithArgs("admin@example.com").WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	if err := BootstrapInitialAdmin(context.Background()); err != nil {
		t.Fatalf("BootstrapInitialAdmin failed: %v", err)
	}
}
