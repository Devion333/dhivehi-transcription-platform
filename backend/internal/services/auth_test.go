package services

import (
	"context"
	"database/sql"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func withMockDatabase(t *testing.T) sqlmock.Sqlmock {
	t.Helper()
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock: %v", err)
	}
	t.Cleanup(func() {
		Database = nil
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

func TestRevokeSession(t *testing.T) {
	mock := withMockDatabase(t)
	mock.ExpectExec(regexp.QuoteMeta(`UPDATE sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`)).
		WithArgs(HashSessionToken("raw-token")).WillReturnResult(sqlmock.NewResult(1, 1))
	if err := RevokeSession(context.Background(), "raw-token"); err != nil {
		t.Fatalf("RevokeSession failed: %v", err)
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
