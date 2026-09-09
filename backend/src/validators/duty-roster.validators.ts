import { z } from 'zod';

export const mesQuerySchema = z.object({
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
});

export const dataParamsSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Data inexistente no calendário'),
});

export const substituirDiaSchema = z.object({
  atribuicoes: z
    .array(
      z.object({
        userId: z.string().uuid(),
        local: z.enum(['GABINETE', 'RUA']),
      }),
    )
    .refine((lista) => new Set(lista.map((a) => a.userId)).size === lista.length, {
      message: 'Um assessor não pode aparecer duas vezes na mesma escala',
    }),
});
