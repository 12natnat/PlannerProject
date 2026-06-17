import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';

export interface DashboardSummary {
  totalItems: number;
  fulfilled: number;
  inProduction: number;
  shortage: number;
}

export interface GapAnalysis {
  itemCode: string;
  itemName: string;
  toyName?: string;
  masterCarton?: string;
  demand: number;
  fgStock: number;
  wip: number;
  gap: number;
  status: 'FULFILLED' | 'IN_PRODUCTION' | 'SHORTAGE';
}

export interface WipStatus {
  itemCode: string;
  itemName: string;
  location: string;
  qty: number;
  progress: number;
}

export interface DashboardData {
  summary: DashboardSummary;
  gapAnalysis: GapAnalysis[];
  wipStatus: WipStatus[];
}

export function useDashboard(date?: string, shift?: string) {
  return useQuery<DashboardData, Error>({
    queryKey: ['dashboard', date, shift],
    queryFn: () => {
      const params = new URLSearchParams();
      if (date) params.append('date', date);
      if (shift) params.append('shift', shift);
      
      const queryString = params.toString() ? `?${params.toString()}` : '';
      return fetchApi<DashboardData>(`/tracking/dashboard${queryString}`);
    },
    // Keep stale time relatively low since this is a live tracking dashboard
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchInterval: 1000 * 60 * 5, // Auto refetch every 5 minutes
  });
}
