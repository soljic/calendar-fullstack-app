import { Request, Response, NextFunction } from 'express';
import { CalendarService } from '../services/calendarService';
import { sendSuccess, sendCreated } from '../utils/response';
import { 
  BadRequestError, 
  UnauthorizedError, 
  NotFoundError,
  InternalServerError 
} from '../middleware/errorHandler';
import { User } from '../types';
import { 
  CalendarEventInput,
  EventsQueryParams,
  EventDateRange,
  SyncOptions,
  WebhookData
} from '../types/calendar';

export class CalendarController {
  /**
   * Get events for the authenticated user
   * GET /calendar/events
   */
  static async getEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user as User;
      
      if (!user) {
        return next(new UnauthorizedError('Authentication required'));
      }

      const params: EventsQueryParams = {
        page: parseInt(req.query.page as string) || 1,
        limit: Math.min(parseInt(req.query.limit as string) || 50, 100), 
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        timezone: req.query.timezone as string || 'UTC',
        status: req.query.status as 'confirmed' | 'tentative' | 'cancelled',
        search: req.query.search as string,
        source: req.query.source as 'google' | 'manual' | 'imported' | 'all'
      };

      if (params.startDate && isNaN(Date.parse(params.startDate))) {
        return next(new BadRequestError('Invalid startDate format'));
      }

      if (params.endDate && isNaN(Date.parse(params.endDate))) {
        return next(new BadRequestError('Invalid endDate format'));
      }

      const result = await CalendarService.getEvents(user.id, params);

