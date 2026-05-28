import { z } from 'zod';

export const createDailyScheduleSchema = z.object({
  date: z.string().or(z.date()),
  shift: z.number().int().min(1).max(3),
  itemCode: z.string().min(1, 'Kode item wajib diisi'),
  quantity: z.number().positive('Jumlah harus lebih dari 0'),
  unit: z.string().min(1, 'Satuan wajib diisi'),
});

export const createWeeklyScheduleSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  weekNumber: z.number().int().min(1).max(26),
  itemCode: z.string().min(1, 'Kode item wajib diisi'),
  quantity: z.number().positive('Jumlah harus lebih dari 0'),
  unit: z.string().min(1, 'Satuan wajib diisi'),
});

export type CreateDailyScheduleInput = z.infer<typeof createDailyScheduleSchema>;
export type CreateWeeklyScheduleInput = z.infer<typeof createWeeklyScheduleSchema>;
