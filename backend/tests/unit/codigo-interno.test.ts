import { describe, it, expect } from 'vitest';
import { gerarCodigoInterno } from '../../src/utils/codigo-interno.js';

describe('gerarCodigoInterno', () => {
  it('segue o formato GD-YYYYMMDD-XXXXXXXX', () => {
    const codigo = gerarCodigoInterno();
    expect(codigo).toMatch(/^GD-\d{8}-[0-9A-F]{8}$/);
  });

  it('gera códigos diferentes em chamadas sucessivas', () => {
    const codigos = new Set(Array.from({ length: 20 }, () => gerarCodigoInterno()));
    expect(codigos.size).toBe(20);
  });

  it('usa a data atual no formato YYYYMMDD', () => {
    const codigo = gerarCodigoInterno();
    const hoje = new Date();
    const esperado = `${hoje.getUTCFullYear()}${String(hoje.getUTCMonth() + 1).padStart(2, '0')}${String(hoje.getUTCDate()).padStart(2, '0')}`;
    expect(codigo).toContain(`GD-${esperado}-`);
  });
});
