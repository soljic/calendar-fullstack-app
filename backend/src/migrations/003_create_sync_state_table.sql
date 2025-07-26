-- Migration: 003_create_sync_state_table
-- Created: 2025-07-25
-- Description: Create sync_state table for tracking Google Calendar synchronization

-- Create sync_state table
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

-- Create indexes for performance
CREATE INDEX idx_sync_state_last_sync_time ON sync_state(last_sync_time);
CREATE INDEX idx_sync_state_sync_in_progress ON sync_state(sync_in_progress);
CREATE INDEX idx_sync_state_full_sync_completed ON sync_state(full_sync_completed);
CREATE INDEX idx_sync_state_sync_error_count ON sync_state(sync_error_count);

-- Create trigger for updated_at
CREATE TRIGGER update_sync_state_updated_at
    BEFORE UPDATE ON sync_state
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE sync_state IS 'Google Calendar synchronization state for each user';
COMMENT ON COLUMN sync_state.user_id IS 'Foreign key to users table (primary key)';
COMMENT ON COLUMN sync_state.next_sync_token IS 'Google Calendar API sync token for incremental sync';
COMMENT ON COLUMN sync_state.last_sync_time IS 'When the last successful sync occurred';
COMMENT ON COLUMN sync_state.full_sync_completed IS 'Whether initial full sync has been completed';
COMMENT ON COLUMN sync_state.sync_in_progress IS 'Whether a sync is currently in progress';
COMMENT ON COLUMN sync_state.sync_error IS 'Last sync error message if any';
COMMENT ON COLUMN sync_state.sync_error_count IS 'Number of consecutive sync errors';
COMMENT ON COLUMN sync_state.created_at IS 'When the sync state was created';
COMMENT ON COLUMN sync_state.updated_at IS 'When the sync state was last updated';

-- Create function to get users needing sync
CREATE OR REPLACE FUNCTION get_users_needing_sync(
    p_sync_interval_minutes INTEGER DEFAULT 15
)
RETURNS TABLE (
    user_id UUID,
    email VARCHAR(255),
    last_sync_time TIMESTAMP WITH TIME ZONE,
    sync_error_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id,
        u.email,
        s.last_sync_time,
        COALESCE(s.sync_error_count, 0)
    FROM users u
    LEFT JOIN sync_state s ON u.id = s.user_id
    WHERE u.access_token IS NOT NULL
      AND u.token_expires_at > CURRENT_TIMESTAMP
      AND (s.sync_in_progress IS NULL OR s.sync_in_progress = FALSE)
      AND (
          s.last_sync_time IS NULL OR 
          s.last_sync_time < CURRENT_TIMESTAMP - INTERVAL '1 minute' * p_sync_interval_minutes
      )
      AND (s.sync_error_count IS NULL OR s.sync_error_count < 5)
    ORDER BY s.last_sync_time ASC NULLS FIRST;
END;
$$ LANGUAGE plpgsql;

-- Create function to start sync for a user
CREATE OR REPLACE FUNCTION start_sync_for_user(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    INSERT INTO sync_state (user_id, sync_in_progress, updated_at)
    VALUES (p_user_id, TRUE, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id) 
    DO UPDATE SET 
        sync_in_progress = TRUE,
        updated_at = CURRENT_TIMESTAMP
    WHERE sync_state.sync_in_progress = FALSE;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Create function to complete sync for a user
CREATE OR REPLACE FUNCTION complete_sync_for_user(
    p_user_id UUID,
    p_next_sync_token VARCHAR(500) DEFAULT NULL,
    p_success BOOLEAN DEFAULT TRUE,
    p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    IF p_success THEN
        UPDATE sync_state SET
            next_sync_token = p_next_sync_token,
            last_sync_time = CURRENT_TIMESTAMP,
            full_sync_completed = TRUE,
            sync_in_progress = FALSE,
            sync_error = NULL,
            sync_error_count = 0,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = p_user_id;
    ELSE
        UPDATE sync_state SET
            sync_in_progress = FALSE,
            sync_error = p_error_message,
            sync_error_count = COALESCE(sync_error_count, 0) + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = p_user_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Rollback script (for reference)
-- DROP TABLE IF EXISTS sync_state CASCADE;
-- DROP FUNCTION IF EXISTS get_users_needing_sync(INTEGER) CASCADE;
-- DROP FUNCTION IF EXISTS start_sync_for_user(UUID) CASCADE;
-- DROP FUNCTION IF EXISTS complete_sync_for_user(UUID, VARCHAR(500), BOOLEAN, TEXT) CASCADE;