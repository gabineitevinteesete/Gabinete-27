import type { Request } from 'express';

// Ler X-Forwarded-For direto do cabeçalho aceitaria qualquer valor enviado pelo cliente e
// envenenaria a trilha de auditoria (login_attempts.ip, refresh_tokens.createdByIp).
// `req.ip` já resolve o cabeçalho respeitando o `trust proxy` configurado em app.ts, que
// limita quantos hops da cadeia são confiáveis.
export function getClientIp(req: Request): string {
  return req.ip ?? 'desconhecido';
}
