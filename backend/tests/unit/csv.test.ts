import { describe, it, expect } from 'vitest';
import { escaparCelulaCsv, gerarCsv } from '../../src/utils/csv.js';

describe('escaparCelulaCsv', () => {
  it('mantém texto simples como está', () => {
    expect(escaparCelulaCsv('Buraco na rua')).toBe('Buraco na rua');
  });

  it('coloca entre aspas o que tem ponto e vírgula, e duplica as aspas internas', () => {
    expect(escaparCelulaCsv('Rua A; esquina')).toBe('"Rua A; esquina"');
    expect(escaparCelulaCsv('Disse "oi"')).toBe('"Disse ""oi"""');
  });

  it('coloca entre aspas o que tem quebra de linha', () => {
    expect(escaparCelulaCsv('linha 1\nlinha 2')).toBe('"linha 1\nlinha 2"');
  });

  it.each(['=1+1', '+55', '-10', '@soma', '\tx', '\rx'])('neutraliza fórmula que começa com %j', (valor) => {
    expect(escaparCelulaCsv(valor).replace(/^"/, '').startsWith("'")).toBe(true);
  });

  it('não mexe em célula vazia', () => {
    expect(escaparCelulaCsv('')).toBe('');
  });
});

describe('gerarCsv', () => {
  it('começa com BOM, separa por ponto e vírgula e linhas por CRLF', () => {
    const csv = gerarCsv(['A', 'B'], [['1', '2'], ['3', '4']]);
    expect(csv).toBe('﻿A;B\r\n1;2\r\n3;4\r\n');
  });

  it('só com cabeçalho quando não há linhas', () => {
    expect(gerarCsv(['A'], [])).toBe('﻿A\r\n');
  });
});
