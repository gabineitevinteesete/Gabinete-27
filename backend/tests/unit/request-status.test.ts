import { describe, it, expect } from 'vitest';
import { STATUS_ANTES_DE_PROTOCOLAR, podeEditarComoAssessorDeRua } from '../../src/utils/request-status.js';

describe('podeEditarComoAssessorDeRua', () => {
  it('permite editar quando o status ainda está antes de protocolada', () => {
    for (const status of STATUS_ANTES_DE_PROTOCOLAR) {
      expect(podeEditarComoAssessorDeRua(status)).toBe(true);
    }
  });

  it('bloqueia a partir de PROTOCOLADA', () => {
    expect(podeEditarComoAssessorDeRua('PROTOCOLADA')).toBe(false);
    expect(podeEditarComoAssessorDeRua('EM_ANDAMENTO')).toBe(false);
    expect(podeEditarComoAssessorDeRua('CONCLUIDA')).toBe(false);
    expect(podeEditarComoAssessorDeRua('ARQUIVADA')).toBe(false);
    expect(podeEditarComoAssessorDeRua('RECUSADA')).toBe(false);
  });
});
