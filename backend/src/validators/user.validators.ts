import { z } from 'zod';

export const criarUsuarioSchema = z.object({
  nome: z.string().min(2),
  telefone: z.string().min(10),
  role: z.enum(['CHEFE', 'ASSESSOR_RUA', 'ASSESSOR_GABINETE']),
});

export const atualizarRoleSchema = z.object({
  role: z.enum(['CHEFE', 'ASSESSOR_RUA', 'ASSESSOR_GABINETE']),
});

export const definirAtivoSchema = z.object({
  ativo: z.boolean(),
});
