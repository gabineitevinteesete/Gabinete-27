import { describe, it, expect } from 'vitest';
import { UserService } from '../../src/services/user.service.js';
import { createFakeUserRepo, createFakeAuditLogRepo } from '../helpers/fakes.js';

function buildService() {
  const userRepo = createFakeUserRepo();
  const auditLogRepo = createFakeAuditLogRepo();
  const service = new UserService({ userRepo, auditLogRepo });
  return { service, userRepo, auditLogRepo };
}

describe('UserService.criarAssessor', () => {
  it('cria um assessor com telefone normalizado', async () => {
    const { service, auditLogRepo } = buildService();
    const result = await service.criarAssessor({
      nome: 'Carlos Assessor',
      telefone: '(34) 99999-1234',
      role: 'ASSESSOR_RUA',
      criadoPorId: 'chefe-1',
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.user.telefone).toBe('+5534999991234');
    }
    expect(auditLogRepo.records).toHaveLength(1);
  });

  it('rejeita telefone com formato inválido', async () => {
    const { service } = buildService();
    const result = await service.criarAssessor({
      nome: 'Carlos Assessor',
      telefone: '123',
      role: 'ASSESSOR_RUA',
      criadoPorId: 'chefe-1',
    });
    expect(result.status).toBe('telefone_invalido');
  });

  it('rejeita telefone já cadastrado', async () => {
    const { service } = buildService();
    await service.criarAssessor({
      nome: 'Carlos Assessor',
      telefone: '(34) 99999-1234',
      role: 'ASSESSOR_RUA',
      criadoPorId: 'chefe-1',
    });
    const result = await service.criarAssessor({
      nome: 'Outro Nome',
      telefone: '(34) 99999-1234',
      role: 'ASSESSOR_GABINETE',
      criadoPorId: 'chefe-1',
    });
    expect(result.status).toBe('telefone_duplicado');
  });
});

describe('UserService.listar / atualizarRole / definirAtivo', () => {
  it('lista, atualiza papel e desativa um usuário', async () => {
    const { service } = buildService();
    const criado = await service.criarAssessor({
      nome: 'Dani Assessora',
      telefone: '(34) 98888-4321',
      role: 'ASSESSOR_RUA',
      criadoPorId: 'chefe-1',
    });
    if (criado.status !== 'ok') throw new Error('esperava ok');

    const lista = await service.listar();
    expect(lista).toHaveLength(1);

    const atualizado = await service.atualizarRole({
      userId: criado.user.id,
      novoRole: 'ASSESSOR_GABINETE',
      atualizadoPorId: 'chefe-1',
    });
    expect(atualizado.role).toBe('ASSESSOR_GABINETE');

    const desativado = await service.definirAtivo({
      userId: criado.user.id,
      ativo: false,
      atualizadoPorId: 'chefe-1',
    });
    expect(desativado.ativo).toBe(false);
  });
});
