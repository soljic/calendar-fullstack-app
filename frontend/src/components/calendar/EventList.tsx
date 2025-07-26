import { CalendarEvent, DateRangeType } from '../../types';
import { groupEventsByDate, formatDate } from '../../utils/dateUtils';
import EventCard from './EventCard';

interface EventListProps {
  events: CalendarEvent[];
  dateRangeType: DateRangeType;
  onDeleteEvent?: (eventId: string) => void;
  isDeleting?: boolean;
}

const EventList = ({
  events,
  dateRangeType,
  onDeleteEvent,
  isDeleting = false,
}: EventListProps) => {
  const groupedEvents = groupEventsByDate(events, dateRangeType);
  const groupKeys = Object.keys(groupedEvents).sort((a, b) => 
    new Date(a).getTime() - new Date(b).getTime()
  );

  if (events.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">No events</h3>
        <p className="mt-1 text-sm text-gray-500">
          No events found for the selected date range.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groupKeys.map((groupKey) => {
        const groupEvents = groupedEvents[groupKey];
        const groupDate = new Date(groupKey);
        
        return (
          <div key={groupKey} className="space-y-3">
            <div className="flex items-center">
              <h3 className="text-lg font-semibold text-gray-900">
                {dateRangeType === '30' 
                  ? `Week of ${formatDate(groupDate)}`
                  : formatDate(groupDate)
                }
              </h3>
              <div className="ml-3 flex-1 border-t border-gray-200"></div>
              <span className="ml-3 text-sm text-gray-500">
                {groupEvents.length} event{groupEvents.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="grid gap-3">
              {groupEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onDelete={onDeleteEvent}
                  isDeleting={isDeleting}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default EventList;