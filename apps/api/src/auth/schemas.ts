import { z } from 'zod';

const tenantIdSchema = z.string().uuid().nullable().optional().transform((value) => value ?? null);
const instanceIdsSchema = z.array(z.string().uuid()).default([]);
const groupInstanceAccessModeSchema = z.enum(['none', 'all', 'specific']).default('none');
const userInstanceAccessModeSchema = z.enum(['inherit', 'none', 'all', 'specific']).default('inherit');

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const bootstrapSchema = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(1),
  password: z.string().min(12)
});

export const createTenantSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional().nullable()
});

export const updateTenantSchema = createTenantSchema;

export const createRoleSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  tenantId: tenantIdSchema
});

export const updateRoleSchema = createRoleSchema;

export const createGroupSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  tenantId: tenantIdSchema,
  instanceAccessMode: groupInstanceAccessModeSchema,
  instanceIds: instanceIdsSchema
});

export const updateGroupSchema = createGroupSchema;

export const createUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(1),
  password: z.string().min(12),
  roleNames: z.array(z.string().trim().min(1)).min(1),
  groupIds: z.array(z.string().uuid()).default([]),
  tenantId: tenantIdSchema,
  instanceAccessMode: userInstanceAccessModeSchema,
  instanceIds: instanceIdsSchema
});

export const updateUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(1),
  password: z.string().min(12).optional().or(z.literal('')).transform((value) => value || undefined),
  roleNames: z.array(z.string().trim().min(1)).min(1),
  groupIds: z.array(z.string().uuid()).default([]),
  tenantId: tenantIdSchema,
  instanceAccessMode: userInstanceAccessModeSchema,
  instanceIds: instanceIdsSchema
});
