import { z } from 'zod';

export const criarTipoSchema = z.object({
  nome: z.string().trim().min(1).max(100),
  exigeDescricaoObrigatoria: z.boolean(),
});

export const editarTipoSchema = z
  .object({
    nome: z.string().trim().min(1).max(100).optional(),
    exigeDescricaoObrigatoria: z.boolean().optional(),
  })
  .refine((data) => data.nome !== undefined || data.exigeDescricaoObrigatoria !== undefined, {
    message: 'Informe ao menos um campo para editar',
  });

export const definirAtivoTipoSchema = z.object({
  ativo: z.boolean(),
});

// Um :id malformado chegaria até o Prisma e viraria um 500 genérico. Validar aqui devolve
// 400 com a mesma forma de erro das outras rotas.
export const tipoIdParamsSchema = z.object({
  id: z.string().uuid(),
});
