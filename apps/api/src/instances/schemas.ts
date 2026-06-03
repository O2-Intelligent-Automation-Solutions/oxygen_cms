import { z } from 'zod';

const optionalText = z.string().trim().optional().nullable().transform((value) => value || null);
const optionalTenantId = z.string().uuid().optional().nullable().transform((value) => value || null);
const protocolSchema = z.enum(['http', 'https']).optional().default('https');
const portSchema = z.coerce.number().int().min(1).max(65535).optional().nullable().transform((value) => value ?? null);

export const createInstanceSchema = z.object({
  name: z.string().trim().min(1),
  description: optionalText,
  tenantId: optionalTenantId,
  protocol: protocolSchema,
  host: z.string().trim().min(1).optional(),
  port: portSchema,
  hostname: z.string().trim().min(1).optional(),
  username: z.string().trim().min(1),
  password: z.string().min(1),
  groupId: z.string().uuid(),
  pollingIntervalSeconds: z.coerce.number().int().min(60).max(86400).optional().default(300),
  isEnabled: z.boolean().optional().default(true)
}).refine((value) => Boolean(value.host || value.hostname), { message: 'Host or URL is required.', path: ['host'] });

export const updateInstanceSchema = z.object({
  name: z.string().trim().min(1),
  description: optionalText,
  tenantId: optionalTenantId,
  protocol: protocolSchema,
  host: z.string().trim().min(1).optional(),
  port: portSchema,
  hostname: z.string().trim().min(1).optional(),
  username: z.string().trim().min(1),
  password: z.string().min(1).optional().or(z.literal('')).transform((value) => value || undefined),
  groupId: z.string().uuid(),
  pollingIntervalSeconds: z.coerce.number().int().min(60).max(86400).optional().default(300),
  isEnabled: z.boolean().optional().default(true)
}).refine((value) => Boolean(value.host || value.hostname), { message: 'Host or URL is required.', path: ['host'] });
