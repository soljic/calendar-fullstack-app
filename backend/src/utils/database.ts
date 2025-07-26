import { db } from '../config/database';
import { PoolClient } from 'pg';

export interface MigrationInfo {
  filename: string;
  executedAt: Date;
  checksum: string;
}

export interface DatabaseStats {
  tableName: string;
  rowCount: number;
  tableSize: string;
  indexSize: string;
}

export class DatabaseUtils {
  static async runMigration(filename: string): Promise<void> {
    const migrationPath = `../migrations/${filename}`;
    try {
      const fs = require('fs');
      const path = require('path');
      const migrationContent = fs.readFileSync(
        path.resolve(__dirname, migrationPath),
        'utf8'
      );
      
      await db.query(migrationContent);
      console.log(`Migration executed: ${filename}`);
    } catch (error) {
      console.error(`Migration failed: ${filename}`, error);
      throw error;
    }
  }

  static async getExecutedMigrations(): Promise<MigrationInfo[]> {
    try {
      const result = await db.query(`
        SELECT filename, executed_at as "executedAt", checksum
        FROM schema_migrations
        ORDER BY executed_at ASC
      `);
      return result.rows;
    } catch (error) {
      console.error('Failed to fetch executed migrations:', error);
      return [];
    }
  }

  static async checkTableExists(tableName: string): Promise<boolean> {
    try {
      const result = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )
      `, [tableName]);
      
      return result.rows[0].exists;
    } catch (error) {
      console.error(`Failed to check if table ${tableName} exists:`, error);
      return false;
    }
  }

  static async getDatabaseStats(): Promise<DatabaseStats[]> {
    try {
      const result = await db.query(`
        SELECT * FROM get_database_stats()
      `);
      return result.rows;
    } catch (error) {
      console.error('Failed to get database stats:', error);
      return [];
    }
  }

  static async getUsersNeedingSync(intervalMinutes: number = 15): Promise<any[]> {
    try {
      const result = await db.query(`
        SELECT * FROM get_users_needing_sync($1)
      `, [intervalMinutes]);
      return result.rows;
    } catch (error) {
      console.error('Failed to get users needing sync:', error);
      return [];
    }
  }

  static async startSyncForUser(userId: string): Promise<boolean> {
    try {
      const result = await db.query(`
        SELECT start_sync_for_user($1) as success
      `, [userId]);
      return result.rows[0].success;
    } catch (error) {
      console.error(`Failed to start sync for user ${userId}:`, error);
      return false;
    }
  }

  static async completeSyncForUser(
    userId: string,
    nextSyncToken?: string,
    success: boolean = true,
    errorMessage?: string
  ): Promise<void> {
    try {
      await db.query(`
        SELECT complete_sync_for_user($1, $2, $3, $4)
      `, [userId, nextSyncToken, success, errorMessage]);
    } catch (error) {
      console.error(`Failed to complete sync for user ${userId}:`, error);
      throw error;
    }
  }

  static async searchEvents(
    userId: string,
    searchTerm: string,
    limit: number = 50
  ): Promise<any[]> {
    try {
      const result = await db.query(`
        SELECT * FROM search_events($1, $2, $3)
      `, [userId, searchTerm, limit]);
      return result.rows;
    } catch (error) {
      console.error(`Failed to search events for user ${userId}:`, error);
      return [];
    }
  }

  static async getEventsInRange(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any[]> {
    try {
      const result = await db.query(`
        SELECT * FROM get_events_in_range($1, $2, $3)
      `, [userId, startDate, endDate]);
      return result.rows;
    } catch (error) {
      console.error(`Failed to get events in range for user ${userId}:`, error);
      return [];
    }
  }

  static async cleanupOldCancelledEvents(daysOld: number = 90): Promise<number> {
    try {
      const result = await db.query(`
        SELECT cleanup_old_cancelled_events($1) as deleted_count
      `, [daysOld]);
      return result.rows[0].deleted_count;
    } catch (error) {
      console.error('Failed to cleanup old cancelled events:', error);
      return 0;
    }
  }

  static async cleanupOrphanedSyncStates(): Promise<number> {
    try {
      const result = await db.query(`
        SELECT cleanup_orphaned_sync_states() as deleted_count
      `);
      return result.rows[0].deleted_count;
    } catch (error) {
      console.error('Failed to cleanup orphaned sync states:', error);
      return 0;
    }
  }

  static async refreshCalendarStats(): Promise<void> {
    try {
      await db.query('SELECT refresh_calendar_stats()');
    } catch (error) {
      console.error('Failed to refresh calendar stats:', error);
      throw error;
    }
  }

  static async encryptToken(token: string): Promise<string> {
    try {
      const result = await db.query(`
        SELECT encode(digest($1, 'sha256'), 'hex') as encrypted_token
      `, [token]);
      return result.rows[0].encrypted_token;
    } catch (error) {
      console.error('Failed to encrypt token:', error);
      throw error;
    }
  }

  static async createUser(userData: {
    googleId?: string;
    email: string;
    name: string;
    pictureUrl?: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresAt?: Date;
  }): Promise<string> {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      
      const result = await client.query(`
        INSERT INTO users (
          google_id, email, name, picture_url, 
          access_token, refresh_token, token_expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `, [
        userData.googleId,
        userData.email,
        userData.name,
        userData.pictureUrl,
        userData.accessToken,
        userData.refreshToken,
        userData.tokenExpiresAt
      ]);
      
      const userId = result.rows[0].id;
      
      // Initialize sync state
      await client.query(`
        INSERT INTO sync_state (user_id) VALUES ($1)
      `, [userId]);
      
      await client.query('COMMIT');
      return userId;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Failed to create user:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async updateUserTokens(
    userId: string,
    accessToken: string,
    refreshToken?: string,
    expiresAt?: Date
  ): Promise<void> {
    try {
      await db.query(`
        UPDATE users 
        SET 
          access_token = $2,
          refresh_token = COALESCE($3, refresh_token),
          token_expires_at = $4,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [userId, accessToken, refreshToken, expiresAt]);
    } catch (error) {
      console.error(`Failed to update tokens for user ${userId}:`, error);
      throw error;
    }
  }

  static async getUserByGoogleId(googleId: string): Promise<any> {
    try {
      const result = await db.query(`
        SELECT * FROM users WHERE google_id = $1
      `, [googleId]);
      return result.rows[0] || null;
    } catch (error) {
      console.error(`Failed to get user by Google ID ${googleId}:`, error);
      return null;
    }
  }

  static async getUserByEmail(email: string): Promise<any> {
    try {
      const result = await db.query(`
        SELECT * FROM users WHERE email = $1
      `, [email]);
      return result.rows[0] || null;
    } catch (error) {
      console.error(`Failed to get user by email ${email}:`, error);
      return null;
    }
  }

  static async createEvent(eventData: {
    userId: string;
    googleEventId?: string;
    title: string;
    description?: string;
    startDate: Date;
    endDate: Date;
    location?: string;
    attendees?: any[];
    status?: string;
    source?: string;
    isAllDay?: boolean;
    timezone?: string;
  }): Promise<string> {
    try {
      const result = await db.query(`
        INSERT INTO calendar_events (
          user_id, google_event_id, title, description,
          start_date, end_date, location, attendees,
          status, source, is_all_day, timezone
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
      `, [
        eventData.userId,
        eventData.googleEventId,
        eventData.title,
        eventData.description,
        eventData.startDate,
        eventData.endDate,
        eventData.location,
        JSON.stringify(eventData.attendees || []),
        eventData.status || 'confirmed',
        eventData.source || 'manual',
        eventData.isAllDay || false,
        eventData.timezone || 'UTC'
      ]);
      
      return result.rows[0].id;
    } catch (error) {
      console.error('Failed to create event:', error);
      throw error;
    }
  }

  static async upsertGoogleEvent(eventData: {
    userId: string;
    googleEventId: string;
    title: string;
    description?: string;
    startDate: Date;
    endDate: Date;
    location?: string;
    attendees?: any[];
    status?: string;
    isAllDay?: boolean;
    timezone?: string;
  }): Promise<string> {
    try {
      const result = await db.query(`
        INSERT INTO calendar_events (
          user_id, google_event_id, title, description,
          start_date, end_date, location, attendees,
          status, source, is_all_day, timezone
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'google', $10, $11)
        ON CONFLICT (user_id, google_event_id)
        DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          start_date = EXCLUDED.start_date,
          end_date = EXCLUDED.end_date,
          location = EXCLUDED.location,
          attendees = EXCLUDED.attendees,
          status = EXCLUDED.status,
          is_all_day = EXCLUDED.is_all_day,
          timezone = EXCLUDED.timezone,
          updated_at = CURRENT_TIMESTAMP,
          last_modified = CURRENT_TIMESTAMP
        RETURNING id
      `, [
        eventData.userId,
        eventData.googleEventId,
        eventData.title,
        eventData.description,
        eventData.startDate,
        eventData.endDate,
        eventData.location,
        JSON.stringify(eventData.attendees || []),
        eventData.status || 'confirmed',
        eventData.isAllDay || false,
        eventData.timezone || 'UTC'
      ]);
      
      return result.rows[0].id;
    } catch (error) {
      console.error('Failed to upsert Google event:', error);
      throw error;
    }
  }
}