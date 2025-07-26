import { google, calendar_v3 } from 'googleapis';
import { TokenService } from './tokenService';
import { db } from '../config/database';
import { 
  GoogleCalendarEvent,
  CalendarEventInput,
  CalendarEventResponse,
  CalendarSyncResult,
  CalendarError,
  EventsQueryParams,
  EventsResponse,
  WebhookData,
  SyncOptions,
  BatchSyncResult,
  RetryConfig,
  DEFAULT_RETRY_CONFIG,
  CalendarErrorType,
  EventDateRange,
  DateRangeFilter,
  CalendarServiceMetrics
} from '../types/calendar';
import { 
  InternalServerError, 
  BadRequestError, 
  UnauthorizedError,
  NotFoundError,
  ConflictError
} from '../middleware/errorHandler';

export class CalendarService {
  private static metrics: CalendarServiceMetrics = {
    apiCallsCount: 0,
    rateLimitHits: 0,
    quotaExceededCount: 0,
    networkErrors: 0,
    authErrors: 0,
    averageResponseTime: 0,
  };

  private static async getAuthenticatedCalendar(userId: string): Promise<calendar_v3.Calendar> {
    try {
      const accessToken = await TokenService.ensureValidToken(userId);
      
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({ access_token: accessToken });
      
      return google.calendar({ version: 'v3', auth: oauth2Client });
    } catch (error) {
      console.error(`Failed to get authenticated calendar for user ${userId}:`, error);
      throw new UnauthorizedError('Failed to authenticate with Google Calendar');
    }
  }

