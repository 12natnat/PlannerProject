import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';

export interface Item {
  id: string;
  itemCode: string;
  itemName: string;
  unit: string;
  createdAt: string;
}

export function useItems() {
  return useQuery<{ data: Item[] }, Error>({
    queryKey: ['items'],
    queryFn: () => fetchApi('/items'),
  });
}

export function useCreateItem() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (newItem: { itemCode: string; itemName: string; unit: string }) => 
      fetchApi('/items', {
        method: 'POST',
        body: JSON.stringify(newItem),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useDeleteItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      fetchApi(`/items/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}

export function useUpdateItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, itemCode, itemName, unit }: { id: string; itemCode: string; itemName: string; unit: string }) => 
      fetchApi(`/items/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ itemCode, itemName, unit }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}
