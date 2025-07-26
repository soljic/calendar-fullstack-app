-- Migration: 002_create_calendar_events_table
-- Created: 2025-07-25
-- Description: Create calendar_events table for storing calendar events with Google Calendar sync

-- Create enum types for event status and source
CREATE TYPE event_status AS ENUM ('confirmed', 'tentative', 'cancelled');
CREATE TYPE event_source AS ENUM ('google', 'manual', 'imported');

-- Create calendar_events table
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
    status event_status DEFAULT 'confirmed',
    source event_source DEFAULT 'manual',
    is_all_day BOOLEAN DEFAULT FALSE,
    timezone VARCHAR(100) DEFAULT 'UTC',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_modified TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_date_range CHECK (end_date >= start_date),
    CONSTRAINT valid_google_event_id UNIQUE (user_id, google_event_id)
);

-- Create indexes for performance
CREATE INDEX idx_calendar_events_user_id ON calendar_events(user_id);
CREATE INDEX idx_calendar_events_google_event_id ON calendar_events(google_event_id);
CREATE INDEX idx_calendar_events_start_date ON calendar_events(start_date);
CREATE INDEX idx_calendar_events_end_date ON calendar_events(end_date);
CREATE INDEX idx_calendar_events_date_range ON calendar_events(start_date, end_date);
CREATE INDEX idx_calendar_events_status ON calendar_events(status);
CREATE INDEX idx_calendar_events_source ON calendar_events(source);
CREATE INDEX idx_calendar_events_last_modified ON calendar_events(last_modified);

-- Composite indexes for common queries
CREATE INDEX idx_calendar_events_user_date_range ON calendar_events(user_id, start_date, end_date);
CREATE INDEX idx_calendar_events_user_status ON calendar_events(user_id, status);

-- GIN index for JSONB attendees column
CREATE INDEX idx_calendar_events_attendees ON calendar_events USING GIN (attendees);

-- Create trigger for updated_at
CREATE TRIGGER update_calendar_events_updated_at
    BEFORE UPDATE ON calendar_events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for last_modified
CREATE OR REPLACE FUNCTION update_last_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_modified = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_calendar_events_last_modified
    BEFORE UPDATE ON calendar_events
    FOR EACH ROW
    EXECUTE FUNCTION update_last_modified_column();

-- Add comments for documentation
COMMENT ON TABLE calendar_events IS 'Calendar events with Google Calendar integration';
COMMENT ON COLUMN calendar_events.id IS 'Primary key UUID';
COMMENT ON COLUMN calendar_events.user_id IS 'Foreign key to users table';
COMMENT ON COLUMN calendar_events.google_event_id IS 'Google Calendar event ID for sync';
COMMENT ON COLUMN calendar_events.title IS 'Event title/summary';
COMMENT ON COLUMN calendar_events.description IS 'Event description/details';
COMMENT ON COLUMN calendar_events.start_date IS 'Event start date and time with timezone';
COMMENT ON COLUMN calendar_events.end_date IS 'Event end date and time with timezone';
COMMENT ON COLUMN calendar_events.location IS 'Event location';
COMMENT ON COLUMN calendar_events.attendees IS 'JSON array of event attendees';
COMMENT ON COLUMN calendar_events.status IS 'Event status (confirmed, tentative, cancelled)';
COMMENT ON COLUMN calendar_events.source IS 'Event source (google, manual, imported)';
COMMENT ON COLUMN calendar_events.is_all_day IS 'Whether this is an all-day event';
COMMENT ON COLUMN calendar_events.timezone IS 'Event timezone identifier';
COMMENT ON COLUMN calendar_events.created_at IS 'When the event was created';
COMMENT ON COLUMN calendar_events.updated_at IS 'When the event was last updated';
COMMENT ON COLUMN calendar_events.last_modified IS 'When the event was last modified (for sync)';

-- Create function to search events by date range
CREATE OR REPLACE FUNCTION get_events_in_range(
    p_user_id UUID,
    p_start_date TIMESTAMP WITH TIME ZONE,
    p_end_date TIMESTAMP WITH TIME ZONE
)
RETURNS TABLE (
    id UUID,
    title VARCHAR(500),
    description TEXT,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    location TEXT,
    status event_status
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
        e.status
    FROM calendar_events e
    WHERE e.user_id = p_user_id
      AND e.status != 'cancelled'
      AND (
          (e.start_date >= p_start_date AND e.start_date < p_end_date) OR
          (e.end_date > p_start_date AND e.end_date <= p_end_date) OR
          (e.start_date <= p_start_date AND e.end_date >= p_end_date)
      )
    ORDER BY e.start_date;
END;
$$ LANGUAGE plpgsql;

-- Rollback script (for reference)
-- DROP TABLE IF EXISTS calendar_events CASCADE;
-- DROP TYPE IF EXISTS event_status CASCADE;
-- DROP TYPE IF EXISTS event_source CASCADE;
-- DROP FUNCTION IF EXISTS update_last_modified_column() CASCADE;
-- DROP FUNCTION IF EXISTS get_events_in_range(UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) CASCADE;