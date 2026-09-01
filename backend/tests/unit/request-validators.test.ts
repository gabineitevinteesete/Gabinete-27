import { describe, it, expect } from 'vitest';
import { criarDemandaSchema, editarDemandaSchema, listarDemandasQuerySchema, demandaIdParamsSchema } from '../../src/validators/request.validators.js';

function corpoBase(overrides: Record<string, string> = {}) {
  return {
    solicitanteNome: 'Maria Solicitante',
    solicitanteTelefone: '(34) 99999-0000',
    localExato: 'Em frente ao 100',
    tituloResumido: 'Buraco na rua',
    descricao: 'Buraco grande',
    requestTypeId: '11111111-1111-1111-1111-111111111111',
    autorizacaoDados: 'true',
    ...overrides,
  };
}

describe('criarDemandaSchema', () => {
  it('aceita o corpo mínimo válido vindo como strings de multipart', () => {
    const resultado = criarDemandaSchema.parse(corpoBase());
    expect(resultado.autorizacaoDados).toBe(true);
  });

  it('converte autorizacaoDados="false" para false (não para true)', () => {
    const resultado = criarDemandaSchema.parse(corpoBase({ autorizacaoDados: 'false' }));
    expect(resultado.autorizacaoDados).toBe(false);
  });

  it('converte solicitanteNascimento em Date quando presente', () => {
    const resultado = criarDemandaSchema.parse(corpoBase({ solicitanteNascimento: '1990-05-20' }));
    expect(resultado.solicitanteNascimento).toBeInstanceOf(Date);
  });

  it('rejeita quando falta um campo obrigatório', () => {
    const { tituloResumido: _t, ...semTitulo } = corpoBase();
    expect(() => criarDemandaSchema.parse(semTitulo)).toThrow();
  });

  it('rejeita requestTypeId que não é um uuid', () => {
    expect(() => criarDemandaSchema.parse(corpoBase({ requestTypeId: 'nao-e-uuid' }))).toThrow();
  });
});

describe('editarDemandaSchema', () => {
  it('aceita um objeto parcial, com só um campo', () => {
    const resultado = editarDemandaSchema.parse({ tituloResumido: 'Novo título' });
    expect(resultado).toEqual({ tituloResumido: 'Novo título' });
  });

  it('aceita objeto vazio (nenhum campo alterado)', () => {
    expect(() => editarDemandaSchema.parse({})).not.toThrow();
  });
});

describe('listarDemandasQuerySchema', () => {
  it('aplica os valores padrão de paginação quando ausentes', () => {
    const resultado = listarDemandasQuerySchema.parse({});
    expect(resultado.pagina).toBe(1);
    expect(resultado.tamanhoPagina).toBe(20);
  });

  it('converte pagina e tamanhoPagina de string para número', () => {
    const resultado = listarDemandasQuerySchema.parse({ pagina: '3', tamanhoPagina: '50' });
    expect(resultado.pagina).toBe(3);
    expect(resultado.tamanhoPagina).toBe(50);
  });

  it('rejeita tamanhoPagina acima de 100', () => {
    expect(() => listarDemandasQuerySchema.parse({ tamanhoPagina: '500' })).toThrow();
  });

  it('aceita um status válido do enum', () => {
    const resultado = listarDemandasQuerySchema.parse({ status: 'ENVIADA' });
    expect(resultado.status).toBe('ENVIADA');
  });

  it('rejeita um status que não existe no enum', () => {
    expect(() => listarDemandasQuerySchema.parse({ status: 'NAO_EXISTE' })).toThrow();
  });
});

describe('demandaIdParamsSchema', () => {
  it('aceita um uuid válido', () => {
    expect(() => demandaIdParamsSchema.parse({ id: '11111111-1111-1111-1111-111111111111' })).not.toThrow();
  });

  it('rejeita um id malformado', () => {
    expect(() => demandaIdParamsSchema.parse({ id: 'nao-e-uuid' })).toThrow();
  });
});
