import { z } from 'zod';

export const logTypeSchema = z.enum(['Audit', 'Service', 'CRUD', 'Connection', 'Security', 'UI']);
export const logSeveritySchema = z.enum(['Critical', 'Error', 'Warning', 'Logging', 'Verbose']);

function multiValueFilterSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return undefined;
    const values = Array.isArray(value) ? value : String(value).split(',');
    const normalized = values.map((item) => String(item).trim()).filter(Boolean);
    return normalized.length ? Array.from(new Set(normalized)) : undefined;
  }, z.array(itemSchema).optional());
}

export const appLogQuerySchema = z.object({
  type: multiValueFilterSchema(logTypeSchema),
  severity: multiValueFilterSchema(logSeveritySchema),
  source: z.string().trim().min(1).optional(),
  userName: z.string().trim().min(1).optional(),
  entityGuid: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  search: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0)
});
