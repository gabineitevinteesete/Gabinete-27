import { describe, it, expect } from 'vitest';
import { RequestTypeService } from '../../src/services/request-type.service.js';
import { createFakeRequestTypeRepo, createFakeAuditLogRepo } from '../helpers/fakes.js';

function buildService() {
  const requestTypeRepo = createFakeRequestTypeRepo();
  const auditLogRepo = createFakeAuditLogRepo();
  const service = new RequestTypeService({ requestTypeRepo, auditLogRepo });
  return { service, requestTypeRepo, auditLogRepo };
}

describe('RequestTypeService.criar', () => {
  it('cria um tipo e grava auditoria', async () => {
    const { service, auditLogRepo } = buildService();
    const result = await service.criar({
      nome: 'Tapa-buraco',
      exigeDescricaoObrigatoria: false,
      criadoPorId: 'chefe-1',
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.tipo.nome).toBe('Tapa-buraco');
      expect(result.tipo.ativo).toBe(true);
    }
    expect(auditLogRepo.records).toHaveLength(1);
  });

  it('rejeita nome duplicado', async () => {
    const { service } = buildService();
    await service.criar({ nome: 'Poda de árvore', exigeDescricaoObrigatoria: false, criadoPorId: 'chefe-1' });
    const result = await service.criar({ nome: 'Poda de árvore', exigeDescricaoObrigatoria: true, criadoPorId: 'chefe-1' });
    expect(result.status).toBe('nome_duplicado');
  });
});

describe('RequestTypeService.editar', () => {
  it('atualiza nome e exigência de descrição', async () => {
    const { service, auditLogRepo } = buildService();
    const criado = await service.criar({ nome: 'Nome Original', exigeDescricaoObrigatoria: false, criadoPorId: 'chefe-1' });
    if (criado.status !== 'ok') throw new Error('esperava ok');

    const result = await service.editar({
      tipoId: criado.tipo.id,
      nome: 'Nome Corrigido',
      exigeDescricaoObrigatoria: true,
      atualizadoPorId: 'chefe-1',
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.tipo.nome).toBe('Nome Corrigido');
      expect(result.tipo.exigeDescricaoObrigatoria).toBe(true);
    }
    expect(auditLogRepo.records).toHaveLength(2); // criação + edição
  });

  it('permite manter o mesmo nome do próprio tipo', async () => {
    const { service } = buildService();
    const criado = await service.criar({ nome: 'Nome Original', exigeDescricaoObrigatoria: false, criadoPorId: 'chefe-1' });
    if (criado.status !== 'ok') throw new Error('esperava ok');

    const result = await service.editar({
      tipoId: criado.tipo.id,
      nome: 'Nome Original',
      atualizadoPorId: 'chefe-1',
    });

    expect(result.status).toBe('ok');
  });

  it('rejeita nome já usado por outro tipo', async () => {
    const { service } = buildService();
    await service.criar({ nome: 'Tipo A', exigeDescricaoObrigatoria: false, criadoPorId: 'chefe-1' });
    const criadoB = await service.criar({ nome: 'Tipo B', exigeDescricaoObrigatoria: false, criadoPorId: 'chefe-1' });
    if (criadoB.status !== 'ok') throw new Error('esperava ok');

    const result = await service.editar({ tipoId: criadoB.tipo.id, nome: 'Tipo A', atualizadoPorId: 'chefe-1' });

    expect(result.status).toBe('nome_duplicado');
  });

  it('retorna nao_encontrado para um id inexistente', async () => {
    const { service } = buildService();
    const result = await service.editar({ tipoId: 'id-inexistente', nome: 'Qualquer', atualizadoPorId: 'chefe-1' });
    expect(result.status).toBe('nao_encontrado');
  });
});

describe('RequestTypeService.definirAtivo', () => {
  it('ativa e desativa um tipo, gravando auditoria', async () => {
    const { service, auditLogRepo } = buildService();
    const criado = await service.criar({ nome: 'Outros', exigeDescricaoObrigatoria: true, criadoPorId: 'chefe-1' });
    if (criado.status !== 'ok') throw new Error('esperava ok');

    const desativado = await service.definirAtivo({ tipoId: criado.tipo.id, ativo: false, atualizadoPorId: 'chefe-1' });
    expect(desativado.status).toBe('ok');
    if (desativado.status === 'ok') expect(desativado.tipo.ativo).toBe(false);

    const reativado = await service.definirAtivo({ tipoId: criado.tipo.id, ativo: true, atualizadoPorId: 'chefe-1' });
    expect(reativado.status).toBe('ok');
    if (reativado.status === 'ok') expect(reativado.tipo.ativo).toBe(true);

    expect(auditLogRepo.records).toHaveLength(3); // criação + desativar + reativar
  });

  it('permite desativar o único tipo ativo restante (sem proteção de "último tipo")', async () => {
    const { service } = buildService();
    const criado = await service.criar({ nome: 'Único Tipo', exigeDescricaoObrigatoria: false, criadoPorId: 'chefe-1' });
    if (criado.status !== 'ok') throw new Error('esperava ok');

    const result = await service.definirAtivo({ tipoId: criado.tipo.id, ativo: false, atualizadoPorId: 'chefe-1' });
    expect(result.status).toBe('ok');
  });

  it('retorna nao_encontrado para um id inexistente', async () => {
    const { service } = buildService();
    const result = await service.definirAtivo({ tipoId: 'id-inexistente', ativo: false, atualizadoPorId: 'chefe-1' });
    expect(result.status).toBe('nao_encontrado');
  });
});

describe('RequestTypeService.listarAtivos / listarTodos', () => {
  it('listarAtivos só retorna ativos; listarTodos retorna todos', async () => {
    const { service } = buildService();
    const ativo = await service.criar({ nome: 'Ativo', exigeDescricaoObrigatoria: false, criadoPorId: 'chefe-1' });
    if (ativo.status !== 'ok') throw new Error('esperava ok');
    await service.definirAtivo({ tipoId: ativo.tipo.id, ativo: true, atualizadoPorId: 'chefe-1' });
    const inativo = await service.criar({ nome: 'Inativo', exigeDescricaoObrigatoria: false, criadoPorId: 'chefe-1' });
    if (inativo.status !== 'ok') throw new Error('esperava ok');
    await service.definirAtivo({ tipoId: inativo.tipo.id, ativo: false, atualizadoPorId: 'chefe-1' });

    const ativos = await service.listarAtivos();
    expect(ativos.map((t) => t.nome)).toEqual(['Ativo']);

    const todos = await service.listarTodos();
    expect(todos.map((t) => t.nome).sort()).toEqual(['Ativo', 'Inativo']);
  });
});
