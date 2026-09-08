import { z } from 'zod';

export const produtividadeQuerySchema = z.object({
  mes: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});
