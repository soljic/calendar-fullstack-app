import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { eventService } from '../services/eventService';
import { CalendarEvent, CreateEventRequest, DateRange } from '../types';

export const useEvents = (dateRange: DateRange) => {
  const queryClient = useQueryClient();

  const eventsQuery = useQuery({
    queryKey: ['events', dateRange.start.toISOString(), dateRange.end.toISOString()],
    queryFn: () => eventService.getEvents(
      dateRange.start.toISOString(),
      dateRange.end.toISOString()
    ),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const createEventMutation = useMutation({
    mutationFn: (eventData: CreateEventRequest) => eventService.createEvent(eventData),
    onSuccess: (newEvent) => {
      queryClient.setQueryData<CalendarEvent[]>(
        ['events', dateRange.start.toISOString(), dateRange.end.toISOString()],
        (oldData) => Array.isArray(oldData) ? [...oldData, newEvent] : [newEvent]
      );
    },
  });

  const syncEventsMutation = useMutation({
    mutationFn: () => eventService.syncEvents(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: (eventId: string) => eventService.deleteEvent(eventId),
    onSuccess: (_, deletedEventId) => {
      queryClient.setQueryData<CalendarEvent[]>(
        ['events', dateRange.start.toISOString(), dateRange.end.toISOString()],
        (oldData) => oldData ? oldData.filter(event => event.id !== deletedEventId) : []
      );
    },
  });

  const updateEventMutation = useMutation({
    mutationFn: ({ eventId, eventData }: { eventId: string; eventData: Partial<CreateEventRequest> }) =>
      eventService.updateEvent(eventId, eventData),
    onSuccess: (updatedEvent) => {
      queryClient.setQueryData<CalendarEvent[]>(
        ['events', dateRange.start.toISOString(), dateRange.end.toISOString()],
        (oldData) => oldData 
          ? oldData.map(event => event.id === updatedEvent.id ? updatedEvent : event)
          : [updatedEvent]
      );
    },
  });

  return {
    events: eventsQuery.data || [],
    isLoading: eventsQuery.isLoading,
    error: eventsQuery.error,
    refetch: eventsQuery.refetch,
    createEvent: createEventMutation.mutate,
    isCreating: createEventMutation.isPending,
    createError: createEventMutation.error,
    syncEvents: syncEventsMutation.mutate,
    isSyncing: syncEventsMutation.isPending,
    syncError: syncEventsMutation.error,
    deleteEvent: deleteEventMutation.mutate,
    isDeleting: deleteEventMutation.isPending,
    deleteError: deleteEventMutation.error,
    updateEvent: updateEventMutation.mutate,
    isUpdating: updateEventMutation.isPending,
    updateError: updateEventMutation.error,
  };
};