# API Endpoints Fix

## Issue Fixed
The frontend was calling API endpoints without the `/api/v1/` prefix, causing 404 errors.

**Error Example:**
```
{"success":false,"error":{"type":"https://httpstatuses.com/404","title":"Not Found","status":404,"detail":"Route GET /auth/google not found","instance":"/auth/google"}}
```

## Corrected Endpoints

### Authentication Endpoints
| Endpoint | Before | After |
|----------|--------|-------|
| Google Login | `/auth/google` | `/api/v1/auth/google` |
| OAuth Callback | `/auth/callback` | `/api/v1/auth/callback` |
| Get User | `/auth/user` | `/api/v1/auth/user` |
| Logout | `/auth/logout` | `/api/v1/auth/logout` |
| Refresh Token | `/auth/refresh` | `/api/v1/auth/refresh` |

### Calendar Endpoints
| Endpoint | Before | After |
|----------|--------|-------|
| Get Events | `/calendar/events` | `/api/v1/calendar/events` |
| Create Event | `/calendar/events` | `/api/v1/calendar/events` |
| Update Event | `/calendar/events/{id}` | `/api/v1/calendar/events/{id}` |
| Delete Event | `/calendar/events/{id}` | `/api/v1/calendar/events/{id}` |
| Sync Events | `/calendar/sync` | `/api/v1/calendar/sync` |

## Files Updated

### 1. Constants File
**File:** `src/utils/constants.ts`
- Updated `API_ENDPOINTS` object with correct paths
- All endpoints now include `/api/v1/` prefix

### 2. Authentication Service
**File:** `src/services/authService.ts`
- Updated `getLoginUrl()` method
- Updated `handleCallback()` endpoint
- Updated `getUser()` endpoint
- Updated `logout()` endpoint
- Updated `refreshToken()` endpoint

### 3. Event Service
**File:** `src/services/eventService.ts`
- Updated `getEvents()` endpoint
- Updated `createEvent()` endpoint
- Updated `syncEvents()` endpoint
- Updated `deleteEvent()` endpoint
- Updated `updateEvent()` endpoint

### 4. API Client
**File:** `src/services/api.ts`
- Updated private `refreshToken()` method endpoint

## Base URL Configuration

The base URL remains configurable via environment variable:
```
REACT_APP_API_URL=http://localhost:5001
```

Full URLs are constructed as:
```
${REACT_APP_API_URL}/api/v1/auth/google
${REACT_APP_API_URL}/api/v1/calendar/events
```

## Verification

✅ **Build Test**: `npm run build` - Compiled successfully  
✅ **Endpoint Test**: `curl http://localhost:5001/api/v1/auth/google` - Returns 302 (expected OAuth redirect)  
✅ **All Services**: Updated to use correct API paths  

## Backend Integration

Now the frontend correctly calls:
- **Authentication**: `http://localhost:5001/api/v1/auth/*`
- **Calendar**: `http://localhost:5001/api/v1/calendar/*`

This matches the backend Express.js route structure with the `/api/v1/` prefix.