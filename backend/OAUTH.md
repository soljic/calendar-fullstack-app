# Google OAuth 2.0 Authentication System

This document describes the complete Google OAuth 2.0 authentication system implemented with Passport.js for the Calendar Application.

## Overview

The authentication system provides:
- Complete OAuth 2.0 flow with Google Calendar API access
- JWT-based session management with HTTP-only cookies
- Automatic token refresh mechanism
- Secure token storage with AES-256 encryption
- CSRF protection with state parameters
- Comprehensive error handling
- Rate limiting for security

## Architecture

### Components

1. **TokenService** (`src/services/tokenService.ts`)
   - Token encryption/decryption
   - JWT generation and verification
   - Google token refresh
   - User management

2. **Passport Configuration** (`src/config/passport.ts`)
   - Google OAuth strategy setup
   - User serialization/deserialization

3. **Auth Controller** (`src/controllers/authController.ts`)
   - OAuth flow handlers
   - Token management endpoints
   - User information endpoints

4. **Auth Middleware** (`src/middleware/auth.ts`)
   - JWT authentication
   - Optional authentication
   - Calendar access validation

5. **Auth Routes** (`src/routes/auth.ts`)
   - Endpoint definitions
   - Rate limiting
   - Middleware integration

## OAuth Flow

### 1. Initiate Authentication
```
GET /api/v1/auth/google
```

**Process:**
1. Generate CSRF state token
2. Store state in database and session
3. Redirect to Google OAuth with scopes:
   - `profile`
   - `email` 
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/calendar.events`

### 2. Handle OAuth Callback
```
GET /api/v1/auth/google/callback
```

**Process:**
1. Validate CSRF state parameter
2. Exchange authorization code for tokens
3. Create or update user account
4. Generate JWT token
5. Set secure HTTP-only cookie
6. Redirect to frontend success page

### 3. Token Refresh
```
POST /api/v1/auth/refresh
```

**Process:**
1. Validate current JWT
2. Check Google token expiration
3. Refresh Google access token if needed
4. Generate new JWT
5. Update HTTP-only cookie

### 4. Logout
```
POST /api/v1/auth/logout
```

**Process:**
1. Revoke Google tokens
2. Clear HTTP-only cookie
3. Destroy session
4. Clean up database tokens

## Security Features

### CSRF Protection
- Random state tokens for OAuth flow
- State validation on callback
- Automatic cleanup of expired states

### Token Security
- AES-256 encryption for stored tokens
- HTTP-only cookies for JWT tokens
- Secure flag in production
- SameSite cookie protection

### Rate Limiting
- OAuth initiation: 3 requests per 5 minutes per IP
- Auth endpoints: 10 requests per 15 minutes per IP
- Protection against brute force attacks

### Token Management
- Automatic token refresh before expiration
- 5-minute buffer for token renewal
- Graceful handling of expired tokens
- Secure token revocation

## API Endpoints

### Public Endpoints

#### GET /api/v1/auth/google
Initiate Google OAuth flow
- **Rate Limited:** 3/5min per IP
- **Response:** Redirect to Google OAuth

#### GET /api/v1/auth/google/callback
Handle OAuth callback
- **Rate Limited:** 10/15min per IP  
- **Response:** Redirect to frontend

#### GET /api/v1/auth/status
Check authentication status
- **Auth:** Optional
- **Response:** Authentication status and user info

#### GET /api/v1/auth/error
Handle OAuth errors
- **Response:** Redirect to frontend with error

### Protected Endpoints

#### POST /api/v1/auth/refresh
Refresh access tokens
- **Auth:** Required (JWT)
- **Rate Limited:** 10/15min per IP
- **Response:** Success message with new expiration

#### POST /api/v1/auth/logout
Logout and revoke tokens
- **Auth:** Optional (handles invalid tokens)
- **Response:** Success message

#### GET /api/v1/auth/me
Get current user information
- **Auth:** Required (JWT)
- **Features:** Auto token refresh
- **Response:** User profile data

#### GET /api/v1/auth/validate-calendar
Validate Google Calendar access
- **Auth:** Required (JWT + Calendar access)
- **Response:** Calendar access status

## Token Service Methods

### Encryption
```typescript
TokenService.encrypt(text: string): string
TokenService.decrypt(encryptedText: string): string
```

### JWT Management
```typescript
TokenService.generateJWT(payload: JwtPayload): string
TokenService.verifyJWT(token: string): JwtPayload
```

### Google Token Management
```typescript
TokenService.refreshGoogleToken(userId: string): Promise<GoogleTokens>
TokenService.ensureValidToken(userId: string): Promise<string>
TokenService.revokeTokens(userId: string): Promise<void>
```

### User Management
```typescript
TokenService.createUserFromGoogleProfile(profile: any, tokens: GoogleTokens): Promise<User>
TokenService.updateUserFromGoogleProfile(user: User, profile: any, tokens: GoogleTokens): Promise<User>
```

## Middleware Usage

### authenticateToken
Require valid JWT authentication
```typescript
router.get('/protected', authenticateToken, handler);
```

### optionalAuth
Optional authentication (user may or may not be logged in)
```typescript
router.get('/public', optionalAuth, handler);
```

### requireCalendarAccess
Require valid Google Calendar tokens
```typescript
router.get('/calendar', authenticateToken, requireCalendarAccess, handler);
```

### autoRefreshTokens
Automatically refresh expiring tokens
```typescript
router.get('/api', authenticateToken, autoRefreshTokens, handler);
```

## Database Schema

### oauth_states Table
Stores CSRF state tokens for OAuth flow
```sql
CREATE TABLE oauth_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    state VARCHAR(64) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### users Table Updates
Enhanced with OAuth fields
```sql
ALTER TABLE users ADD COLUMN google_id VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN access_token TEXT;
ALTER TABLE users ADD COLUMN refresh_token TEXT;
ALTER TABLE users ADD COLUMN token_expires_at TIMESTAMP WITH TIME ZONE;
```

