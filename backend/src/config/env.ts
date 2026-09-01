import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),
  // Usado apenas pelo Prisma CLI (migrate) para se conectar sem passar pelo pooler do Neon —
  // o Prisma Client em runtime nunca lê esta variável, só o schema.prisma declara.
  DIRECT_URL: z.string().default(''),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET precisa de ao menos 16 caracteres'),
  // Reservado: hoje o refresh token é opaco e guardado como hash SHA-256 (não é um JWT),
  // então este segredo não é usado. Mantido para não quebrar ambientes já provisionados e
  // para um eventual refresh assinado no futuro.
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET precisa de ao menos 16 caracteres'),
  FRONTEND_URL: z.string().url(),
  // Topologia de produção prevista (Fase 5): frontend na Vercel e backend no Render, em
  // domínios diferentes — nesse caso o cookie de refresh precisa de SameSite=None, senão o
  // navegador não o envia. Em desenvolvimento (mesmo site) "lax" é o mais seguro.
  COOKIE_SAME_SITE: z.enum(['lax', 'none', 'strict']).default('lax'),
  CLOUDINARY_CLOUD_NAME: z.string().default(''),
  CLOUDINARY_API_KEY: z.string().default(''),
  CLOUDINARY_API_SECRET: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(): Env {
  if (!cached) {
    cached = envSchema.parse(process.env);
  }
  return cached;
}
