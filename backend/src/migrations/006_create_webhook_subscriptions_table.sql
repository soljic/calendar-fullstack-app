-- Migration: 006_create_webhook_subscriptions_table
-- Created: 2025-07-25
-- Description: Create webhook_subscriptions table for Google Calendar webhook management

-- Create webhook_subscriptions table
CREATE TABLE webhook_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resource_id VARCHAR(255) NOT NULL,
    channel_id VARCHAR(255) NOT NULL UNIQUE,
    token VARCHAR(255),
    resource_uri TEXT NOT NULL,
    expiration TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_webhook_subscriptions_user_id ON webhook_subscriptions(user_id);
CREATE INDEX idx_webhook_subscriptions_resource_id ON webhook_subscriptions(resource_id);
CREATE INDEX idx_webhook_subscriptions_channel_id ON webhook_subscriptions(channel_id);
CREATE INDEX idx_webhook_subscriptions_token ON webhook_subscriptions(token);
CREATE INDEX idx_webhook_subscriptions_expiration ON webhook_subscriptions(expiration);
CREATE INDEX idx_webhook_subscriptions_active ON webhook_subscriptions(is_active);

-- Create trigger for updated_at
CREATE TRIGGER update_webhook_subscriptions_updated_at
    BEFORE UPDATE ON webhook_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE webhook_subscriptions IS 'Google Calendar webhook subscriptions for real-time sync';
COMMENT ON COLUMN webhook_subscriptions.id IS 'Primary key UUID';
COMMENT ON COLUMN webhook_subscriptions.user_id IS 'Foreign key to users table';
COMMENT ON COLUMN webhook_subscriptions.resource_id IS 'Google Calendar resource ID';
COMMENT ON COLUMN webhook_subscriptions.channel_id IS 'Google webhook channel ID';
COMMENT ON COLUMN webhook_subscriptions.token IS 'Optional token for webhook verification';
COMMENT ON COLUMN webhook_subscriptions.resource_uri IS 'Google Calendar resource URI';
COMMENT ON COLUMN webhook_subscriptions.expiration IS 'When the webhook subscription expires';
COMMENT ON COLUMN webhook_subscriptions.is_active IS 'Whether the subscription is active';
COMMENT ON COLUMN webhook_subscriptions.created_at IS 'When the subscription was created';
COMMENT ON COLUMN webhook_subscriptions.updated_at IS 'When the subscription was last updated';

-- Function to cleanup expired webhooks
CREATE OR REPLACE FUNCTION cleanup_expired_webhooks()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM webhook_subscriptions 
    WHERE expiration < CURRENT_TIMESTAMP OR is_active = FALSE;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get active webhook by token and resource
CREATE OR REPLACE FUNCTION get_webhook_by_token_and_resource(
    p_token VARCHAR(255),
    p_resource_id VARCHAR(255)
)
RETURNS TABLE (
    user_id UUID,
    channel_id VARCHAR(255),
    expiration TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ws.user_id,
        ws.channel_id,
        ws.expiration
    FROM webhook_subscriptions ws
    WHERE ws.token = p_token 
      AND ws.resource_id = p_resource_id
      AND ws.is_active = TRUE
      AND (ws.expiration IS NULL OR ws.expiration > CURRENT_TIMESTAMP);
END;
$$ LANGUAGE plpgsql;

-- Rollback script (for reference)
-- DROP TABLE IF EXISTS webhook_subscriptions CASCADE;
-- DROP FUNCTION IF EXISTS cleanup_expired_webhooks() CASCADE;
-- DROP FUNCTION IF EXISTS get_webhook_by_token_and_resource(VARCHAR(255), VARCHAR(255)) CASCADE;