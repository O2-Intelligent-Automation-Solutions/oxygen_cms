import { z } from 'zod';

export const appLabelsSchema = z.object({
  tenant: z.string().trim().min(1).max(64)
});

export const logRetentionSchema = z.object({
  days: z.coerce.number().int().min(1).max(3650)
});
