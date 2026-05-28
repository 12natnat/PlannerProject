import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';

export interface WeeklyScheduleRecord {
  itemId: string;
  itemCode: string;
  itemName: string;
  total: number;
  weeks: Record<
    number,
    {
      id: string;
      quantity: number;
      weekStartDate: string;
      weekEndDate: string;
    }
  >;
}

export function useWeeklyScheduleSummary(year?: number) {
  return useQuery<{ data: WeeklyScheduleRecord[]; year: number }, Error>({
    queryKey: ['weeklySchedule', 'summary', year],
    queryFn: () => {
      const params = year ? `?year=${year}` : '';
      return fetchApi(`/weekly-schedule/summary${params}`);
    },
    staleTime: 1000 * 60,
  });
}

export function useBulkUpsertWeeklySchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      records: Array<{
        year: number;
        weekNumber: number;
        weekStartDate?: string;
        weekEndDate?: string;
        itemCode: string;
        toyName?: string;
        quantity: number;
      }>;
      saveMode: 'overwrite' | 'add';
    }) =>
      fetchApi('/weekly-schedule/bulk', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weeklySchedule'] });
    },
  });
}

export function useDeleteWeeklySchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchApi(`/weekly-schedule/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weeklySchedule'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateWeeklySchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; quantity: number; weekStartDate?: string; weekEndDate?: string }) =>
      fetchApi(`/weekly-schedule/${data.id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weeklySchedule'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpsertWeeklySchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      year: number;
      weekNumber: number;
      weekStartDate?: string;
      weekEndDate?: string;
      itemId?: string;
      itemCode?: string;
      toyName?: string;
      quantity: number;
      saveMode?: 'overwrite' | 'add';
    }) =>
      fetchApi('/weekly-schedule', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weeklySchedule'] });
    },
  });
}
