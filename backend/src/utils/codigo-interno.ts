import { randomBytes } from 'node:crypto';

export function gerarCodigoInterno(): string {
  const agora = new Date();
  const ano = agora.getUTCFullYear();
  const mes = String(agora.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(agora.getUTCDate()).padStart(2, '0');
  const sufixo = randomBytes(4).toString('hex').slice(0, 4).toUpperCase();
  return `GD-${ano}${mes}${dia}-${sufixo}`;
}
