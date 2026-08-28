import { z } from 'zod';

export const loginSchema = z.object({
  telefone: z.string().min(10),
  pin: z.string().length(6),
});

export const definirPinSchema = z.object({
  userId: z.string().uuid(),
  novoPin: z.string().length(6),
});

export const trocarPinSchema = z.object({
  pinAtual: z.string().length(6),
  novoPin: z.string().length(6),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});
