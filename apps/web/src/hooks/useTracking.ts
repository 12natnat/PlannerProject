import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';

export interface WipDetail {
  wip_id: string;
  location: string;
  qty: number;
  progress_pct: number;
  shift: number;
  date: string;
  status: string;
}

export interface TrackingData {
  item_code: string;
  item_name: string;
  date: string;
  demand: number;
  fg_stock: number;
  in_production: number;
  total_supply: number;
  gap: number;
  status: 'FULFILLED' | 'IN_PRODUCTION' | 'SHORTAGE';
  wip_details: WipDetail[];
}

export function useTracking(itemCode?: string, date?: string, shift?: string) {
  return useQuery<TrackingData, Error>({
    queryKey: ['tracking', itemCode, date, shift],
    queryFn: () => {
      if (!itemCode || !date) {
        return Promise.reject(new Error('Item code and date are required'));
      }
      const params = new URLSearchParams();
      params.append('item_code', itemCode);
      params.append('date', date);
      if (shift) params.append('shift', shift);
      
      return fetchApi<TrackingData>(`/tracking/daily?${params.toString()}`);
    },
    enabled: !!itemCode && !!date,
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}
