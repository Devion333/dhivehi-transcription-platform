package services

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"transcript_app/backend/internal/dtos"

	"github.com/google/uuid"
	redis "github.com/redis/go-redis/v9"
	"golang.org/x/crypto/argon2"
)

const (
	UserRoleUser                = "user"
	UserRoleAdmin               = "admin"
	MinPasswordLength           = 10
	defaultCookieName           = "transcript_session"
	defaultSessionLife          = 12 * time.Hour
	loginAttemptLimit           = 5
	loginAttemptWindow          = 15 * time.Minute
	passwordChangeAttemptLimit  = 5
	passwordChangeAttemptWindow = 15 * time.Minute
	lastSeenInterval            = 5 * time.Minute
)

var ErrInvalidCredentials = errors.New("invalid credentials")

type AuthUserRecord struct {
	ID           string
	Name         string
	Email        string
	PasswordHash string
	Role         string
	IsActive     bool
	CreatedAt    time.Time
	UpdatedAt    time.Time
	LastLoginAt  sql.NullTime
}

type SessionRecord struct {
	TokenHash  string
	UserID     string
	CreatedAt  time.Time
	ExpiresAt  time.Time
	LastSeenAt time.Time
	RevokedAt  sql.NullTime
}

type CookieConfig struct {
	Name     string
	Secure   bool
	Lifetime time.Duration
}

type PasswordParams struct {
	Memory      uint32
	Iterations  uint32
	Parallelism uint8
	SaltLength  uint32
	KeyLength   uint32
}

var defaultPasswordParams = PasswordParams{Memory: 64 * 1024, Iterations: 3, Parallelism: 2, SaltLength: 16, KeyLength: 32}

func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func ValidatePasswordStrength(password string) error {
	if len([]rune(password)) < MinPasswordLength {
		return fmt.Errorf("password must be at least %d characters", MinPasswordLength)
	}
	return nil
}

func HashPassword(password string) (string, error) {
	if err := ValidatePasswordStrength(password); err != nil {
		return "", err
	}
	salt := make([]byte, defaultPasswordParams.SaltLength)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	hash := argon2.IDKey([]byte(password), salt, defaultPasswordParams.Iterations, defaultPasswordParams.Memory, defaultPasswordParams.Parallelism, defaultPasswordParams.KeyLength)
	return fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s", defaultPasswordParams.Memory, defaultPasswordParams.Iterations, defaultPasswordParams.Parallelism, base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(hash)), nil
}

func VerifyPassword(password, encodedHash string) bool {
	params, salt, expected, err := decodeArgon2idHash(encodedHash)
	if err != nil {
		return false
	}
	actual := argon2.IDKey([]byte(password), salt, params.Iterations, params.Memory, params.Parallelism, params.KeyLength)
	return subtleCompare(actual, expected)
}

func decodeArgon2idHash(encoded string) (PasswordParams, []byte, []byte, error) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[1] != "argon2id" || parts[2] != "v=19" {
		return PasswordParams{}, nil, nil, fmt.Errorf("invalid password hash")
	}
	var params PasswordParams
	for _, item := range strings.Split(parts[3], ",") {
		kv := strings.SplitN(item, "=", 2)
		if len(kv) != 2 {
			return PasswordParams{}, nil, nil, fmt.Errorf("invalid password params")
		}
		value, err := strconv.Atoi(kv[1])
		if err != nil || value <= 0 {
			return PasswordParams{}, nil, nil, fmt.Errorf("invalid password params")
		}
		switch kv[0] {
		case "m":
			params.Memory = uint32(value)
		case "t":
			params.Iterations = uint32(value)
		case "p":
			params.Parallelism = uint8(value)
		}
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return PasswordParams{}, nil, nil, err
	}
	hash, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return PasswordParams{}, nil, nil, err
	}
	params.SaltLength = uint32(len(salt))
	params.KeyLength = uint32(len(hash))
	return params, salt, hash, nil
}

func subtleCompare(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	var v byte
	for i := range a {
		v |= a[i] ^ b[i]
	}
	return v == 0
}

func SafeUserDTO(user AuthUserRecord) dtos.AuthUser {
	return dtos.AuthUser{ID: user.ID, Name: user.Name, Email: user.Email, Role: user.Role}
}