  private static async executeWithRetry<T>(
    operation: () => Promise<T>,
    retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
  ): Promise<T> {
    let lastError: Error = new Error('Unknown error');
    
    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        const startTime = Date.now();
        const result = await operation();
        
        // Update metrics
        this.metrics.apiCallsCount++;
        const responseTime = Date.now() - startTime;
        this.metrics.averageResponseTime = 
          (this.metrics.averageResponseTime * (this.metrics.apiCallsCount - 1) + responseTime) / 
          this.metrics.apiCallsCount;
        this.metrics.lastApiCall = new Date();
        
        return result;
      } catch (error: any) {
        lastError = error;
        
        // Handle specific error types
        if (this.isRateLimitError(error)) {
          this.metrics.rateLimitHits++;
          const retryAfter = this.getRetryAfterDelay(error) || this.calculateBackoffDelay(attempt, retryConfig);
          
          if (attempt < retryConfig.maxRetries) {
            console.warn(`Rate limit hit, retrying after ${retryAfter}ms (attempt ${attempt + 1}/${retryConfig.maxRetries + 1})`);
            await this.delay(retryAfter);
            continue;
          }
        } else if (this.isQuotaExceededError(error)) {
          this.metrics.quotaExceededCount++;
          throw new InternalServerError('Google Calendar API quota exceeded');
        } else if (this.isAuthError(error)) {
          this.metrics.authErrors++;
          throw new UnauthorizedError('Google Calendar authentication failed');
        } else if (this.isNetworkError(error)) {
          this.metrics.networkErrors++;
          
          if (attempt < retryConfig.maxRetries) {
            const delay = this.calculateBackoffDelay(attempt, retryConfig);
            console.warn(`Network error, retrying after ${delay}ms (attempt ${attempt + 1}/${retryConfig.maxRetries + 1})`);
            await this.delay(delay);
            continue;
          }
        } else {
          // Non-retryable error
          break;
        }
      }
    }
    
    console.error('Operation failed after all retry attempts:', lastError);
    throw lastError;
  }

  private static isRateLimitError(error: any): boolean {
    return error?.code === 429 || 
           error?.message?.includes('rateLimitExceeded') ||
           error?.message?.includes('userRateLimitExceeded');
  }

  private static isQuotaExceededError(error: any): boolean {
    return error?.code === 403 && 
           (error?.message?.includes('quotaExceeded') || 
            error?.message?.includes('dailyLimitExceeded'));
  }

  private static isAuthError(error: any): boolean {
    return error?.code === 401 || 
           error?.message?.includes('invalid_grant') ||
           error?.message?.includes('unauthorized');
  }

  private static isNetworkError(error: any): boolean {
    return error?.code === 'ECONNRESET' ||
           error?.code === 'ENOTFOUND' ||
           error?.code === 'ETIMEDOUT' ||
           error?.message?.includes('network') ||
           error?.message?.includes('timeout');
  }

  private static getRetryAfterDelay(error: any): number | null {
    const retryAfter = error?.response?.headers?.['retry-after'];
    if (retryAfter) {
      return parseInt(retryAfter) * 1000; // Convert seconds to milliseconds
    }
    return null;
  }

  private static calculateBackoffDelay(attempt: number, config: RetryConfig): number {
    const delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt);
    return Math.min(delay, config.maxDelay);
  }

  private static async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Event Fetching Methods
  static async getEvents(
    userId: string, 
    params: EventsQueryParams = {}
  ): Promise<EventsResponse> {
    try {
      const { page = 1, limit = 50, startDate, endDate, timezone = 'UTC', status, search, source } = params;
      const offset = (page - 1) * limit;

      // Build database query
      let query = `
        SELECT 
          id, google_event_id, title, description, start_date, end_date,
          location, attendees, is_all_day, timezone, status, source,
          created_at, updated_at, last_modified
        FROM calendar_events 
        WHERE user_id = $1
      `;
      
      const queryParams: any[] = [userId];
      let paramIndex = 2;

      // Add filters
      if (startDate) {
        query += ` AND start_date >= $${paramIndex}`;
        queryParams.push(new Date(startDate));
        paramIndex++;
      }

      if (endDate) {
        query += ` AND end_date <= $${paramIndex}`;
        queryParams.push(new Date(endDate));
        paramIndex++;
      }

      if (status) {
        query += ` AND status = $${paramIndex}`;
        queryParams.push(status);
        paramIndex++;
      }

      if (source && source !== 'all') {
        query += ` AND source = $${paramIndex}`;
        queryParams.push(source);
        paramIndex++;
      }

      if (search) {
        query += ` AND (title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
        queryParams.push(`%${search}%`);
        paramIndex++;
      }

      query += ` ORDER BY start_date ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      queryParams.push(limit, offset);

      let countQuery = query.replace(/SELECT .* FROM/, 'SELECT COUNT(*) FROM')
                           .replace(/ORDER BY .* LIMIT .* OFFSET .*/, '');
      const countParams = queryParams.slice(0, -2); // Remove limit and offset

      const [eventsResult, countResult] = await Promise.all([
        db.query(query, queryParams),
        db.query(countQuery, countParams)
      ]);

      const events: CalendarEventResponse[] = eventsResult.rows.map(this.mapDatabaseEventToResponse);
      const total = countResult.rows.length > 0 ? parseInt(countResult.rows[0].count, 10) : 0;

      return {
        events,
        pagination: {
          page,
          limit,
          total,
          hasNext: offset + limit < total,
          hasPrev: page > 1,
        }
      };
    } catch (error) {
      console.error(`Failed to get events for user ${userId}:`, error);
      throw new InternalServerError('Failed to retrieve events');
    }
  }

  static async getEventsByDateRange(
    userId: string,
    range: EventDateRange,
    customRange?: { startDate: Date; endDate: Date },
    timezone: string = 'UTC'
  ): Promise<CalendarEventResponse[]> {
    try {
      const dateFilter = this.getDateRangeFilter(range, timezone, customRange);
      
      const result = await this.getEvents(userId, {
        startDate: dateFilter.startDate.toISOString(),
        endDate: dateFilter.endDate.toISOString(),
        timezone,
        limit: 1000 // Get all events in range
      });

      return result.events;
    } catch (error) {
      console.error(`Failed to get events by date range for user ${userId}:`, error);
      throw error;
    }
  }

  private static getDateRangeFilter(
    range: EventDateRange,
    timezone: string,
    customRange?: { startDate: Date; endDate: Date }
  ): DateRangeFilter {
    const now = new Date();
    
    switch (range) {
      case EventDateRange.TODAY:
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);
        
        return {
          startDate: startOfDay,
          endDate: endOfDay,
          timezone
        };

      case EventDateRange.WEEK:
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);
        
        return {
          startDate: startOfWeek,
          endDate: endOfWeek,
          timezone
        };

      case EventDateRange.MONTH:
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        endOfMonth.setHours(23, 59, 59, 999);
        
        return {
          startDate: startOfMonth,
          endDate: endOfMonth,
          timezone
        };

      case EventDateRange.CUSTOM:
        if (!customRange) {
          throw new BadRequestError('Custom range requires startDate and endDate');
        }
        return {
          startDate: customRange.startDate,
          endDate: customRange.endDate,
          timezone
        };

      default:
        throw new BadRequestError('Invalid date range specified');
    }
  }

  // Event Management Methods
  static async createEvent(userId: string, eventData: CalendarEventInput): Promise<CalendarEventResponse> {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Validate input
      this.validateEventInput(eventData);

      // Create event in Google Calendar
      const calendar = await this.getAuthenticatedCalendar(userId);
      const googleEvent = this.mapInputToGoogleEvent(eventData);

      const googleResponse = await this.executeWithRetry(async () => {
        return calendar.events.insert({
          calendarId: 'primary',
          requestBody: googleEvent,
          sendUpdates: 'all'
        });
      });

      if (!googleResponse.data.id) {
        throw new InternalServerError('Failed to create event in Google Calendar');
      }

      // Store in local database
      const result = await client.query(`
        INSERT INTO calendar_events (
          user_id, google_event_id, title, description, start_date, end_date,
          location, attendees, is_all_day, timezone, status, source
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'google')
        RETURNING *
      `, [
        userId,
        googleResponse.data.id,
        eventData.title,
        eventData.description,
        eventData.startDate,
        eventData.endDate,
        eventData.location,
        JSON.stringify(eventData.attendees || []),
        eventData.isAllDay || false,
        eventData.timezone || 'UTC',
        eventData.status || 'confirmed'
      ]);

      await client.query('COMMIT');

      console.log(`Event created for user ${userId}: ${result.rows[0].id}`);
      return this.mapDatabaseEventToResponse(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`Failed to create event for user ${userId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async updateEvent(
    userId: string, 
    eventId: string, 
    eventData: Partial<CalendarEventInput>
  ): Promise<CalendarEventResponse> {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Get existing event
      const existingResult = await client.query(`
        SELECT * FROM calendar_events 
        WHERE id = $1 AND user_id = $2
      `, [eventId, userId]);

      if (existingResult.rows.length === 0) {
        throw new NotFoundError('Event not found');
      }

      const existingEvent = existingResult.rows[0];

      // Update in Google Calendar if it has a Google event ID
      if (existingEvent.google_event_id) {
        const calendar = await this.getAuthenticatedCalendar(userId);
        const googleEvent = this.mapInputToGoogleEvent({
          title: eventData.title || existingEvent.title,
          description: eventData.description !== undefined ? eventData.description : existingEvent.description,
          startDate: eventData.startDate || existingEvent.start_date,
          endDate: eventData.endDate || existingEvent.end_date,
          location: eventData.location !== undefined ? eventData.location : existingEvent.location,
          attendees: eventData.attendees !== undefined ? eventData.attendees : JSON.parse(existingEvent.attendees || '[]'),
          isAllDay: eventData.isAllDay !== undefined ? eventData.isAllDay : existingEvent.is_all_day,
          timezone: eventData.timezone || existingEvent.timezone,
          status: eventData.status || existingEvent.status
        });

        await this.executeWithRetry(async () => {
          return calendar.events.update({
            calendarId: 'primary',
            eventId: existingEvent.google_event_id,
            requestBody: googleEvent,
            sendUpdates: 'all'
          });
        });
      }

      // Update in local database
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramIndex = 1;

      if (eventData.title !== undefined) {
        updateFields.push(`title = $${paramIndex++}`);
        updateValues.push(eventData.title);
      }

      if (eventData.description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        updateValues.push(eventData.description);
      }

      if (eventData.startDate !== undefined) {
        updateFields.push(`start_date = $${paramIndex++}`);
        updateValues.push(eventData.startDate);
      }

      if (eventData.endDate !== undefined) {
        updateFields.push(`end_date = $${paramIndex++}`);
        updateValues.push(eventData.endDate);
      }

      if (eventData.location !== undefined) {
        updateFields.push(`location = $${paramIndex++}`);
        updateValues.push(eventData.location);
      }

      if (eventData.attendees !== undefined) {
        updateFields.push(`attendees = $${paramIndex++}`);
        updateValues.push(JSON.stringify(eventData.attendees));
      }

      if (eventData.isAllDay !== undefined) {
        updateFields.push(`is_all_day = $${paramIndex++}`);
        updateValues.push(eventData.isAllDay);
      }

      if (eventData.timezone !== undefined) {
        updateFields.push(`timezone = $${paramIndex++}`);
        updateValues.push(eventData.timezone);
      }

      if (eventData.status !== undefined) {
        updateFields.push(`status = $${paramIndex++}`);
        updateValues.push(eventData.status);
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      updateFields.push(`last_modified = CURRENT_TIMESTAMP`);

      updateValues.push(eventId, userId);

      const result = await client.query(`
        UPDATE calendar_events 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}
        RETURNING *
      `, updateValues);

      await client.query('COMMIT');

      console.log(`Event updated for user ${userId}: ${eventId}`);
      return this.mapDatabaseEventToResponse(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`Failed to update event ${eventId} for user ${userId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async deleteEvent(userId: string, eventId: string): Promise<void> {
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Get existing event
      const existingResult = await client.query(`
        SELECT * FROM calendar_events 
        WHERE id = $1 AND user_id = $2
      `, [eventId, userId]);

      if (existingResult.rows.length === 0) {
        throw new NotFoundError('Event not found');
      }

      const existingEvent = existingResult.rows[0];

      // Delete from Google Calendar if it has a Google event ID
      if (existingEvent.google_event_id) {
        const calendar = await this.getAuthenticatedCalendar(userId);

        try {
          await this.executeWithRetry(async () => {
            return calendar.events.delete({
              calendarId: 'primary',
              eventId: existingEvent.google_event_id,
              sendUpdates: 'all'
            });
          });
        } catch (error: any) {
          // If event is already deleted in Google Calendar, continue with local deletion
          if (error?.code !== 404 && error?.code !== 410) {
            throw error;
          }
          console.warn(`Event ${existingEvent.google_event_id} already deleted from Google Calendar`);
        }
      }

      // Delete from local database
      await client.query(`
        DELETE FROM calendar_events 
        WHERE id = $1 AND user_id = $2
      `, [eventId, userId]);

      await client.query('COMMIT');

      console.log(`Event deleted for user ${userId}: ${eventId}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`Failed to delete event ${eventId} for user ${userId}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  // Utility Methods
  private static validateEventInput(eventData: CalendarEventInput): void {
    if (!eventData.title || eventData.title.trim().length === 0) {
      throw new BadRequestError('Event title is required');
    }

    if (!eventData.startDate || !eventData.endDate) {
      throw new BadRequestError('Start date and end date are required');
    }

    if (eventData.startDate >= eventData.endDate) {
      throw new BadRequestError('End date must be after start date');
    }

    if (eventData.attendees) {
      for (const attendee of eventData.attendees) {
        if (!attendee.email || !this.isValidEmail(attendee.email)) {
          throw new BadRequestError(`Invalid attendee email: ${attendee.email}`);
        }
      }
    }
  }

  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private static mapInputToGoogleEvent(eventData: CalendarEventInput): GoogleCalendarEvent {
    const isAllDay = eventData.isAllDay || false;
    
    return {
      id: '', // Will be set by Google
      summary: eventData.title,
      description: eventData.description,
      start: isAllDay ? 
        { date: eventData.startDate.toISOString().split('T')[0] } :
        { 
          dateTime: eventData.startDate.toISOString(),
          timeZone: eventData.timezone || 'UTC'
        },
      end: isAllDay ?
        { date: eventData.endDate.toISOString().split('T')[0] } :
        {
          dateTime: eventData.endDate.toISOString(),
          timeZone: eventData.timezone || 'UTC'
        },
      location: eventData.location,
      attendees: eventData.attendees?.map(attendee => ({
        email: attendee.email,
        displayName: attendee.displayName,
        optional: attendee.optional || false
      })),
      status: eventData.status || 'confirmed'
    };
  }

 private static mapDatabaseEventToResponse(dbEvent: any): CalendarEventResponse {
  return {
    id: dbEvent.id,
    googleEventId: dbEvent.google_event_id,
    title: dbEvent.title,
    description: dbEvent.description,
    startDate: dbEvent.start_date,
    endDate: dbEvent.end_date,
    location: dbEvent.location,
    attendees: (() => {
      try {
        if (!dbEvent.attendees) return [];
        return typeof dbEvent.attendees === 'string'
          ? JSON.parse(dbEvent.attendees)
          : dbEvent.attendees;
      } catch {
        return [];
      }
    })(),
    isAllDay: dbEvent.is_all_day,
    timezone: dbEvent.timezone,
    status: dbEvent.status,
    source: dbEvent.source,
    createdAt: dbEvent.created_at,
    updatedAt: dbEvent.updated_at,
    lastModified: dbEvent.last_modified
  };
}


  static getMetrics(): CalendarServiceMetrics {
    return { ...this.metrics };
  }

  static resetMetrics(): void {
    this.metrics = {
      apiCallsCount: 0,
      rateLimitHits: 0,
      quotaExceededCount: 0,
      networkErrors: 0,
      authErrors: 0,
      averageResponseTime: 0,
    };
  }

  // Synchronization Methods
  static async syncWithGoogle(userId: string, options: SyncOptions = {}): Promise<CalendarSyncResult> {
    try {
      console.log(`Starting sync for user ${userId}`);

      const calendar = await this.getAuthenticatedCalendar(userId);
      const syncState = await this.getSyncState(userId);
      
      let result: CalendarSyncResult = {
        success: false,
        eventsProcessed: 0,
        eventsCreated: 0,
        eventsUpdated: 0,
        eventsDeleted: 0,
        errors: []
      };

      // Determine sync type
      const isFullSync = options.fullSync || !syncState.next_sync_token || !syncState.full_sync_completed;
      
      if (isFullSync) {
        result = await this.performFullSync(userId, calendar, options);
      } else {
        result = await this.performIncrementalSync(userId, calendar, syncState.next_sync_token, options);
      }

      // Update sync state
      await this.updateSyncState(userId, result.nextSyncToken, result.success);

      console.log(`Sync completed for user ${userId}:`, result);
      return result;
    } catch (error) {
      console.error(`Sync failed for user ${userId}:`, error);
      await this.updateSyncState(userId, null, false, error instanceof Error ? error.message : 'Unknown error');
      
      return {
        success: false,
        eventsProcessed: 0,
        eventsCreated: 0,
        eventsUpdated: 0,
        eventsDeleted: 0,
        errors: [{
          type: CalendarErrorType.SYNC_ERROR,
          message: error instanceof Error ? error.message : 'Unknown sync error'
        }]
      };
    }
  }

  private static async performFullSync(
    userId: string, 
    calendar: calendar_v3.Calendar, 
    options: SyncOptions
  ): Promise<CalendarSyncResult> {
    const result: CalendarSyncResult = {
      success: true,
      eventsProcessed: 0,
      eventsCreated: 0,
      eventsUpdated: 0,
      eventsDeleted: 0,
      errors: []
    };

    try {
      // Set time boundaries
      const timeMin = options.timeMin || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // 1 year ago
      const timeMax = options.timeMax || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year from now
      
      let pageToken: string | undefined;
      const maxResults = options.maxResults || 2500; // Google's max

      do {
        const response = await this.executeWithRetry(async () => {
          return calendar.events.list({
            calendarId: 'primary',
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            maxResults: Math.min(maxResults, 2500),
            pageToken,
            singleEvents: true,
            orderBy: 'startTime'
          });
        });

        if (response.data.items) {
          for (const googleEvent of response.data.items) {
            try {
              await this.processGoogleEvent(userId, googleEvent, result);
              result.eventsProcessed++;
            } catch (error) {
              console.error(`Failed to process event ${googleEvent.id}:`, error);
              result.errors!.push({
                type: CalendarErrorType.SYNC_ERROR,
                message: `Failed to process event ${googleEvent.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
              });
            }
          }
        }

        pageToken = response.data.nextPageToken || undefined;
        result.nextSyncToken = response.data.nextSyncToken || undefined;
      } while (pageToken);

      return result;
    } catch (error) {
      result.success = false;
      result.errors!.push({
        type: CalendarErrorType.SYNC_ERROR,
        message: error instanceof Error ? error.message : 'Full sync failed'
      });
      return result;
    }
  }

  private static async performIncrementalSync(
    userId: string,
    calendar: calendar_v3.Calendar,
    syncToken: string,
    options: SyncOptions
  ): Promise<CalendarSyncResult> {
    const result: CalendarSyncResult = {
      success: true,
      eventsProcessed: 0,
      eventsCreated: 0,
      eventsUpdated: 0,
      eventsDeleted: 0,
      errors: []
    };

    try {
      let pageToken: string | undefined;

      do {
        const response = await this.executeWithRetry(async () => {
          return calendar.events.list({
            calendarId: 'primary',
            syncToken: pageToken ? undefined : syncToken,
            pageToken,
            maxResults: options.maxResults || 2500
          });
        });

        if (response.data.items) {
          for (const googleEvent of response.data.items) {
            try {
              await this.processGoogleEvent(userId, googleEvent, result);
              result.eventsProcessed++;
            } catch (error) {
              console.error(`Failed to process event ${googleEvent.id}:`, error);
              result.errors!.push({
                type: CalendarErrorType.SYNC_ERROR,
                message: `Failed to process event ${googleEvent.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
              });
            }
          }
        }

        pageToken = response.data.nextPageToken || undefined;
        result.nextSyncToken = response.data.nextSyncToken || undefined;
      } while (pageToken);

      return result;
    } catch (error: any) {
      // If sync token is invalid, fall back to full sync
      if (error?.code === 410 || error?.message?.includes('Sync token is no longer valid')) {
        console.log(`Sync token invalid for user ${userId}, performing full sync`);
        return this.performFullSync(userId, calendar, { ...options, fullSync: true });
      }

      result.success = false;
      result.errors!.push({
        type: CalendarErrorType.SYNC_ERROR,
        message: error instanceof Error ? error.message : 'Incremental sync failed'
      });
      return result;
    }
  }

  private static async processGoogleEvent(
    userId: string,
    googleEvent: any,
    result: CalendarSyncResult
  ): Promise<void> {
    if (!googleEvent.id) return;

    // Handle deleted events
    if (googleEvent.status === 'cancelled') {
      await this.handleDeletedEvent(userId, googleEvent.id);
      result.eventsDeleted++;
      return;
    }

    // Check if event exists in database
    const existingEvent = await db.query(`
      SELECT id, last_modified FROM calendar_events 
      WHERE user_id = $1 AND google_event_id = $2
    `, [userId, googleEvent.id]);

    const googleUpdated = new Date(googleEvent.updated);

    if (existingEvent.rows.length === 0) {
      // Create new event
      await this.createEventFromGoogle(userId, googleEvent);
      result.eventsCreated++;
    } else {
      // Check if update is needed
      const localUpdated = new Date(existingEvent.rows[0].last_modified);
      if (googleUpdated > localUpdated) {
        await this.updateEventFromGoogle(userId, existingEvent.rows[0].id, googleEvent);
        result.eventsUpdated++;
      }
    }
  }

  private static async createEventFromGoogle(userId: string, googleEvent: any): Promise<void> {
    const eventData = this.mapGoogleEventToInput(googleEvent);
    
    await db.query(`
      INSERT INTO calendar_events (
        user_id, google_event_id, title, description, start_date, end_date,
        location, attendees, is_all_day, timezone, status, source
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'google')
    `, [
      userId,
      googleEvent.id,
      eventData.title,
      eventData.description,
      eventData.startDate,
      eventData.endDate,
      eventData.location,
      JSON.stringify(eventData.attendees || []),
      eventData.isAllDay,
      eventData.timezone,
      eventData.status
    ]);
  }

  private static async updateEventFromGoogle(userId: string, eventId: string, googleEvent: any): Promise<void> {
    const eventData = this.mapGoogleEventToInput(googleEvent);
    
    await db.query(`
      UPDATE calendar_events 
      SET 
        title = $1, description = $2, start_date = $3, end_date = $4,
        location = $5, attendees = $6, is_all_day = $7, timezone = $8,
        status = $9, updated_at = CURRENT_TIMESTAMP, last_modified = CURRENT_TIMESTAMP
      WHERE id = $10 AND user_id = $11
    `, [
      eventData.title,
      eventData.description,
      eventData.startDate,
      eventData.endDate,
      eventData.location,
      JSON.stringify(eventData.attendees || []),
      eventData.isAllDay,
      eventData.timezone,
      eventData.status,
      eventId,
      userId
    ]);
  }

  private static async handleDeletedEvent(userId: string, googleEventId: string): Promise<void> {
    await db.query(`
      DELETE FROM calendar_events 
      WHERE user_id = $1 AND google_event_id = $2
    `, [userId, googleEventId]);
  }

  private static mapGoogleEventToInput(googleEvent: any): CalendarEventInput {
    const start = googleEvent.start;
    const end = googleEvent.end;
    const isAllDay = !!start.date;

    return {
      title: googleEvent.summary || 'Untitled Event',
      description: googleEvent.description,
      startDate: new Date(start.dateTime || start.date),
      endDate: new Date(end.dateTime || end.date),
      location: googleEvent.location,
      attendees: googleEvent.attendees?.map((attendee: any) => ({
        email: attendee.email,
        displayName: attendee.displayName,
        optional: attendee.optional || false
      })) || [],
      isAllDay,
      timezone: start.timeZone || 'UTC',
      status: googleEvent.status || 'confirmed'
    };
  }

  private static async getSyncState(userId: string): Promise<any> {
    const result = await db.query(`
      SELECT * FROM sync_state WHERE user_id = $1
    `, [userId]);

    return result.rows[0] || {
      user_id: userId,
      next_sync_token: null,
      last_sync_time: null,
      full_sync_completed: false
    };
  }

  private static async updateSyncState(
    userId: string, 
    nextSyncToken?: string | null,
    success: boolean = true,
    error?: string
  ): Promise<void> {
    await db.query(`
      INSERT INTO sync_state (user_id, next_sync_token, last_sync_time, full_sync_completed, sync_error, sync_error_count)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id) DO UPDATE SET
        next_sync_token = EXCLUDED.next_sync_token,
        last_sync_time = CASE WHEN $4 THEN CURRENT_TIMESTAMP ELSE sync_state.last_sync_time END,
        full_sync_completed = CASE WHEN $4 THEN true ELSE sync_state.full_sync_completed END,
        sync_error = EXCLUDED.sync_error,
        sync_error_count = CASE 
          WHEN $4 THEN 0 
          ELSE COALESCE(sync_state.sync_error_count, 0) + 1 
        END,
        updated_at = CURRENT_TIMESTAMP
    `, [userId, nextSyncToken, new Date(), success, error, error ? 1 : 0]);
  }

  // Webhook handling
  static async handleWebhook(webhookData: WebhookData): Promise<void> {
    try {
      console.log('Processing webhook:', webhookData);

      // Extract user ID from resource URI or use other identification method
      // This depends on how you set up the webhook subscription
      const userId = await this.extractUserIdFromWebhook(webhookData);
      
      if (!userId) {
        console.warn('Could not determine user ID from webhook data');
        return;
      }

      // Trigger incremental sync for the user
      await this.syncWithGoogle(userId, { maxResults: 100 });
      
      console.log(`Webhook processed for user ${userId}`);
    } catch (error) {
      console.error('Failed to process webhook:', error);
      throw error;
    }
  }

  private static async extractUserIdFromWebhook(webhookData: WebhookData): Promise<string | null> {
    // Implementation depends on how you store webhook subscriptions
    // You might store the user ID in the webhook token or resource metadata
    try {
      if (webhookData.token) {
        // If you store user ID in the token
        const result = await db.query(`
          SELECT user_id FROM webhook_subscriptions 
          WHERE token = $1 AND resource_id = $2
        `, [webhookData.token, webhookData.resourceId]);
        
        return result.rows[0]?.user_id || null;
      }
      
      return null;
    } catch (error) {
      console.error('Failed to extract user ID from webhook:', error);
      return null;
    }
  }

  // Batch synchronization for new users
  static async batchSync(userId: string): Promise<BatchSyncResult> {
    const startTime = new Date();
    
    try {
      console.log(`Starting batch sync for user ${userId}`);

      const syncResult = await this.syncWithGoogle(userId, {
        fullSync: true,
        maxResults: 5000,
        timeMin: new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000), // 2 years ago
        timeMax: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year from now
      });

      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      return {
        userId,
        totalEvents: syncResult.eventsProcessed,
        processedEvents: syncResult.eventsCreated + syncResult.eventsUpdated,
        errors: syncResult.errors || [],
        startTime,
        endTime,
        duration
      };
    } catch (error) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      return {
        userId,
        totalEvents: 0,
        processedEvents: 0,
        errors: [{
          type: CalendarErrorType.SYNC_ERROR,
          message: error instanceof Error ? error.message : 'Batch sync failed'
        }],
        startTime,
        endTime,
        duration
      };
    }
  }
}