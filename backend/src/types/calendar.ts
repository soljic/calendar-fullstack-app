export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  location?: string;
  attendees?: GoogleCalendarAttendee[];
  status?: 'confirmed' | 'tentative' | 'cancelled';
  created?: string;
  updated?: string;
  etag?: string;
  iCalUID?: string;
  organizer?: {
    email: string;
    displayName?: string;
    self?: boolean;
  };
  creator?: {
    email: string;
    displayName?: string;
    self?: boolean;
  };
}

export interface GoogleCalendarAttendee {
  email: string;
  displayName?: string;
  responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  comment?: string;
  optional?: boolean;
  organizer?: boolean;
  self?: boolean;
}

export interface CalendarEventInput {
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  attendees?: EventAttendeeInput[];
  isAllDay?: boolean;
  timezone?: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
}

export interface EventAttendeeInput {
  email: string;
  displayName?: string;
  optional?: boolean;
}

export interface CalendarEventResponse {
  id: string;
  googleEventId?: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  location?: string;
  attendees?: EventAttendee[];
  isAllDay: boolean;
  timezone: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  source: 'google' | 'manual' | 'imported';
  createdAt: string;
  updatedAt: string;
  lastModified: string;
}

export interface EventAttendee {
  email: string;
  displayName?: string;
  responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  optional?: boolean;
}

export interface CalendarSyncResult {
  success: boolean;
  eventsProcessed: number;
  eventsCreated: number;
  eventsUpdated: number;
  eventsDeleted: number;
  nextSyncToken?: string;
  errors?: CalendarError[];
}

export interface CalendarError {
  type: 'RATE_LIMIT' | 'QUOTA_EXCEEDED' | 'AUTH_ERROR' | 'NETWORK_ERROR' | 'VALIDATION_ERROR' | 'SYNC_ERROR';
  message: string;
  details?: any;
  retryAfter?: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  cursor?: string;
}

export interface EventsQueryParams extends PaginationParams {
  startDate?: string;
  endDate?: string;
  timezone?: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  search?: string;
  source?: 'google' | 'manual' | 'imported' | 'all';
}

export interface EventsResponse {
  events: CalendarEventResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasNext: boolean;
    hasPrev: boolean;
    nextCursor?: string;
  };
}

export interface WebhookData {
  kind: string;
  id: string;
  resourceId: string;
  resourceUri: string;
  token?: string;
  expiration?: string;
}

export interface SyncOptions {
  fullSync?: boolean;
  maxResults?: number;
  timeMin?: Date;
  timeMax?: Date;
}

export interface CalendarListEntry {
  id: string;
  summary: string;
  description?: string;
  timeZone: string;
  primary?: boolean;
  accessRole: 'freeBusyReader' | 'reader' | 'writer' | 'owner';
  backgroundColor?: string;
  foregroundColor?: string;
  selected?: boolean;
}

export interface BatchSyncResult {
  userId: string;
  totalEvents: number;
  processedEvents: number;
  errors: CalendarError[];
  startTime: Date;
  endTime: Date;
  duration: number;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
};

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: Date;
  quotaUser?: string;
}

export enum CalendarErrorType {
  RATE_LIMIT = 'RATE_LIMIT',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  AUTH_ERROR = 'AUTH_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  SYNC_ERROR = 'SYNC_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
}

export enum EventDateRange {
  TODAY = 'today',
  WEEK = 'week',
  MONTH = 'month',
  CUSTOM = 'custom',
}

export interface DateRangeFilter {
  startDate: Date;
  endDate: Date;
  timezone?: string;
}

export interface CalendarServiceMetrics {
  apiCallsCount: number;
  rateLimitHits: number;
  quotaExceededCount: number;
  networkErrors: number;
  authErrors: number;
  lastApiCall?: Date;
  averageResponseTime: number;
}