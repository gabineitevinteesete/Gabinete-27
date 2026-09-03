import { z } from 'zod';

export const criarObservacaoSchema = z.object({
  texto: z.string().min(1),
});

export const editarObservacaoSchema = z.object({
  texto: z.string().min(1),
});

export const observacaoIdParamsSchema = z.object({
  id: z.string().uuid(),
  notaId: z.string().uuid(),
});
