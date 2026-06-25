import { z } from 'zod';

export const appLabelsSchema = z.object({
  tenant: z.string().trim().min(1).max(64)
});

export const logRetentionSchema = z.object({
  days: z.coerce.number().int().min(1).max(3650)
});

export const sslCertificateWarningSchema = z.object({
  daysBeforeExpiration: z.coerce.number().int().min(0).max(3650)
});

export const licenseExpirationWarningSchema = z.object({
  daysBeforeExpiration: z.coerce.number().int().min(0).max(3650)
});

const intervalScheduleSchema = z.object({
  type: z.literal('interval'),
  everySeconds: z.coerce.number().int().min(86_400).max(2_592_000)
});

export const queueSchedulesSchema = z.object({
  jobs: z.array(z.object({
    key: z.enum(['database-maintenance:purge-logs', 'database-maintenance:prune-check-history', 'database-maintenance:analyze-tables', 'database-maintenance:optimize-tables', 'system-maintenance:check-application-updates', 'system-maintenance:prune-queue-history']),
    enabled: z.boolean(),
    everySeconds: z.coerce.number().int().min(86_400).max(2_592_000).optional(),
    schedule: intervalScheduleSchema.optional()
  }).refine((job) => job.everySeconds !== undefined || job.schedule !== undefined, { message: 'Either everySeconds or schedule is required.' })).min(1)
});
