import { apiClient } from './api';
import { CalendarEvent, CreateEventRequest, ApiResponse } from '../types';

const normalizeEvent = (event: any): CalendarEvent => ({
  id: event.id,
  title: event.title || event.summary || '',
  description: event.description || '',
  location: event.location || '',
  startDate: event.start?.dateTime || event.startDate,
  endDate: event.end?.dateTime || event.endDate,
  attendees: event.attendees || [],
  isAllDay: event.isAllDay ?? false,
  timezone: event.timezone,
  status: event.status,
  source: event.source || 'local',
  createdAt: event.createdAt,
  updatedAt: event.updatedAt,
  lastModified: event.lastModified,
});

export const eventService = {
  getEvents: async (startDate: string, endDate: string): Promise<CalendarEvent[]> => {
    const response = await apiClient.get<ApiResponse<any>>(
      `/api/v1/calendar/events?startDate=${startDate}&endDate=${endDate}`
    );

    const rawEvents = response.data.data.events;

    if (!Array.isArray(rawEvents)) {
      console.error('Expected array at data.events but got:', rawEvents);
      return [];
    }

    return rawEvents.map(normalizeEvent);
  },

  createEvent: async (eventData: CreateEventRequest): Promise<CalendarEvent> => {
    const response = await apiClient.post<ApiResponse<any>>(
      '/api/v1/calendar/events',
      eventData
    );
    return normalizeEvent(response.data.data);
  },

  syncEvents: async (): Promise<{ message: string }> => {
    const response = await apiClient.post<{ message: string }>('/api/v1/calendar/sync');
    return response.data;
  },

  deleteEvent: async (eventId: string): Promise<void> => {
    await apiClient.delete(`/api/v1/calendar/events/${eventId}`);
  },

  updateEvent: async (eventId: string, eventData: Partial<CreateEventRequest>): Promise<CalendarEvent> => {
    const response = await apiClient.put<ApiResponse<CalendarEvent>>(
      `/api/v1/calendar/events/${eventId}`,
      eventData
    );
    return response.data.data;
  },
};