## Configuration

### Environment Variables
```bash
# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# JWT
JWT_SECRET=your_jwt_secret_32_chars_minimum
JWT_EXPIRES_IN=7d

# Session
SESSION_SECRET=your_session_secret

# Frontend
FRONTEND_URL=http://localhost:3000

# CORS
CORS_ORIGIN=http://localhost:3000,http://localhost:3001
```

### Google Cloud Console Setup

1. **Create OAuth 2.0 Credentials**
   - Go to Google Cloud Console
   - Enable Google Calendar API
   - Create OAuth 2.0 client ID
   - Set authorized redirect URIs:
     - `http://localhost:3000/api/v1/auth/google/callback` (development)
     - `https://yourdomain.com/api/v1/auth/google/callback` (production)

2. **Configure Scopes**
   - `profile` - Basic profile information
   - `email` - Email address
   - `https://www.googleapis.com/auth/calendar` - Calendar access
   - `https://www.googleapis.com/auth/calendar.events` - Event management

## Error Handling

### OAuth Errors
- `access_denied` - User denied permission
- `invalid_request` - Malformed request
- `server_error` - Google server error
- `temporarily_unavailable` - Service temporarily down

### Application Errors
- `UnauthorizedError` - Invalid or expired tokens
- `BadRequestError` - Invalid CSRF state
- `InternalServerError` - Server-side errors

### Error Responses
All errors follow RFC 7807 format:
```json
{
  "success": false,
  "error": {
    "type": "https://httpstatuses.com/401",
    "title": "Unauthorized",
    "status": 401,
    "detail": "Token has expired",
    "instance": "/api/v1/auth/me"
  }
}
```

## Frontend Integration

### Initiating Login
```javascript
// Redirect to OAuth flow
window.location.href = '/api/v1/auth/google';
```

### Checking Auth Status
```javascript
fetch('/api/v1/auth/status', {
  credentials: 'include'  // Important: Include cookies
})
.then(response => response.json())
.then(data => {
  if (data.success && data.data.authenticated) {
    console.log('User is logged in:', data.data.user);
  }
});
```

### Making Authenticated Requests
```javascript
// Cookies are automatically included with credentials: 'include'
fetch('/api/v1/users/profile', {
  credentials: 'include'
})
.then(response => response.json())
.then(data => console.log(data));
```

### Logout
```javascript
fetch('/api/v1/auth/logout', {
  method: 'POST',
  credentials: 'include'
})
.then(() => {
  window.location.href = '/login';
});
```

## Testing

### Unit Tests
Test token encryption/decryption:
```typescript
describe('TokenService', () => {
  it('should encrypt and decrypt tokens', () => {
    const original = 'test-token';
    const encrypted = TokenService.encrypt(original);
    const decrypted = TokenService.decrypt(encrypted);
    expect(decrypted).toBe(original);
  });
});
```

### Integration Tests  
Test OAuth flow:
```typescript
describe('OAuth Flow', () => {
  it('should handle complete OAuth flow', async () => {
    const initiateResponse = await request(app)
      .get('/api/v1/auth/google')
      .expect(302);
  });
});
```

## Production Considerations

### Security Checklist
- [ ] Use HTTPS in production
- [ ] Set secure cookie flags
- [ ] Configure proper CORS origins
- [ ] Set up rate limiting
- [ ] Monitor for suspicious activity
- [ ] Regularly rotate secrets
- [ ] Implement token blacklisting
- [ ] Set up proper logging

### Scaling Considerations
- [ ] Use Redis for session storage
- [ ] Implement distributed rate limiting
- [ ] Set up token cleanup jobs
- [ ] Monitor token usage patterns
- [ ] Consider token refresh strategies

### Monitoring
- Track authentication success/failure rates
- Monitor token refresh frequency
- Alert on unusual OAuth patterns
- Log security-related events
- Monitor API quota usage

## Troubleshooting

### Common Issues

1. **"Invalid redirect URI"**
   - Check Google Cloud Console configuration
   - Verify callback URL matches exactly

2. **"Token refresh failed"**
   - Check token expiration
   - Verify refresh token is present
   - Check Google API quotas

3. **"CSRF state mismatch"**
   - Check session configuration
   - Verify state parameter handling
   - Clear browser cookies

4. **"Calendar access denied"**
   - Check OAuth scopes
   - Verify user granted permissions
   - Check token validity

### Debug Endpoints
```bash
# Check auth status
curl -b cookies.txt http://localhost:3000/api/v1/auth/status

# Validate calendar access
curl -b cookies.txt http://localhost:3000/api/v1/auth/validate-calendar

# Check user info
curl -b cookies.txt http://localhost:3000/api/v1/auth/me
```