func CreateSession(ctx context.Context, userID string) (string, SessionRecord, error) {
	token, tokenHash, err := newSessionToken()
	if err != nil {
		return "", SessionRecord{}, err
	}
	now := time.Now().UTC()
	session := SessionRecord{TokenHash: tokenHash, UserID: userID, CreatedAt: now, ExpiresAt: now.Add(SessionLifetime()), LastSeenAt: now}
	_, err = Database.ExecContext(ctx, `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at) VALUES ($1, $2, $3, $4, $5)`, session.TokenHash, session.UserID, session.CreatedAt, session.ExpiresAt, session.LastSeenAt)
	if err != nil {
		return "", SessionRecord{}, err
	}
	return token, session, nil
}

func newSessionToken() (string, string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", "", err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	return token, HashSessionToken(token), nil
}

func HashSessionToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func AuthenticateSession(ctx context.Context, rawToken string) (dtos.AuthUser, error) {
	if strings.TrimSpace(rawToken) == "" {
		return dtos.AuthUser{}, newServiceError(ErrCodeUnauthenticated, errors.New("missing session"))
	}
	row := Database.QueryRowContext(ctx, `
		SELECT u.id, u.name, u.email, u.role, u.is_active, s.last_seen_at
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()
	`, HashSessionToken(rawToken))
	var user dtos.AuthUser
	var isActive bool
	var lastSeenAt time.Time
	if err := row.Scan(&user.ID, &user.Name, &user.Email, &user.Role, &isActive, &lastSeenAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return dtos.AuthUser{}, newServiceError(ErrCodeUnauthenticated, errors.New("invalid session"))
		}
		return dtos.AuthUser{}, err
	}
	if !isActive {
		return dtos.AuthUser{}, newServiceError(ErrCodeUnauthenticated, errors.New("inactive user"))
	}
	if time.Since(lastSeenAt) >= lastSeenInterval {
		_, _ = Database.ExecContext(ctx, `UPDATE sessions SET last_seen_at = NOW() WHERE token_hash = $1`, HashSessionToken(rawToken))
	}
	return user, nil
}

func Login(ctx context.Context, email, password, remoteAddr string) (dtos.AuthUser, string, error) {
	normalized := NormalizeEmail(email)
	if normalized == "" || password == "" {
		return dtos.AuthUser{}, "", newServiceError(ErrCodeInvalidCredentials, ErrInvalidCredentials)
	}
	if isLoginRateLimited(ctx, remoteAddr, normalized) {
		return dtos.AuthUser{}, "", newServiceError(ErrCodeRateLimited, errors.New("too many login attempts"))
	}

	user, err := GetUserByEmail(ctx, normalized)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			recordFailedLoginAttempt(ctx, remoteAddr, normalized)
			return dtos.AuthUser{}, "", newServiceError(ErrCodeInvalidCredentials, ErrInvalidCredentials)
		}
		return dtos.AuthUser{}, "", err
	}
	if !user.IsActive || !VerifyPassword(password, user.PasswordHash) {
		recordFailedLoginAttempt(ctx, remoteAddr, normalized)
		return dtos.AuthUser{}, "", newServiceError(ErrCodeInvalidCredentials, ErrInvalidCredentials)
	}
	token, _, err := CreateSession(ctx, user.ID)
	if err != nil {
		return dtos.AuthUser{}, "", err
	}
	clearLoginAttempts(ctx, remoteAddr, normalized)
	_, _ = Database.ExecContext(ctx, `UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`, user.ID)
	return SafeUserDTO(user), token, nil
}

