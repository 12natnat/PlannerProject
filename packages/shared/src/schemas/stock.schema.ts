import { z } from 'zod';

export const createFGStockSchema = z.object({
  itemCode: z.string().min(1, 'Kode item wajib diisi'),
  quantity: z.number().nonnegative('Jumlah tidak boleh negatif'),
  unit: z.string().min(1, 'Satuan wajib diisi'),
  date: z.string().or(z.date()),
  shift: z.number().int().min(1).max(3).optional(),
  notes: z.string().optional(),
});

export const createWIPSchema = z.object({
  itemCode: z.string().min(1, 'Kode item wajib diisi'),
  location: z.string().min(1, 'Lokasi WIP wajib diisi'),
  quantity: z.number().positive('Jumlah harus lebih dari 0'),
  unit: z.string().min(1, 'Satuan wajib diisi'),
  progressPercent: z.number().min(0).max(100),
  date: z.string().or(z.date()),
  shift: z.number().int().min(1).max(3),
  estimatedFinish: z.string().or(z.date()),
  status: z.enum(['IN_PROGRESS', 'ON_HOLD', 'DELAYED', 'COMPLETED']),
  notes: z.string().optional(),
});

export const updateWIPSchema = createWIPSchema.partial();

export type CreateFGStockInput = z.infer<typeof createFGStockSchema>;
export type CreateWIPInput = z.infer<typeof createWIPSchema>;
export type UpdateWIPInput = z.infer<typeof updateWIPSchema>;
