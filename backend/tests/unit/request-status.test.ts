import { describe, it, expect } from 'vitest';
import {
  STATUS_ANTES_DE_PROTOCOLAR,
  podeEditarComoAssessorDeRua,
  transicaoValida,
  exigeMotivo,
  TRANSICOES_VALIDAS,
  type RequestStatusValue,
} from '../../src/utils/request-status.js';

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

describe('transicaoValida', () => {
  it('permite cada transição da tabela de transições válidas', () => {
    for (const [de, destinos] of Object.entries(TRANSICOES_VALIDAS) as [RequestStatusValue, RequestStatusValue[]][]) {
      for (const para of destinos) {
        expect(transicaoValida(de, para)).toBe(true);
      }
    }
  });

  it('bloqueia pular etapas', () => {
    expect(transicaoValida('ENVIADA', 'PROTOCOLADA')).toBe(false);
    expect(transicaoValida('EM_CONFERENCIA', 'CONCLUIDA')).toBe(false);
    expect(transicaoValida('RECEBIDA', 'ARQUIVADA')).toBe(false);
  });

  it('bloqueia qualquer transição a partir de RASCUNHO ou ARQUIVADA', () => {
    expect(transicaoValida('RASCUNHO', 'ENVIADA')).toBe(false);
    expect(transicaoValida('ARQUIVADA', 'CONCLUIDA')).toBe(false);
  });

  it('bloqueia recusar depois de protocolada', () => {
    expect(transicaoValida('PROTOCOLADA', 'RECUSADA')).toBe(false);
    expect(transicaoValida('EM_ANDAMENTO', 'RECUSADA')).toBe(false);
  });
});

describe('exigeMotivo', () => {
  it('exige motivo para PENDENTE_INFORMACAO e RECUSADA', () => {
    expect(exigeMotivo('PENDENTE_INFORMACAO')).toBe(true);
    expect(exigeMotivo('RECUSADA')).toBe(true);
  });

  it('não exige motivo para as demais transições', () => {
    expect(exigeMotivo('RECEBIDA')).toBe(false);
    expect(exigeMotivo('PROTOCOLADA')).toBe(false);
    expect(exigeMotivo('ARQUIVADA')).toBe(false);
  });
});
