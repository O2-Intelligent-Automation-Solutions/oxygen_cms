import { z } from 'zod';
import { ROLE_NAMES } from './types.js';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const bootstrapSchema = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(1),
  password: z.string().min(12)
});

export const createGroupSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional().nullable()
});

export const createUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(1),
  password: z.string().min(12),
  roleNames: z.array(z.enum(ROLE_NAMES)).min(1),
  groupIds: z.array(z.string().uuid()).default([])
});
