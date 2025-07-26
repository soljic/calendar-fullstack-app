import { CalendarEvent } from '../../types';
import { formatTime, formatDateTime, getStartTime, getEndTime } from '../../utils/dateUtils';

interface EventCardProps {
  event: CalendarEvent;
  onDelete?: (eventId: string) => void;
  isDeleting?: boolean;
}

const EventCard = ({ event, onDelete, isDeleting = false }: EventCardProps) => {
  const startTime = formatTime(getStartTime(event)!);
  const endTime = formatTime(getEndTime(event)!);
  const fullDateTime = formatDateTime(getStartTime(event)!);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 text-sm mb-1">
            {event.title}
          </h3>
          {event.description && (
            <p className="text-gray-600 text-xs mb-2 line-clamp-2">
              {event.description}
            </p>
          )}
          <div className="flex items-center space-x-4 text-xs text-gray-500">
            <span className="flex items-center">
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {startTime} - {endTime}
            </span>
            <span className="flex items-center">
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {fullDateTime}
            </span>
          </div>
        </div>
        {onDelete && (
          <button
            onClick={() => onDelete(event.id)}
            disabled={isDeleting}
            className="ml-2 p-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
            title="Delete event"
          >
            {isDeleting ? (
              <div className="w-4 h-4 border-2 border-red-300 border-t-red-500 rounded-full animate-spin"></div>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default EventCard;
