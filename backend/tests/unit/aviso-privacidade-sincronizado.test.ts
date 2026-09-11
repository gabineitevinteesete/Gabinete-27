import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { AVISO_PRIVACIDADE_TEXTO_ATUAL } from '../../src/utils/aviso-privacidade.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * O texto do aviso existe em dois arquivos (backend = fonte da verdade gravada no banco;
 * frontend = cópia de exibição) porque não há pacote compartilhado entre os dois projetos.
 * Este teste é a única garantia automatizada de que os dois nunca divergem — se divergirem,
 * o que o cidadão vê no modal fica diferente do que fica gravado permanentemente em
 * PrivacyConsent.textoVersao, o que anula o propósito da funcionalidade.
 */
function extrairTextoFrontend(): string {
  const caminho = resolve(__dirname, '../../../frontend/src/lib/aviso-privacidade.ts');
  const conteudo = readFileSync(caminho, 'utf-8');
  const match = conteudo.match(/export const AVISO_PRIVACIDADE_TEXTO = `([\s\S]*)`;/);
  if (!match) {
    throw new Error('Não foi possível extrair AVISO_PRIVACIDADE_TEXTO de frontend/src/lib/aviso-privacidade.ts');
  }
  return match[1]!;
}

describe('Sincronia do texto do aviso de privacidade entre backend e frontend', () => {
  it('o texto do frontend é idêntico ao texto gravado pelo backend', () => {
    const textoFrontend = extrairTextoFrontend();
    expect(textoFrontend).toBe(AVISO_PRIVACIDADE_TEXTO_ATUAL);
  });
});
