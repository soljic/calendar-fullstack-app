# Database Schema Documentation

This document describes the PostgreSQL database schema for the Calendar Application with Google Calendar integration.

## Overview

The database consists of three main tables:
- `users`: User accounts with Google OAuth integration
- `calendar_events`: Calendar events with Google Calendar sync support
- `sync_state`: Google Calendar synchronization state tracking

## Tables

### 1. Users Table

Stores user account information with Google OAuth integration.

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    google_id VARCHAR(255) UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    picture_url TEXT,
    access_token TEXT,           -- Encrypted Google access token
    refresh_token TEXT,          -- Encrypted Google refresh token
    token_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Key Features:**
- UUID primary key for security
- Unique constraints on email and google_id
- Automatic timestamp management with triggers
- Encrypted token storage (implement encryption in application layer)

### 2. Calendar Events Table

Stores calendar events with support for Google Calendar synchronization.

```sql
CREATE TABLE calendar_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    google_event_id VARCHAR(255),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    location TEXT,
    attendees JSONB DEFAULT '[]'::jsonb,
    status event_status DEFAULT 'confirmed',     -- confirmed, tentative, cancelled
    source event_source DEFAULT 'manual',       -- google, manual, imported
    is_all_day BOOLEAN DEFAULT FALSE,
    timezone VARCHAR(100) DEFAULT 'UTC',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_modified TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Key Features:**
- Foreign key to users table with CASCADE delete
- Unique constraint on (user_id, google_event_id) for sync integrity
- JSONB attendees field for flexible attendee data
- Enum types for status and source
- Timezone support for global usage
- Date range validation constraint

### 3. Sync State Table

Tracks Google Calendar synchronization state for each user.

```sql
CREATE TABLE sync_state (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    next_sync_token VARCHAR(500),
    last_sync_time TIMESTAMP WITH TIME ZONE,
    full_sync_completed BOOLEAN DEFAULT FALSE,
    sync_in_progress BOOLEAN DEFAULT FALSE,
    sync_error TEXT,
    sync_error_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Key Features:**
- One-to-one relationship with users
- Tracks incremental sync tokens from Google Calendar API
- Error handling and retry logic support
- Prevents concurrent sync operations

## Indexes

### Performance Indexes

```sql
-- Users table
CREATE INDEX idx_users_google_id ON users(google_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_valid_tokens ON users(id, token_expires_at) 
    WHERE access_token IS NOT NULL AND token_expires_at > CURRENT_TIMESTAMP;

-- Calendar events table
CREATE INDEX idx_calendar_events_user_id ON calendar_events(user_id);
CREATE INDEX idx_calendar_events_date_range ON calendar_events(start_date, end_date);
CREATE INDEX idx_calendar_events_user_date_range ON calendar_events(user_id, start_date, end_date);
CREATE INDEX idx_calendar_events_google_source ON calendar_events(user_id, last_modified) 
    WHERE source = 'google';
CREATE INDEX idx_calendar_events_text_search ON calendar_events 
    USING GIN (to_tsvector('english', title || ' ' || COALESCE(description, '')));
CREATE INDEX idx_calendar_events_attendees ON calendar_events USING GIN (attendees);

-- Sync state table
CREATE INDEX idx_sync_state_last_sync_time ON sync_state(last_sync_time);
CREATE INDEX idx_sync_state_sync_in_progress ON sync_state(sync_in_progress);
```

## Functions

### Utility Functions

1. **get_events_in_range(user_id, start_date, end_date)**
   - Returns events within a date range for a user
   - Handles overlapping events correctly

2. **search_events(user_id, search_term, limit)**
   - Full-text search across event titles and descriptions
   - Returns ranked results

3. **get_users_needing_sync(sync_interval_minutes)**
   - Returns users that need Google Calendar sync
   - Considers token validity and error counts

4. **Sync Management Functions:**
   - `start_sync_for_user(user_id)` - Marks sync as in progress
   - `complete_sync_for_user(user_id, token, success, error)` - Updates sync state

5. **Maintenance Functions:**
   - `cleanup_old_cancelled_events(days_old)` - Removes old cancelled events
   - `cleanup_orphaned_sync_states()` - Removes orphaned sync states
   - `refresh_calendar_stats()` - Updates materialized view statistics

## Materialized Views

### user_calendar_stats

Provides aggregated statistics for each user:
- Total events count
- Events by status and source
- Date ranges
- Sync status

```sql
CREATE MATERIALIZED VIEW user_calendar_stats AS
SELECT 
    u.id as user_id,
    u.email,
    COUNT(e.id) as total_events,
    COUNT(CASE WHEN e.status = 'confirmed' THEN 1 END) as confirmed_events,
    COUNT(CASE WHEN e.source = 'google' THEN 1 END) as google_events,
    COUNT(CASE WHEN e.source = 'manual' THEN 1 END) as manual_events,
    MIN(e.start_date) as first_event_date,
    MAX(e.start_date) as last_event_date,
    s.last_sync_time,
    s.sync_error_count
FROM users u
LEFT JOIN calendar_events e ON u.id = e.user_id
LEFT JOIN sync_state s ON u.id = s.user_id
GROUP BY u.id, u.email, s.last_sync_time, s.sync_error_count;
```

## Migration Management

### Running Migrations

```bash
# Run all pending migrations
npm run migrate

# Check migration status
npm run migrate:status

# Rollback last migration (manual process)
npm run migrate:rollback
```

### Migration Files

Migrations are located in `src/migrations/` and numbered sequentially:

1. `001_create_users_table.sql` - Users table and indexes
2. `002_create_calendar_events_table.sql` - Events table with functions
3. `003_create_sync_state_table.sql` - Sync state and management functions
4. `004_add_performance_indexes.sql` - Additional indexes and optimizations

### Database Scripts

```bash
# Seed database with sample data
npm run db:seed

# Run database maintenance
npm run db:maintenance full

# Analyze database performance
npm run db:analyze

# Check database health
npm run db:health

# Cleanup old data
npm run db:cleanup
```

## Data Types and Constraints

### Custom Types

```sql
CREATE TYPE event_status AS ENUM ('confirmed', 'tentative', 'cancelled');
CREATE TYPE event_source AS ENUM ('google', 'manual', 'imported');
```

### Key Constraints

1. **Date Validation**: `end_date >= start_date`
2. **Unique Google Events**: `(user_id, google_event_id)` must be unique
3. **Referential Integrity**: All foreign keys use CASCADE DELETE
4. **Token Validation**: Users with tokens must have valid expiration dates

## Security Considerations

1. **Token Encryption**: Access and refresh tokens should be encrypted at the application layer
2. **Row-Level Security**: Consider enabling RLS for multi-tenant scenarios
3. **Audit Logging**: All mutations are tracked with timestamps
4. **Data Retention**: Implement policies for old event cleanup

## Performance Optimization

1. **Partitioning**: Consider partitioning `calendar_events` by date for large datasets
2. **Connection Pooling**: Use connection pooling (implemented in application)
3. **Query Optimization**: Regular VACUUM and ANALYZE operations
4. **Index Monitoring**: Monitor index usage and remove unused indexes

## Backup and Recovery

1. **Regular Backups**: Implement automated daily backups
2. **Point-in-Time Recovery**: Enable WAL archiving for PITR
3. **Testing**: Regularly test backup restoration procedures
4. **Monitoring**: Set up alerts for backup failures

## Development Workflow

1. **Local Setup**: Use Docker for consistent local development
2. **Migrations**: Always use migration files for schema changes
3. **Testing**: Test migrations on staging before production
4. **Rollback Plan**: Maintain rollback scripts for each migration

## Monitoring and Maintenance

### Regular Maintenance Tasks

```bash
# Daily
npm run db:cleanup
npm run db:analyze

# Weekly
npm run db:maintenance full

# Monthly
npm run db:health
```

### Key Metrics to Monitor

- Connection pool utilization
- Query performance (slow query log)
- Index usage statistics
- Table bloat and dead tuples
- Sync error rates
- Token expiration rates

## Troubleshooting

### Common Issues

1. **Sync Stuck**: Reset stuck sync processes with maintenance script
2. **Token Expiration**: Monitor and refresh expired tokens
3. **Duplicate Events**: Check unique constraints on Google event IDs
4. **Performance**: Analyze slow queries and missing indexes

### Debug Queries

```sql
-- Check sync status
SELECT u.email, s.last_sync_time, s.sync_error_count, s.sync_in_progress
FROM users u 
LEFT JOIN sync_state s ON u.id = s.user_id;

-- Find events without Google IDs
SELECT COUNT(*) FROM calendar_events 
WHERE source = 'google' AND google_event_id IS NULL;

-- Check for stuck syncs
SELECT * FROM sync_state 
WHERE sync_in_progress = TRUE 
AND updated_at < CURRENT_TIMESTAMP - INTERVAL '1 hour';
```