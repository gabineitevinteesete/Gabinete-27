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
  // fs.readFileSync não normaliza quebras de linha como o transform do TypeScript faz com o
  // literal do backend — num checkout Windows (core.autocrlf) o arquivo do frontend vem com
  // \r\n mesmo quando o texto é idêntico. Normaliza os dois lados para a comparação não
  // depender do sistema operacional de quem roda o teste.
  return match[1]!.replace(/\r\n/g, '\n');
}

describe('Sincronia do texto do aviso de privacidade entre backend e frontend', () => {
  it('o texto do frontend é idêntico ao texto gravado pelo backend', () => {
    const textoFrontend = extrairTextoFrontend();
    const textoBackend = AVISO_PRIVACIDADE_TEXTO_ATUAL.replace(/\r\n/g, '\n');
    expect(textoFrontend).toBe(textoBackend);
  });
});