      sendSuccess(res, result);
    } catch (error) {
      console.error('Failed to get events:', error);
      next(error);
    }
  }

  /**
   * Get events by date range
   * GET /calendar/events/range/:range
   */
  static async getEventsByRange(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user as User;
      
      if (!user) {
        return next(new UnauthorizedError('Authentication required'));
      }

      const range = req.params.range as EventDateRange;
      const timezone = req.query.timezone as string || 'UTC';

      if (!Object.values(EventDateRange).includes(range)) {
        return next(new BadRequestError('Invalid date range. Valid options: today, week, month, custom'));
      }

      let customRange: { startDate: Date; endDate: Date } | undefined;

      if (range === EventDateRange.CUSTOM) {
        const startDate = req.query.startDate as string;
        const endDate = req.query.endDate as string;

        if (!startDate || !endDate) {
          return next(new BadRequestError('Custom range requires startDate and endDate query parameters'));
        }

        if (isNaN(Date.parse(startDate)) || isNaN(Date.parse(endDate))) {
          return next(new BadRequestError('Invalid date format for custom range'));
        }

        customRange = {
          startDate: new Date(startDate),
          endDate: new Date(endDate)
        };
      }

      const events = await CalendarService.getEventsByDateRange(user.id, range, customRange, timezone);

      sendSuccess(res, { events, range, timezone });
    } catch (error) {
      console.error('Failed to get events by range:', error);
      next(error);
    }
  }

  /**
   * Create a new event
   * POST /calendar/events
   */
  static async createEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user as User;
      
      if (!user) {
        return next(new UnauthorizedError('Authentication required'));
      }

      const eventData: CalendarEventInput = {
        title: req.body.title,
        description: req.body.description,
        startDate: new Date(req.body.startDate),
        endDate: new Date(req.body.endDate),
        location: req.body.location,
        attendees: req.body.attendees,
        isAllDay: req.body.isAllDay,
        timezone: req.body.timezone,
        status: req.body.status
      };

      if (!eventData.title || !eventData.startDate || !eventData.endDate) {
        return next(new BadRequestError('Title, startDate, and endDate are required'));
      }

      const createdEvent = await CalendarService.createEvent(user.id, eventData);

      sendCreated(res, createdEvent, 'Event created successfully');
    } catch (error) {
      console.error('Failed to create event:', error);
      next(error);
    }
  }

  /**
   * Update an existing event
   * PUT /calendar/events/:eventId
   */
  static async updateEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user as User;
      
      if (!user) {
        return next(new UnauthorizedError('Authentication required'));
      }

      const eventId = req.params.eventId;
      
      if (!eventId) {
        return next(new BadRequestError('Event ID is required'));
      }

      const eventData: Partial<CalendarEventInput> = {};

      if (req.body.title !== undefined) eventData.title = req.body.title;
      if (req.body.description !== undefined) eventData.description = req.body.description;
      if (req.body.startDate !== undefined) eventData.startDate = new Date(req.body.startDate);
      if (req.body.endDate !== undefined) eventData.endDate = new Date(req.body.endDate);
      if (req.body.location !== undefined) eventData.location = req.body.location;
      if (req.body.attendees !== undefined) eventData.attendees = req.body.attendees;
      if (req.body.isAllDay !== undefined) eventData.isAllDay = req.body.isAllDay;
      if (req.body.timezone !== undefined) eventData.timezone = req.body.timezone;
      if (req.body.status !== undefined) eventData.status = req.body.status;

      if (eventData.startDate && isNaN(eventData.startDate.getTime())) {
        return next(new BadRequestError('Invalid startDate format'));
      }

      if (eventData.endDate && isNaN(eventData.endDate.getTime())) {
        return next(new BadRequestError('Invalid endDate format'));
      }

      const updatedEvent = await CalendarService.updateEvent(user.id, eventId, eventData);

      sendSuccess(res, updatedEvent, 'Event updated successfully');
    } catch (error) {
      console.error('Failed to update event:', error);
      next(error);
    }
  }

  /**
   * Delete an event
   * DELETE /calendar/events/:eventId
   */
  static async deleteEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user as User;
      
      if (!user) {
        return next(new UnauthorizedError('Authentication required'));
      }

      const eventId = req.params.eventId;
      
      if (!eventId) {
        return next(new BadRequestError('Event ID is required'));
      }

      await CalendarService.deleteEvent(user.id, eventId);

      sendSuccess(res, null, 'Event deleted successfully');
    } catch (error) {
      console.error('Failed to delete event:', error);
      next(error);
    }
  }

  /**
   * Synchronize with Google Calendar
   * POST /calendar/sync
   */
  static async syncCalendar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user as User;
      
      if (!user) {
        return next(new UnauthorizedError('Authentication required'));
      }

      const options: SyncOptions = {
        fullSync: req.body.fullSync === true,
        maxResults: Math.min(req.body.maxResults || 2500, 2500),
        timeMin: req.body.timeMin ? new Date(req.body.timeMin) : undefined,
        timeMax: req.body.timeMax ? new Date(req.body.timeMax) : undefined
      };

      if (options.timeMin && isNaN(options.timeMin.getTime())) {
        return next(new BadRequestError('Invalid timeMin format'));
      }

      if (options.timeMax && isNaN(options.timeMax.getTime())) {
        return next(new BadRequestError('Invalid timeMax format'));
      }

      const result = await CalendarService.syncWithGoogle(user.id, options);

      sendSuccess(res, result, 'Calendar synchronization completed');
    } catch (error) {
      console.error('Failed to sync calendar:', error);
      next(error);
    }
  }

  /**
   * Perform batch synchronization (for new users)
   * POST /calendar/batch-sync
   */
  static async batchSync(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user as User;
      
      if (!user) {
        return next(new UnauthorizedError('Authentication required'));
      }

      const result = await CalendarService.batchSync(user.id);

      sendSuccess(res, result, 'Batch synchronization completed');
    } catch (error) {
      console.error('Failed to perform batch sync:', error);
      next(error);
    }
  }

  /**
   * Handle Google Calendar webhook
   * POST /calendar/webhook
   */
  static async handleWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const resourceState = req.headers['x-goog-resource-state'] as string;
      const resourceId = req.headers['x-goog-resource-id'] as string;
      const resourceUri = req.headers['x-goog-resource-uri'] as string;
      const channelId = req.headers['x-goog-channel-id'] as string;
      const channelToken = req.headers['x-goog-channel-token'] as string;

      if (!resourceState || !resourceId || !resourceUri) {
        return next(new BadRequestError('Invalid webhook data'));
      }

      const webhookData: WebhookData = {
        kind: 'api#channel',
        id: channelId || '',
        resourceId,
        resourceUri,
        token: channelToken
      };

      if (resourceState === 'sync' || resourceState === 'exists') {
        await CalendarService.handleWebhook(webhookData);
      }

      res.status(200).send('OK');
    } catch (error) {
      console.error('Failed to handle webhook:', error);
      res.status(200).send('OK');
    }
  }

  /**
   * Get Calendar service metrics
   * GET /calendar/metrics
   */
  static async getMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user as User;
      
      if (!user) {
        return next(new UnauthorizedError('Authentication required'));
      }

      const metrics = CalendarService.getMetrics();

      sendSuccess(res, metrics);
    } catch (error) {
      console.error('Failed to get metrics:', error);
      next(error);
    }
  }

  /**
   * Reset Calendar service metrics
   * POST /calendar/metrics/reset
   */
  static async resetMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user as User;
      
      if (!user) {
        return next(new UnauthorizedError('Authentication required'));
      }

      CalendarService.resetMetrics();

      sendSuccess(res, null, 'Metrics reset successfully');
    } catch (error) {
      console.error('Failed to reset metrics:', error);
      next(error);
    }
  }

  /**
   * Search events
   * GET /calendar/search
   */
  static async searchEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user as User;
      
      if (!user) {
        return next(new UnauthorizedError('Authentication required'));
      }

      const searchTerm = req.query.q as string;
      
      if (!searchTerm || searchTerm.trim().length === 0) {
        return next(new BadRequestError('Search term is required'));
      }

      if (searchTerm.length < 2) {
        return next(new BadRequestError('Search term must be at least 2 characters'));
      }

      const params: EventsQueryParams = {
        search: searchTerm.trim(),
        page: parseInt(req.query.page as string) || 1,
        limit: Math.min(parseInt(req.query.limit as string) || 50, 100),
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        status: req.query.status as 'confirmed' | 'tentative' | 'cancelled',
        source: req.query.source as 'google' | 'manual' | 'imported' | 'all'
      };

      const result = await CalendarService.getEvents(user.id, params);

      sendSuccess(res, {
        ...result,
        searchTerm
      });
    } catch (error) {
      console.error('Failed to search events:', error);
      next(error);
    }
  }

  /**
   * Get a specific event by ID
   * GET /calendar/events/:eventId
   */
  static async getEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user as User;
      
      if (!user) {
        return next(new UnauthorizedError('Authentication required'));
      }

      const eventId = req.params.eventId;
      
      if (!eventId) {
        return next(new BadRequestError('Event ID is required'));
      }

      const result = await CalendarService.getEvents(user.id, { limit: 1 });
      
      const event = result.events.find(e => e.id === eventId);
      
      if (!event) {
        return next(new NotFoundError('Event not found'));
      }

      sendSuccess(res, event);
    } catch (error) {
      console.error('Failed to get event:', error);
      next(error);
    }
  }
}