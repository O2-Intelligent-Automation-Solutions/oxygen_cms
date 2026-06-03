import { z } from 'zod';

export const createInstanceSchema = z.object({
  name: z.string().trim().min(1),
  hostname: z.string().trim().min(1),
  username: z.string().trim().min(1),
  password: z.string().min(1),
  groupId: z.string().uuid(),
  pollingIntervalSeconds: z.number().int().min(60).max(86400).optional().default(300),
  isEnabled: z.boolean().optional().default(true)
});

export const updateInstanceSchema = z.object({
  name: z.string().trim().min(1),
  hostname: z.string().trim().min(1),
  username: z.string().trim().min(1),
  password: z.string().min(1).optional().or(z.literal('')).transform((value) => value || undefined),
  groupId: z.string().uuid(),
  pollingIntervalSeconds: z.number().int().min(60).max(86400).optional().default(300),
  isEnabled: z.boolean().optional().default(true)
});
