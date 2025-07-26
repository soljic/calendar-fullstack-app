export const DATE_RANGE_OPTIONS = [
  { value: '1' as const, label: '1 Day' },
  { value: '7' as const, label: '7 Days' },
  { value: '30' as const, label: '30 Days' },
];

export const DEFAULT_DATE_RANGE = '7' as const;

export const API_ENDPOINTS = {
  AUTH: {
    GOOGLE: '/api/v1/auth/google',
    CALLBACK: '/api/v1/auth/callback',
    USER: '/api/v1/auth/user',
    LOGOUT: '/api/v1/auth/logout',
    REFRESH: '/api/v1/auth/refresh',
  },
  CALENDAR: {
    EVENTS: '/api/v1/calendar/events',
    SYNC: '/api/v1/calendar/sync',
  },
};

export const STORAGE_KEYS = {
  AUTH_TOKENS: 'auth_tokens',
  USER: 'user',
};

export const QUERY_KEYS = {
  EVENTS: 'events',
  USER: 'user',
};

export const ERROR_MESSAGES = {
  AUTH_FAILED: 'Authentication failed. Please try again.',
  NETWORK_ERROR: 'Network error. Please check your connection.',
  GENERIC_ERROR: 'Something went wrong. Please try again.',
  EVENTS_LOAD_ERROR: 'Failed to load events. Please try again.',
  EVENT_CREATE_ERROR: 'Failed to create event. Please try again.',
  EVENT_DELETE_ERROR: 'Failed to delete event. Please try again.',
  SYNC_ERROR: 'Failed to sync events. Please try again.',
};