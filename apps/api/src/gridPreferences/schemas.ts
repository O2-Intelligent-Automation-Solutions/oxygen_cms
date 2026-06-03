import { z } from 'zod';

const gridKeySchema = z.string().trim().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);

const columnPreferenceSchema = z.object({
  key: z.string().trim().min(1).max(128),
  title: z.string().trim().min(1).max(255),
  visible: z.boolean(),
  order: z.number().int().min(0),
  width: z.union([z.number().positive(), z.string().trim().min(1)]).optional()
});

const sortPreferenceSchema = z.object({
  field: z.string().trim().min(1).max(128),
  dir: z.enum(['asc', 'desc'])
});

const groupPreferenceSchema = z.object({
  field: z.string().trim().min(1).max(128)
}).passthrough();

export const gridPreferenceParamsSchema = z.object({
  gridKey: gridKeySchema
});

export const gridPreferenceInputSchema = z.object({
  columns: z.array(columnPreferenceSchema),
  sort: z.array(sortPreferenceSchema),
  group: z.array(groupPreferenceSchema),
  filter: z.unknown().nullable(),
  filtersVisible: z.boolean()
});
