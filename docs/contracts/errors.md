# Error Contract

All API errors return a DTO. Services must not expose framework exceptions, persistence entities, stack traces, SQL details, or provider raw responses.

## Shape

```json
{
  "error": {
    "code": "BOOKMARK_NOT_FOUND",
    "message": "Bookmark not found",
    "requestId": "req_01J...",
    "details": {
      "field": "url"
    }
  }
}
```

## Fields

- `error.code`: stable machine-readable string.
- `error.message`: visible-safe message. It may match v1 copy where the UI depends on that behavior.
- `error.requestId`: request correlation id.
- `error.details`: optional object for field-level errors or retry metadata.

## Status Mapping

| HTTP | Use |
| --- | --- |
| `400` | Invalid input or unsupported request shape. |
| `401` | Missing, expired, or invalid authentication. |
| `403` | Authenticated user lacks access. |
| `404` | Resource is missing or intentionally hidden. |
| `409` | Unique constraint, idempotency conflict, or state conflict. |
| `422` | Valid JSON but semantically invalid command. |
| `429` | Rate limit exceeded. |
| `500` | Unexpected server fault. |
| `503` | Dependency unavailable with controlled fallback not possible. |

## Initial Codes

| Code | Status | Notes |
| --- | ---: | --- |
| `VALIDATION_FAILED` | 400 | Field validation failed. |
| `AUTH_REQUIRED` | 401 | No usable session, refresh token, or API token. |
| `AUTH_INVALID` | 401 | Token or OAuth proof is invalid. |
| `TOKEN_EXPIRED` | 401 | Access token expired and refresh is unavailable. |
| `FORBIDDEN` | 403 | User is authenticated but not allowed. |
| `USER_NOT_FOUND` | 404 | User id or public username is missing. |
| `PUBLIC_PROFILE_PRIVATE` | 403 | Public profile exists but is private. |
| `USERNAME_TAKEN` | 409 | Profile slug/subdomain conflict. |
| `USERNAME_NOT_ALLOWED` | 403 | Reserved profile slug/subdomain. |
| `SIGNUP_SLOTS_FULL` | 403 | V1 slot limit reached. |
| `BOOKMARK_NOT_FOUND` | 404 | Bookmark does not exist for the current owner. |
| `CATEGORY_NOT_FOUND` | 404 | Category does not exist for the current owner. |
| `CATEGORY_NAME_CONFLICT` | 409 | Duplicate category name for a user. |
| `IDEMPOTENCY_CONFLICT` | 409 | Idempotency key reused with a different command. |
| `RATE_LIMITED` | 429 | Redis-backed rate limit exceeded; `details.retryAfterSeconds` may be returned. |
| `METADATA_FETCH_BLOCKED` | 422 | URL is unsupported or fails SSRF checks. |
| `DEPENDENCY_UNAVAILABLE` | 503 | Kafka, Postgres, Redis, or Elasticsearch unavailable. |

## V1 Copy Compatibility

The frontend may map these codes to v1-visible copy. For example:

- Login failures should still show `Invalid email or password. Please try again.`
- Duplicate signup should still show `An account with this email already exists. Please try logging in instead.`
- Signup slot exhaustion should still show `Sign up is currently unavailable. All slots are taken.`
