import { useState } from 'react';
import { DateRangeType } from '../../types';
import { getDateRange } from '../../utils/dateUtils';
import { DEFAULT_DATE_RANGE } from '../../utils/constants';
import { useEvents } from '../../hooks/useEvents';
import DateRangeSelector from './DateRangeSelector';
import EventList from './EventList';
import AddEventForm from './AddEventForm';

const Dashboard = () => {
  const [selectedRange, setSelectedRange] = useState<DateRangeType>(DEFAULT_DATE_RANGE);
  const [showAddForm, setShowAddForm] = useState(false);
  
  const dateRange = getDateRange(selectedRange);
  const {
    events,
    isLoading,
    error,
    refetch,
    createEvent,
    isCreating,
    createError,
    syncEvents,
    isSyncing,
    syncError,
    deleteEvent,
    isDeleting,
    deleteError,
  } = useEvents(dateRange);

  const handleRangeChange = (range: DateRangeType) => {
    setSelectedRange(range);
  };

  const handleRefresh = () => {
    refetch();
  };

  const handleSync = () => {
    syncEvents();
  };

  const handleCreateEvent = (eventData: any) => {
    createEvent(eventData, {
      onSuccess: () => {
        setShowAddForm(false);
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-500 mb-4">
          <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Error loading events</h3>
        <p className="text-gray-500 mb-4">
          {error instanceof Error ? error.message : 'Failed to load events'}
        </p>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calendar Events</h1>
          <p className="text-gray-600">
            Manage your Google Calendar events
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="px-3 py-2 text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-50"
            title="Refresh events"
          >
            <svg className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
          >
            {isSyncing ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            <span>Sync</span>
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Add Event</span>
          </button>
        </div>
      </div>

      {/* Error Messages */}
      {(createError || syncError || deleteError) && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <p className="text-sm text-red-700">
                {createError?.message || syncError?.message || deleteError?.message}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Add Event Form */}
      {showAddForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <AddEventForm
            onSubmit={handleCreateEvent}
            onCancel={() => setShowAddForm(false)}
            isSubmitting={isCreating}
          />
        </div>
      )}

      {/* Date Range Selector */}
      <div className="flex justify-center">
        <DateRangeSelector
          selectedRange={selectedRange}
          onRangeChange={handleRangeChange}
        />
      </div>

      {/* Events List */}
      <EventList
        events={events}
        dateRangeType={selectedRange}
        onDeleteEvent={deleteEvent}
        isDeleting={isDeleting}
      />
    </div>
  );
};

export default Dashboard;