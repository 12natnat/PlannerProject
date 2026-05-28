import { z } from 'zod';

export const createItemSchema = z.object({
  itemCode: z.string().min(1, 'Kode item wajib diisi'),
  itemName: z.string().min(1, 'Nama item wajib diisi'),
  unit: z.string().min(1, 'Satuan wajib diisi'),
});

export const updateItemSchema = z.object({
  itemCode: z.string().min(1).optional(),
  itemName: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