func ChangeOwnPassword(ctx context.Context, userID, currentPassword, newPassword, currentSessionToken string) error {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return newServiceError(ErrCodeUnauthenticated, errors.New("missing user"))
	}
	if isPasswordChangeRateLimited(ctx, userID) {
		return newServiceError(ErrCodeRateLimited, errors.New("too many password change attempts"))
	}
	if err := ValidatePasswordStrength(newPassword); err != nil {
		return newServiceError(ErrCodePasswordPolicyFailed, err)
	}

	tx, err := Database.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return err
	}
	defer tx.Rollback()

	user, err := getAuthUserForUpdate(ctx, tx, userID)
	if err != nil {
		return err
	}
	if !user.IsActive {
		return newServiceError(ErrCodeInactiveUser, errors.New("inactive user"))
	}
	if !VerifyPassword(currentPassword, user.PasswordHash) {
		recordFailedPasswordChangeAttempt(ctx, userID)
		return newServiceError(ErrCodeInvalidCurrentPassword, errors.New("invalid current password"))
	}
	if VerifyPassword(newPassword, user.PasswordHash) {
		recordFailedPasswordChangeAttempt(ctx, userID)
		return newServiceError(ErrCodePasswordUnchanged, errors.New("new password must be different"))
	}
	passwordHash, err := HashPassword(newPassword)
	if err != nil {
		return newServiceError(ErrCodePasswordPolicyFailed, err)
	}
	if _, err := tx.ExecContext(ctx, `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, passwordHash, userID); err != nil {
		return err
	}
	if err := revokeOtherSessionsForUser(ctx, tx, userID, HashSessionToken(currentSessionToken)); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	clearPasswordChangeAttempts(ctx, userID)
	return nil
}

func GetUserByEmail(ctx context.Context, email string) (AuthUserRecord, error) {
	row := Database.QueryRowContext(ctx, `SELECT id, name, email, password_hash, role, is_active, created_at, updated_at, last_login_at FROM users WHERE email = $1`, NormalizeEmail(email))
	var user AuthUserRecord
	err := row.Scan(&user.ID, &user.Name, &user.Email, &user.PasswordHash, &user.Role, &user.IsActive, &user.CreatedAt, &user.UpdatedAt, &user.LastLoginAt)
	return user, err
}

func getAuthUserForUpdate(ctx context.Context, tx *sql.Tx, userID string) (AuthUserRecord, error) {
	row := tx.QueryRowContext(ctx, `SELECT id, name, email, password_hash, role, is_active, created_at, updated_at, last_login_at FROM users WHERE id = $1 FOR UPDATE`, userID)
	var user AuthUserRecord
	err := row.Scan(&user.ID, &user.Name, &user.Email, &user.PasswordHash, &user.Role, &user.IsActive, &user.CreatedAt, &user.UpdatedAt, &user.LastLoginAt)
	if errors.Is(err, sql.ErrNoRows) {
		return AuthUserRecord{}, newServiceError(ErrCodeUserNotFound, errors.New("user not found"))
	}
	return user, err
}

func RevokeSession(ctx context.Context, rawToken string) error {
	if strings.TrimSpace(rawToken) == "" {
		return nil
	}
	_, err := Database.ExecContext(ctx, `UPDATE sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`, HashSessionToken(rawToken))
	return err
}

func BootstrapInitialAdmin(ctx context.Context) error {
	name := strings.TrimSpace(os.Getenv("INITIAL_ADMIN_NAME"))
	email := NormalizeEmail(os.Getenv("INITIAL_ADMIN_EMAIL"))
	password := os.Getenv("INITIAL_ADMIN_PASSWORD")
	if name == "" && email == "" && password == "" {
		return nil
	}
	if name == "" || email == "" || password == "" {
		return fmt.Errorf("INITIAL_ADMIN_NAME, INITIAL_ADMIN_EMAIL, and INITIAL_ADMIN_PASSWORD must all be set")
	}
	if err := ValidatePasswordStrength(password); err != nil {
		return fmt.Errorf("initial admin password is invalid: %w", err)
	}
	var exists bool
	if err := Database.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM users WHERE email = $1)`, email).Scan(&exists); err != nil {
		return err
	}
	if exists {
		fmt.Printf("✅ Initial administrator already exists: %s\n", email)
		return nil
	}
	passwordHash, err := HashPassword(password)
	if err != nil {
		return err
	}
	_, err = Database.ExecContext(ctx, `INSERT INTO users (id, name, email, password_hash, role, is_active) VALUES ($1, $2, $3, $4, 'admin', TRUE)`, uuid.NewString(), name, email, passwordHash)
	if err == nil {
		fmt.Printf("✅ Initial administrator created: %s\n", email)
	}
	return err
}

func SessionCookieConfig() CookieConfig {
	name := strings.TrimSpace(os.Getenv("SESSION_COOKIE_NAME"))
	if name == "" {
		name = defaultCookieName
	}
	return CookieConfig{Name: name, Secure: envBool("SESSION_SECURE", false), Lifetime: SessionLifetime()}
}

func SessionLifetime() time.Duration {
	value := strings.TrimSpace(os.Getenv("SESSION_LIFETIME"))
	if value == "" {
		return defaultSessionLife
	}
	duration, err := time.ParseDuration(value)
	if err != nil || duration <= 0 {
		return defaultSessionLife
	}
	return duration
}

func envBool(key string, fallback bool) bool {
	value := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	if value == "" {
		return fallback
	}
	return value == "1" || value == "true" || value == "yes"
}

type loginBucket struct {
	Count     int
	ExpiresAt time.Time
}

var loginLimiter = struct {
	sync.Mutex
	Buckets map[string]loginBucket
}{Buckets: map[string]loginBucket{}}

var passwordChangeLimiter = struct {
	sync.Mutex
	Buckets map[string]loginBucket
}{Buckets: map[string]loginBucket{}}

func loginAttemptKey(remoteAddr, email string) string {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil || host == "" {
		host = remoteAddr
	}
	return "login_attempt:" + host + ":" + HashAuditIdentifier(email)
}

