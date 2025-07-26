import { Router } from 'express';
import Joi from 'joi';
import rateLimit from 'express-rate-limit';
import { CalendarController } from '../controllers/calendarController';
import { 
  authenticateToken, 
  requireCalendarAccess,
  autoRefreshTokens
} from '../middleware/auth';
import { validateRequest } from '../middleware/validation';

const router = Router();

const calendarRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100, 
  message: {
    success: false,
    error: {
      type: 'https://httpstatuses.com/429',
      title: 'Too Many Requests',
      status: 429,
      detail: 'Too many calendar requests, please try again later',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const syncRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, 
  max: 5, 
  message: {
    success: false,
    error: {
      type: 'https://httpstatuses.com/429',
      title: 'Too Many Requests',
      status: 429,
      detail: 'Too many sync requests, please try again later',
    },
  },
});

// Validation schemas
const eventCreateSchema = {
  body: Joi.object({
    title: Joi.string().min(1).max(500).required(),
    description: Joi.string().max(5000).optional().allow(''),
    startDate: Joi.date().iso().required(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
    location: Joi.string().max(1000).optional().allow(''),
    attendees: Joi.array().items(
      Joi.object({
        email: Joi.string().email().required(),
        displayName: Joi.string().max(255).optional(),
        optional: Joi.boolean().optional()
      })
    ).max(100).optional(),
    isAllDay: Joi.boolean().optional(),
    timezone: Joi.string().max(100).optional(),
    status: Joi.string().valid('confirmed', 'tentative', 'cancelled').optional()
  })
};

const eventUpdateSchema = {
  body: Joi.object({
    title: Joi.string().min(1).max(500).optional(),
    description: Joi.string().max(5000).optional().allow(''),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    location: Joi.string().max(1000).optional().allow(''),
    attendees: Joi.array().items(
      Joi.object({
        email: Joi.string().email().required(),
        displayName: Joi.string().max(255).optional(),
        optional: Joi.boolean().optional()
      })
    ).max(100).optional(),
    isAllDay: Joi.boolean().optional(),
    timezone: Joi.string().max(100).optional(),
    status: Joi.string().valid('confirmed', 'tentative', 'cancelled').optional()
  }).min(1), // At least one field must be provided
  params: Joi.object({
    eventId: Joi.string().uuid().required()
  })
};

const eventParamsSchema = {
  params: Joi.object({
    eventId: Joi.string().uuid().required()
  })
};

const eventsQuerySchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).max(1000).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    timezone: Joi.string().max(100).optional(),
    status: Joi.string().valid('confirmed', 'tentative', 'cancelled').optional(),
    search: Joi.string().min(1).max(500).optional(),
    source: Joi.string().valid('google', 'manual', 'imported', 'all').optional()
  })
};

const rangeParamsSchema = {
  params: Joi.object({
    range: Joi.string().valid('today', 'week', 'month', 'custom').required()
  }),
  query: Joi.object({
    timezone: Joi.string().max(100).optional(),
    startDate: Joi.when('$params.range', {
      is: 'custom',
      then: Joi.date().iso().required(),
      otherwise: Joi.forbidden()
    }),
    endDate: Joi.when('$params.range', {
      is: 'custom',
      then: Joi.date().iso().min(Joi.ref('startDate')).required(),
      otherwise: Joi.forbidden()
    })
  })
};

const syncSchema = {
  body: Joi.object({
    fullSync: Joi.boolean().optional(),
    maxResults: Joi.number().integer().min(1).max(2500).optional(),
    timeMin: Joi.date().iso().optional(),
    timeMax: Joi.date().iso().optional()
  })
};

const searchQuerySchema = {
  query: Joi.object({
    q: Joi.string().min(2).max(500).required(),
    page: Joi.number().integer().min(1).max(1000).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    status: Joi.string().valid('confirmed', 'tentative', 'cancelled').optional(),
    source: Joi.string().valid('google', 'manual', 'imported', 'all').optional()
  })
};

router.use(authenticateToken);
router.use(requireCalendarAccess);
router.use(autoRefreshTokens);

/**
 * @route   GET /calendar/events
 * @desc    Get events for the authenticated user with pagination and filtering
 * @access  Private (requires calendar access)
 */
router.get(
  '/events',
  calendarRateLimit,
  validateRequest(eventsQuerySchema),
  CalendarController.getEvents
);

/**
 * @route   GET /calendar/events/range/:range
 * @desc    Get events by date range (today, week, month, custom)
 * @access  Private (requires calendar access)
 */
router.get(
  '/events/range/:range',
  calendarRateLimit,
  validateRequest(rangeParamsSchema),
  CalendarController.getEventsByRange
);

/**
 * @route   GET /calendar/events/:eventId
 * @desc    Get a specific event by ID
 * @access  Private (requires calendar access)
 */
router.get(
  '/events/:eventId',
  calendarRateLimit,
  validateRequest(eventParamsSchema),
  CalendarController.getEvent
);

/**
 * @route   POST /calendar/events
 * @desc    Create a new event in both local DB and Google Calendar
 * @access  Private (requires calendar access)
 */
router.post(
  '/events',
  calendarRateLimit,
  validateRequest(eventCreateSchema),
  CalendarController.createEvent
);

/**
 * @route   PUT /calendar/events/:eventId
 * @desc    Update an existing event in both local DB and Google Calendar
 * @access  Private (requires calendar access)
 */
router.put(
  '/events/:eventId',
  calendarRateLimit,
  validateRequest(eventUpdateSchema),
  CalendarController.updateEvent
);

/**
 * @route   DELETE /calendar/events/:eventId
 * @desc    Delete an event from both local DB and Google Calendar
 * @access  Private (requires calendar access)
 */
router.delete(
  '/events/:eventId',
  calendarRateLimit,
  validateRequest(eventParamsSchema),
  CalendarController.deleteEvent
);

/**
 * @route   GET /calendar/search
 * @desc    Search events by title and description
 * @access  Private (requires calendar access)
 */
router.get(
  '/search',
  calendarRateLimit,
  validateRequest(searchQuerySchema),
  CalendarController.searchEvents
);

/**
 * @route   POST /calendar/sync
 * @desc    Synchronize with Google Calendar (incremental or full sync)
 * @access  Private (requires calendar access)
 */
router.post(
  '/sync',
  syncRateLimit,
  validateRequest(syncSchema),
  CalendarController.syncCalendar
);

/**
 * @route   POST /calendar/batch-sync
 * @desc    Perform batch synchronization for new users
 * @access  Private (requires calendar access)
 */
router.post(
  '/batch-sync',
  syncRateLimit,
  CalendarController.batchSync
);

/**
 * @route   POST /calendar/webhook
 * @desc    Handle Google Calendar webhook notifications
 * @access  Public (webhook from Google)
 * @note    This endpoint bypasses authentication as it's called by Google
 */
router.post(
  '/webhook',
  CalendarController.handleWebhook
);

/**
 * @route   GET /calendar/metrics
 * @desc    Get Calendar service performance metrics
 * @access  Private (requires calendar access)
 */
router.get(
  '/metrics',
  calendarRateLimit,
  CalendarController.getMetrics
);

/**
 * @route   POST /calendar/metrics/reset
 * @desc    Reset Calendar service metrics
 * @access  Private (requires calendar access)
 */
router.post(
  '/metrics/reset',
  calendarRateLimit,
  CalendarController.resetMetrics
);

// Create a separate router for webhook that doesn't require authentication
export const webhookRouter = Router();

webhookRouter.post(
  '/webhook',
  CalendarController.handleWebhook
);

export default router;