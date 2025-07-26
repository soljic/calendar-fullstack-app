-- Migration: 005_create_oauth_states_table
-- Created: 2025-07-25
-- Description: Create oauth_states table for CSRF protection in OAuth flow

-- Create oauth_states table for CSRF protection
CREATE TABLE oauth_states (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    state VARCHAR(64) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_oauth_states_state ON oauth_states(state);
CREATE INDEX idx_oauth_states_expires_at ON oauth_states(expires_at);
CREATE INDEX idx_oauth_states_user_id ON oauth_states(user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_oauth_states_updated_at
    BEFORE UPDATE ON oauth_states
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE oauth_states IS 'OAuth state tokens for CSRF protection';
COMMENT ON COLUMN oauth_states.id IS 'Primary key UUID';
COMMENT ON COLUMN oauth_states.state IS 'Random state token for OAuth flow';
COMMENT ON COLUMN oauth_states.user_id IS 'Optional user ID for state tracking';
COMMENT ON COLUMN oauth_states.expires_at IS 'When the state token expires';
COMMENT ON COLUMN oauth_states.created_at IS 'When the state was created';
COMMENT ON COLUMN oauth_states.updated_at IS 'When the state was last updated';

-- Rollback script (for reference)
-- DROP TABLE IF EXISTS oauth_states CASCADE;