func isLoginRateLimited(ctx context.Context, remoteAddr, email string) bool {
	key := loginAttemptKey(remoteAddr, email)
	if RedisClient != nil {
		count, err := RedisClient.Get(ctx, key).Int()
		if err == nil {
			return count >= loginAttemptLimit
		}
		if err != redis.Nil {
			return isLocalLoginRateLimited(key)
		}
		return false
	}
	return isLocalLoginRateLimited(key)
}

func recordFailedLoginAttempt(ctx context.Context, remoteAddr, email string) {
	key := loginAttemptKey(remoteAddr, email)
	if RedisClient != nil {
		count, err := RedisClient.Incr(ctx, key).Result()
		if err == nil {
			if count == 1 {
				_ = RedisClient.Expire(ctx, key, loginAttemptWindow).Err()
			}
			return
		}
	}
	recordLocalFailedLoginAttempt(key)
}

func clearLoginAttempts(ctx context.Context, remoteAddr, email string) {
	key := loginAttemptKey(remoteAddr, email)
	if RedisClient != nil {
		_ = RedisClient.Del(ctx, key).Err()
	}
	loginLimiter.Lock()
	delete(loginLimiter.Buckets, key)
	loginLimiter.Unlock()
}

func passwordChangeAttemptKey(userID string) string {
	return "password_change_attempt:" + HashAuditIdentifier(userID)
}

func isPasswordChangeRateLimited(ctx context.Context, userID string) bool {
	key := passwordChangeAttemptKey(userID)
	if RedisClient != nil {
		count, err := RedisClient.Get(ctx, key).Int()
		if err == nil {
			return count >= passwordChangeAttemptLimit
		}
		if err != redis.Nil {
			return isLocalPasswordChangeRateLimited(key)
		}
		return false
	}
	return isLocalPasswordChangeRateLimited(key)
}

func recordFailedPasswordChangeAttempt(ctx context.Context, userID string) {
	key := passwordChangeAttemptKey(userID)
	if RedisClient != nil {
		count, err := RedisClient.Incr(ctx, key).Result()
		if err == nil {
			if count == 1 {
				_ = RedisClient.Expire(ctx, key, passwordChangeAttemptWindow).Err()
			}
			return
		}
	}
	recordLocalFailedPasswordChangeAttempt(key)
}

func clearPasswordChangeAttempts(ctx context.Context, userID string) {
	key := passwordChangeAttemptKey(userID)
	if RedisClient != nil {
		_ = RedisClient.Del(ctx, key).Err()
	}
	passwordChangeLimiter.Lock()
	delete(passwordChangeLimiter.Buckets, key)
	passwordChangeLimiter.Unlock()
}

func isLocalPasswordChangeRateLimited(key string) bool {
	now := time.Now().UTC()
	passwordChangeLimiter.Lock()
	defer passwordChangeLimiter.Unlock()
	bucket := passwordChangeLimiter.Buckets[key]
	if now.After(bucket.ExpiresAt) {
		delete(passwordChangeLimiter.Buckets, key)
		return false
	}
	return bucket.Count >= passwordChangeAttemptLimit
}

func recordLocalFailedPasswordChangeAttempt(key string) {
	now := time.Now().UTC()
	passwordChangeLimiter.Lock()
	defer passwordChangeLimiter.Unlock()
	bucket := passwordChangeLimiter.Buckets[key]
	if now.After(bucket.ExpiresAt) {
		passwordChangeLimiter.Buckets[key] = loginBucket{Count: 1, ExpiresAt: now.Add(passwordChangeAttemptWindow)}
		return
	}
	bucket.Count++
	passwordChangeLimiter.Buckets[key] = bucket
}

func isLocalLoginRateLimited(key string) bool {
	now := time.Now().UTC()
	loginLimiter.Lock()
	defer loginLimiter.Unlock()
	bucket := loginLimiter.Buckets[key]
	if now.After(bucket.ExpiresAt) {
		delete(loginLimiter.Buckets, key)
		return false
	}
	return bucket.Count >= loginAttemptLimit
}

func recordLocalFailedLoginAttempt(key string) {
	now := time.Now().UTC()
	loginLimiter.Lock()
	defer loginLimiter.Unlock()
	bucket := loginLimiter.Buckets[key]
	if now.After(bucket.ExpiresAt) {
		loginLimiter.Buckets[key] = loginBucket{Count: 1, ExpiresAt: now.Add(loginAttemptWindow)}
		return
	}
	bucket.Count++
	loginLimiter.Buckets[key] = bucket
}
