import { CalendarEvent, DateRange, DateRangeType } from '../types';

export const getDateRange = (type: DateRangeType): DateRange => {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  switch (type) {
    case '1':
      end.setDate(start.getDate() + 1);
      break;
    case '7':
      end.setDate(start.getDate() + 7);
      break;
    case '30':
      end.setDate(start.getDate() + 30);
      break;
    default:
      end.setDate(start.getDate() + 7);
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

export const formatDate = (date: string | Date): string => {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export const formatTime = (date: string | Date): string => {
  const d = new Date(date);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

export const formatDateTime = (date: string | Date): string => {
  const d = new Date(date);
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

export const getStartTime = (event: any): string | undefined => {
  return event.startDate || event.start?.dateTime;
};

export const getEndTime = (event: any): string | undefined => {
  return event.endDate || event.end?.dateTime;
};

export const groupEventsByDay = (events: CalendarEvent[]) => {
  const grouped: { [key: string]: CalendarEvent[] } = {};

  events.forEach(event => {
    const date = new Date(getStartTime(event)!);
    const dateKey = date.toDateString();

    if (!grouped[dateKey]) {
      grouped[dateKey] = [];
    }
    grouped[dateKey].push(event);
  });

  Object.keys(grouped).forEach(dateKey => {
    grouped[dateKey].sort((a, b) =>
      new Date(getStartTime(a)!).getTime() - new Date(getStartTime(b)!).getTime()
    );
  });

  return grouped;
};

export const groupEventsByWeek = (events: CalendarEvent[]) => {
  const grouped: { [key: string]: CalendarEvent[] } = {};

  events.forEach(event => {
    const date = new Date(getStartTime(event)!);
    const weekStart = getWeekStart(date);
    const weekKey = weekStart.toDateString();

    if (!grouped[weekKey]) {
      grouped[weekKey] = [];
    }
    grouped[weekKey].push(event);
  });

  Object.keys(grouped).forEach(weekKey => {
    grouped[weekKey].sort((a, b) =>
      new Date(getStartTime(a)!).getTime() - new Date(getStartTime(b)!).getTime()
    );
  });

  return grouped;
};

const getWeekStart = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
};

// 🔥 Ovo je glavni dodatak
export const groupEventsByDate = (
  events: CalendarEvent[],
  rangeType: DateRangeType
): { [key: string]: CalendarEvent[] } => {
  if (rangeType === '30') {
    return groupEventsByWeek(events);
  } else {
    return groupEventsByDay(events);
  }
};
