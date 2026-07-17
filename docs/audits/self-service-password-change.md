# Self-Service Password Change Audit

## Endpoint Contract

`POST /api/auth/change-password` requires an authenticated active session.

Request body:

```json
{
  "currentPassword": "existing password",
  "newPassword": "new password",
  "confirmPassword": "new password"
}
```

Success response:

```json
{
  "message": "Password changed successfully",
  "reauthenticationRequired": false
}
```

## Validation

- Requires `Content-Type: application/json`.
- Request body is limited by the existing auth JSON limit of 32 KiB.
- Unknown JSON fields are rejected.
- All three fields are required.
- `confirmPassword` must match `newPassword`.
- `currentPassword` must verify against the current user's stored Argon2id hash.
- `newPassword` must satisfy the existing password policy.
- `newPassword` must differ from the current password.

Safe error codes include `INVALID_CURRENT_PASSWORD`, `PASSWORD_CONFIRMATION_MISMATCH`, `PASSWORD_POLICY_FAILED`, `PASSWORD_UNCHANGED`, `TOO_MANY_LOGIN_ATTEMPTS`, `BAD_REQUEST`, and `UNAUTHENTICATED`.

## Session Behavior

The implementation preserves the current session safely. The service receives the current raw session token from the authenticated request, hashes it with the existing session-token hash function, updates the password in a serializable database transaction, and revokes all sessions for the user except that current token hash.

`reauthenticationRequired` is therefore `false` on success. If this strategy changes later, the frontend already handles `reauthenticationRequired: true` by redirecting to `/Login?reason=password-changed`.

## Rate Limiting

Failed current-password checks are limited to 5 attempts per user within 15 minutes. The limiter uses Redis when available and falls back to the local in-process limiter used by auth tests/dev paths. Successful password change clears the user's password-change limiter bucket.

## Audit Behavior

Audit events added:

- `password_change_succeeded`
- `password_change_failed`

Success metadata is limited to session behavior flags. Failure metadata is limited to an allowlisted `reasonCode`. Password values, confirmation values, hashes, and session tokens are not stored in audit metadata.

## Frontend Flow

Added `/Account/Security` with fields for current password, new password, and confirmation. The account menu links to Security. The form uses `current-password` and `new-password` autocomplete values, disables submission while processing, prevents duplicate submit, shows field-level validation, and clears password fields after success.

## Test Results

Implemented tests covering unauthenticated access, malformed/oversized bodies, confirmation mismatch, incorrect current password, weak new password, unchanged password, password hash replacement, old-password rejection through hash verification, new-password verification, other-session revocation while preserving the current session, audit metadata safety, and rate limiting.

Validation was run as part of the implementation and results are reported in the final task summary.
