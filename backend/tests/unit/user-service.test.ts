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
    expect(atualizado.status).toBe('ok');
    if (atualizado.status === 'ok') expect(atualizado.user.role).toBe('ASSESSOR_GABINETE');

    const desativado = await service.definirAtivo({
      userId: criado.user.id,
      ativo: false,
      atualizadoPorId: 'chefe-1',
    });
    expect(desativado.status).toBe('ok');
    if (desativado.status === 'ok') expect(desativado.user.ativo).toBe(false);
  });
});

// I6: o campo `ip` do audit log ficava sempre NULL porque nenhum caller o preenchia.
describe('UserService — auditoria com IP', () => {
  it('grava o IP recebido do controller nos registros de auditoria', async () => {
    const { service, auditLogRepo } = buildService();
    const criado = await service.criarAssessor({
      nome: 'Elis Assessora',
      telefone: '(34) 97777-1111',
      role: 'ASSESSOR_RUA',
      criadoPorId: 'chefe-1',
      ip: '203.0.113.7',
    });
    if (criado.status !== 'ok') throw new Error('esperava ok');

    await service.definirAtivo({
      userId: criado.user.id,
      ativo: false,
      atualizadoPorId: 'chefe-1',
      ip: '203.0.113.7',
    });

    expect(auditLogRepo.records).toHaveLength(2);
    for (const registro of auditLogRepo.records) {
      expect(registro).toMatchObject({ ip: '203.0.113.7' });
    }
  });
});

// I7: nada impedia o chefe de se desativar/rebaixar sendo o único, deixando o gabinete
// sem administrador e sem caminho de recuperação pela aplicação.
describe('UserService — proteção do último chefe ativo', () => {
  async function comChefes(quantidade: number) {
    const { service, userRepo, auditLogRepo } = buildService();
    const ids: string[] = [];
    for (let i = 0; i < quantidade; i++) {
      const criado = await service.criarAssessor({
        nome: `Chefe ${i}`,
        telefone: `(34) 96666-000${i}`,
        role: 'CHEFE',
        criadoPorId: 'seed',
      });
      if (criado.status !== 'ok') throw new Error('esperava ok');
      ids.push(criado.user.id);
    }
    return { service, userRepo, auditLogRepo, ids };
  }

  it('recusa desativar o único chefe ativo', async () => {
    const { service, userRepo, ids } = await comChefes(1);

    const result = await service.definirAtivo({ userId: ids[0]!, ativo: false, atualizadoPorId: ids[0]! });

    expect(result).toEqual({ status: 'ultimo_chefe' });
    expect((await userRepo.findById(ids[0]!))?.ativo).toBe(true);
  });

  it('recusa rebaixar o papel do único chefe ativo', async () => {
    const { service, userRepo, ids } = await comChefes(1);

    const result = await service.atualizarRole({
      userId: ids[0]!,
      novoRole: 'ASSESSOR_GABINETE',
      atualizadoPorId: ids[0]!,
    });

    expect(result).toEqual({ status: 'ultimo_chefe' });
    expect((await userRepo.findById(ids[0]!))?.role).toBe('CHEFE');
  });

  it('não grava auditoria quando a alteração é recusada', async () => {
    const { service, auditLogRepo, ids } = await comChefes(1);
    const antes = auditLogRepo.records.length;

    await service.definirAtivo({ userId: ids[0]!, ativo: false, atualizadoPorId: ids[0]! });

    expect(auditLogRepo.records).toHaveLength(antes);
  });

  it('permite desativar um chefe quando existe outro chefe ativo', async () => {
    const { service, ids } = await comChefes(2);

    const result = await service.definirAtivo({ userId: ids[0]!, ativo: false, atualizadoPorId: ids[1]! });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.user.ativo).toBe(false);
  });

  it('permite reativar e manter o papel de CHEFE do único chefe', async () => {
    const { service, ids } = await comChefes(1);

    const reativar = await service.definirAtivo({ userId: ids[0]!, ativo: true, atualizadoPorId: ids[0]! });
    expect(reativar.status).toBe('ok');

    const mesmoPapel = await service.atualizarRole({ userId: ids[0]!, novoRole: 'CHEFE', atualizadoPorId: ids[0]! });
    expect(mesmoPapel.status).toBe('ok');
  });
});

describe('UserService.editarAssessor', () => {
  it('atualiza nome e telefone com telefone normalizado', async () => {
    const { service, auditLogRepo } = buildService();
    const criado = await service.criarAssessor({
      nome: 'Nome Original',
      telefone: '(34) 99999-1234',
      role: 'ASSESSOR_RUA',
      criadoPorId: 'chefe-1',
    });
    if (criado.status !== 'ok') throw new Error('esperava ok');

    const result = await service.editarAssessor({
      userId: criado.user.id,
      nome: 'Nome Corrigido',
      telefone: '(34) 98888-5678',
      atualizadoPorId: 'chefe-1',
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.user.nome).toBe('Nome Corrigido');
      expect(result.user.telefone).toBe('+5534988885678');
    }
    expect(auditLogRepo.records).toHaveLength(2); // criação + edição
  });

  it('permite manter o mesmo telefone do próprio usuário', async () => {
    const { service } = buildService();
    const criado = await service.criarAssessor({
      nome: 'Nome Original',
      telefone: '(34) 99999-1234',
      role: 'ASSESSOR_RUA',
      criadoPorId: 'chefe-1',
    });
    if (criado.status !== 'ok') throw new Error('esperava ok');

    const result = await service.editarAssessor({
      userId: criado.user.id,
      nome: 'Nome Corrigido',
      telefone: '(34) 99999-1234',
      atualizadoPorId: 'chefe-1',
    });

    expect(result.status).toBe('ok');
  });

  it('rejeita telefone com formato inválido', async () => {
    const { service } = buildService();
    const criado = await service.criarAssessor({
      nome: 'Nome Original',
      telefone: '(34) 99999-1234',
      role: 'ASSESSOR_RUA',
      criadoPorId: 'chefe-1',
    });
    if (criado.status !== 'ok') throw new Error('esperava ok');

    const result = await service.editarAssessor({
      userId: criado.user.id,
      telefone: '123',
      atualizadoPorId: 'chefe-1',
    });

    expect(result.status).toBe('telefone_invalido');
  });

  it('rejeita telefone já usado por outro usuário', async () => {
    const { service } = buildService();
    await service.criarAssessor({
      nome: 'Assessor A',
      telefone: '(34) 99999-1234',
      role: 'ASSESSOR_RUA',
      criadoPorId: 'chefe-1',
    });
    const criadoB = await service.criarAssessor({
      nome: 'Assessor B',
      telefone: '(34) 98888-5678',
      role: 'ASSESSOR_RUA',
      criadoPorId: 'chefe-1',
    });
    if (criadoB.status !== 'ok') throw new Error('esperava ok');

    const result = await service.editarAssessor({
      userId: criadoB.user.id,
      telefone: '(34) 99999-1234',
      atualizadoPorId: 'chefe-1',
    });

    expect(result.status).toBe('telefone_duplicado');
  });
});
