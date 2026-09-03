import { describe, it, expect } from 'vitest';
import { criarObservacaoSchema, editarObservacaoSchema, observacaoIdParamsSchema } from '../../src/validators/internal-note.validators.js';

describe('criarObservacaoSchema', () => {
  it('aceita um texto não vazio', () => {
    const resultado = criarObservacaoSchema.safeParse({ texto: 'Liguei pra prefeitura' });
    expect(resultado.success).toBe(true);
  });

  it('rejeita texto vazio', () => {
    const resultado = criarObservacaoSchema.safeParse({ texto: '' });
    expect(resultado.success).toBe(false);
  });

  it('rejeita quando texto não é informado', () => {
    const resultado = criarObservacaoSchema.safeParse({});
    expect(resultado.success).toBe(false);
  });
});

describe('editarObservacaoSchema', () => {
  it('aceita um texto não vazio', () => {
    const resultado = editarObservacaoSchema.safeParse({ texto: 'Texto corrigido' });
    expect(resultado.success).toBe(true);
  });

  it('rejeita texto vazio', () => {
    const resultado = editarObservacaoSchema.safeParse({ texto: '' });
    expect(resultado.success).toBe(false);
  });
});

describe('observacaoIdParamsSchema', () => {
  it('aceita dois uuids válidos', () => {
    const resultado = observacaoIdParamsSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111',
      notaId: '22222222-2222-2222-2222-222222222222',
    });
    expect(resultado.success).toBe(true);
  });

  it('rejeita quando notaId não é uuid', () => {
    const resultado = observacaoIdParamsSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111',
      notaId: 'nao-e-um-uuid',
    });
    expect(resultado.success).toBe(false);
  });
});
