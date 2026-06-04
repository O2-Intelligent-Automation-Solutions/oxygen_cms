import { z } from 'zod';

const labelSchema = z.string().trim().min(1).max(64);

export const appLabelsSchema = z.object({
  tenant: labelSchema
});
