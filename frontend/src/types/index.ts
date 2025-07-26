export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

// Ovo je ujednačeni model koji može prikazati i lokalni i Google event
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  startDate: string; // ISO string
  endDate: string;
  attendees: string[];
  isAllDay: boolean;
  timezone?: string;
  status?: string;
  source: 'google' | 'local';
  createdAt?: string;
  updatedAt?: string;
  lastModified?: string;
}


export interface CreateEventRequest {
  title: string;
  startDate: string;
  endDate: string;
  description?: string;
  location?: string;
  attendees?: string[];
  isAllDay?: boolean;
  timezone?: string;
  status?: string;
}

export interface EventFormData {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  description: string;
  location: string;
}




export interface DateRange {
  start: Date;
  end: Date;
}

export type DateRangeType = '1' | '7' | '30';

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
  isAuthenticated: boolean;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}