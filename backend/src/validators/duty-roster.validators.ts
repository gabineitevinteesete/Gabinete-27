import { z } from 'zod';

export const mesQuerySchema = z.object({
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
});

export const dataParamsSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const substituirDiaSchema = z.object({
  atribuicoes: z.array(
    z.object({
      userId: z.string().uuid(),
      local: z.enum(['GABINETE', 'RUA']),
    }),
  ),
});
