import { randomBytes } from 'node:crypto';

export function gerarCodigoInterno(): string {
  const agora = new Date();
  const ano = agora.getUTCFullYear();
  const mes = String(agora.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(agora.getUTCDate()).padStart(2, '0');
  // 8 hex (4 bytes = ~4,3 bilhões de valores) e não 4: `codigoInterno` é @unique e não há
  // retry de colisão, então um choque no mesmo dia viraria 500 depois das fotos já subirem.
  const sufixo = randomBytes(4).toString('hex').toUpperCase();
  return `GD-${ano}${mes}${dia}-${sufixo}`;
}
