-- Migration: 004_add_performance_indexes
-- Created: 2025-07-25
-- Description: Add additional indexes and optimizations for performance

-- Additional composite indexes for complex queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calendar_events_user_google_id 
    ON calendar_events(user_id, google_event_id) 
    WHERE google_event_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calendar_events_upcoming 
    ON calendar_events(user_id, start_date) 
    WHERE status = 'confirmed' AND start_date > CURRENT_TIMESTAMP;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calendar_events_recent_modified 
    ON calendar_events(user_id, last_modified DESC) 
    WHERE last_modified > CURRENT_TIMESTAMP - INTERVAL '7 days';

-- Partial indexes for better performance on filtered queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calendar_events_google_source 
    ON calendar_events(user_id, last_modified) 
    WHERE source = 'google';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_valid_tokens 
    ON users(id, token_expires_at) 
    WHERE access_token IS NOT NULL AND token_expires_at > CURRENT_TIMESTAMP;

-- Text search index for event titles and descriptions
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calendar_events_text_search 
    ON calendar_events USING GIN (to_tsvector('english', title || ' ' || COALESCE(description, '')));

-- Add function for full-text search
CREATE OR REPLACE FUNCTION search_events(
    p_user_id UUID,
    p_search_term TEXT,
    p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    title VARCHAR(500),
    description TEXT,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    location TEXT,
    rank REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        e.title,
        e.description,
        e.start_date,
        e.end_date,
        e.location,
        ts_rank(to_tsvector('english', e.title || ' ' || COALESCE(e.description, '')), 
                plainto_tsquery('english', p_search_term)) as rank
    FROM calendar_events e
    WHERE e.user_id = p_user_id
      AND e.status != 'cancelled'
      AND to_tsvector('english', e.title || ' ' || COALESCE(e.description, '')) 
          @@ plainto_tsquery('english', p_search_term)
    ORDER BY rank DESC, e.start_date ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Create materialized view for calendar statistics (optional, for analytics)
CREATE MATERIALIZED VIEW IF NOT EXISTS user_calendar_stats AS
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

-- Create unique index on the materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_calendar_stats_user_id 
    ON user_calendar_stats(user_id);

-- Create function to refresh stats
CREATE OR REPLACE FUNCTION refresh_calendar_stats()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY user_calendar_stats;
END;
$$ LANGUAGE plpgsql;

-- Add database maintenance functions
CREATE OR REPLACE FUNCTION cleanup_old_cancelled_events(
    p_days_old INTEGER DEFAULT 90
)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM calendar_events 
    WHERE status = 'cancelled' 
      AND updated_at < CURRENT_TIMESTAMP - INTERVAL '1 day' * p_days_old;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_orphaned_sync_states()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM sync_state 
    WHERE user_id NOT IN (SELECT id FROM users);
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Add database statistics function
CREATE OR REPLACE FUNCTION get_database_stats()
RETURNS TABLE (
    table_name TEXT,
    row_count BIGINT,
    table_size TEXT,
    index_size TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        schemaname||'.'||tablename as table_name,
        n_tup_ins - n_tup_del as row_count,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as table_size,
        pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) as index_size
    FROM pg_stat_user_tables 
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
END;
$$ LANGUAGE plpgsql;

-- Comments
COMMENT ON FUNCTION search_events(UUID, TEXT, INTEGER) IS 'Full-text search for calendar events';
COMMENT ON FUNCTION refresh_calendar_stats() IS 'Refresh the user calendar statistics materialized view';
COMMENT ON FUNCTION cleanup_old_cancelled_events(INTEGER) IS 'Clean up old cancelled events';
COMMENT ON FUNCTION cleanup_orphaned_sync_states() IS 'Clean up sync states for deleted users';
COMMENT ON FUNCTION get_database_stats() IS 'Get database table and index statistics';

-- Rollback script (for reference)
-- DROP INDEX CONCURRENTLY IF EXISTS idx_calendar_events_user_google_id;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_calendar_events_upcoming;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_calendar_events_recent_modified;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_calendar_events_google_source;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_users_valid_tokens;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_calendar_events_text_search;
-- DROP MATERIALIZED VIEW IF EXISTS user_calendar_stats CASCADE;
-- DROP FUNCTION IF EXISTS search_events(UUID, TEXT, INTEGER) CASCADE;
-- DROP FUNCTION IF EXISTS refresh_calendar_stats() CASCADE;
-- DROP FUNCTION IF EXISTS cleanup_old_cancelled_events(INTEGER) CASCADE;
-- DROP FUNCTION IF EXISTS cleanup_orphaned_sync_states() CASCADE;
-- DROP FUNCTION IF EXISTS get_database_stats() CASCADE;