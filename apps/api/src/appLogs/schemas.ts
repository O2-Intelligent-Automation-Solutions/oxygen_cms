import { z } from 'zod';

export const logTypeSchema = z.enum(['Audit', 'Service', 'CRUD', 'Connection', 'Security', 'UI']);
export const logSeveritySchema = z.enum(['Critical', 'Error', 'Warning', 'Logging', 'Verbose']);

export const appLogQuerySchema = z.object({
  type: logTypeSchema.optional(),
  severity: logSeveritySchema.optional(),
  source: z.string().trim().min(1).optional(),
  userName: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0)
});
