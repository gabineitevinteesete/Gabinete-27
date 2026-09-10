import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createUserRepository } from '../../src/repositories/user.repository.js';
import { createRefreshTokenRepository } from '../../src/repositories/refresh-token.repository.js';
import { createLoginAttemptRepository } from '../../src/repositories/login-attempt.repository.js';
import { createAuditLogRepository } from '../../src/repositories/audit-log.repository.js';
import { createRequestTypeRepository } from '../../src/repositories/request-type.repository.js';

const prisma = new PrismaClient();

const userRepo = createUserRepository(prisma);
const refreshTokenRepo = createRefreshTokenRepository(prisma);
const loginAttemptRepo = createLoginAttemptRepository(prisma);
const auditLogRepo = createAuditLogRepository(prisma);
const requestTypeRepo = createRequestTypeRepository(prisma);

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.loginAttempt.deleteMany();
  // requestPhoto/request/requestType precisam ser limpos antes de refreshToken/user por
  // causa das FKs RESTRICT em requests (assessorResponsavelId, requestTypeId) — desde que
  // o repositório de demandas passou a popular essas tabelas nos testes de integração.
  // internalNote também referencia request com FK RESTRICT — precisa ser limpa antes de
  // request.deleteMany() (o arquivo internal-note.routes.test.ts pode deixar notas para
  // trás quando os testes são rodados em conjunto/fora de ordem).
  await prisma.requestPhoto.deleteMany();
  // requestStatusHistory/requestReassignmentHistory referenciam request com FK RESTRICT
  // — precisam ser limpas antes de request.deleteMany().
  await prisma.requestStatusHistory.deleteMany();
  await prisma.requestReassignmentHistory.deleteMany();
  await prisma.internalNote.deleteMany();
  await prisma.privacyConsent.deleteMany();
  await prisma.request.deleteMany();
  await prisma.requestType.deleteMany();
  // dutyRosterEntry referencia user com FK RESTRICT — precisa ser limpa antes de
  // user.deleteMany() (outro arquivo de teste pode deixar entradas de escala para
  // trás quando os testes são rodados em conjunto/fora de ordem).
  await prisma.dutyRosterEntry.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('UserRepository', () => {
  it('cria, busca por telefone e atualiza papel/ativo', async () => {
    const created = await userRepo.create({ nome: 'Ana Teste', telefone: '+5534999990001', role: 'ASSESSOR_RUA' });
    expect(created.pinDefinido).toBe(false);

    const found = await userRepo.findByTelefone('+5534999990001');
    expect(found?.id).toBe(created.id);
    expect(found?.pinHash).toBeNull();

    await userRepo.setPinHash(created.id, 'hash-fake');
    const withPin = await userRepo.findById(created.id);
    expect(withPin?.pinHash).toBe('hash-fake');
    expect(withPin?.pinDefinido).toBe(true);

    const updated = await userRepo.updateRole(created.id, 'ASSESSOR_GABINETE');
    expect(updated.role).toBe('ASSESSOR_GABINETE');

    const deactivated = await userRepo.setAtivo(created.id, false);
    expect(deactivated.ativo).toBe(false);
  });
});

describe('UserRepository.list — filtro por papel', () => {
  it('filtra só por role quando informado', async () => {
    await userRepo.create({ nome: 'Rua Um', telefone: '+5534999996600', role: 'ASSESSOR_RUA' });
    await userRepo.create({ nome: 'Gabinete Um', telefone: '+5534999996601', role: 'ASSESSOR_GABINETE' });

    const resultado = await userRepo.list({ role: 'ASSESSOR_RUA' });

    expect(resultado.every((u) => u.role === 'ASSESSOR_RUA')).toBe(true);
    expect(resultado.some((u) => u.nome === 'Rua Um')).toBe(true);
    expect(resultado.some((u) => u.nome === 'Gabinete Um')).toBe(false);
  });

  it('combina filtro de role com filtro de ativo', async () => {
    const criado = await userRepo.create({ nome: 'Rua Inativo', telefone: '+5534999996602', role: 'ASSESSOR_RUA' });
    await userRepo.setAtivo(criado.id, false);
    await userRepo.create({ nome: 'Rua Ativo', telefone: '+5534999996603', role: 'ASSESSOR_RUA' });

    const resultado = await userRepo.list({ role: 'ASSESSOR_RUA', ativo: true });

    expect(resultado.some((u) => u.nome === 'Rua Ativo')).toBe(true);
    expect(resultado.some((u) => u.nome === 'Rua Inativo')).toBe(false);
  });
});

describe('RefreshTokenRepository', () => {
  it('cria, encontra por hash válido e revoga', async () => {
    const user = await userRepo.create({ nome: 'Bia Teste', telefone: '+5534999990002', role: 'CHEFE' });
    await refreshTokenRepo.create({
      userId: user.id,
      tokenHash: 'hash-abc',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const found = await refreshTokenRepo.findValidByHash('hash-abc');
    expect(found?.userId).toBe(user.id);
    expect(found?.revokedAt).toBeNull();

    await refreshTokenRepo.revoke(found!.id);
    const afterRevoke = await refreshTokenRepo.findValidByHash('hash-abc');
    expect(afterRevoke?.revokedAt).not.toBeNull();
  });
});

describe('LoginAttemptRepository', () => {
  it('registra tentativas e conta falhas recentes', async () => {
    await loginAttemptRepo.record({ telefone: '+5534999990003', sucesso: false });
    await loginAttemptRepo.record({ telefone: '+5534999990003', sucesso: false });
    await loginAttemptRepo.record({ telefone: '+5534999990003', sucesso: true });

    const failures = await loginAttemptRepo.countRecentFailures('+5534999990003', 15 * 60 * 1000);
    expect(failures).toBe(2);
  });
});

describe('AuditLogRepository', () => {
  it('grava um registro de auditoria', async () => {
    const user = await userRepo.create({ nome: 'Chefe Teste', telefone: '+5534999990004', role: 'CHEFE' });
    await auditLogRepo.record({
      actorUserId: user.id,
      acao: 'CRIAR_USUARIO',
      entidade: 'User',
      entidadeId: user.id,
    });
    const count = await prisma.auditLog.count();
    expect(count).toBe(1);
  });
});

describe('RequestTypeRepository', () => {
  it('cria, edita, busca por nome e ativa/desativa', async () => {
    const criado = await requestTypeRepo.create({ nome: 'Buraco na via', exigeDescricaoObrigatoria: false });
    expect(criado.ativo).toBe(true);

    const encontrado = await requestTypeRepo.findByNome('Buraco na via');
    expect(encontrado?.id).toBe(criado.id);

    const editado = await requestTypeRepo.update(criado.id, { exigeDescricaoObrigatoria: true });
    expect(editado.exigeDescricaoObrigatoria).toBe(true);

    const desativado = await requestTypeRepo.setAtivo(criado.id, false);
    expect(desativado.ativo).toBe(false);
  });

  it('listAll inclui ativos e inativos; listActive só ativos', async () => {
    const ativo = await requestTypeRepo.create({ nome: 'Tipo Ativo X', exigeDescricaoObrigatoria: false });
    const inativoBase = await requestTypeRepo.create({ nome: 'Tipo Inativo X', exigeDescricaoObrigatoria: false });
    await requestTypeRepo.setAtivo(inativoBase.id, false);

    const todos = await requestTypeRepo.listAll();
    expect(todos.some((t) => t.id === ativo.id)).toBe(true);
    expect(todos.some((t) => t.id === inativoBase.id)).toBe(true);

    const ativos = await requestTypeRepo.listActive();
    expect(ativos.some((t) => t.id === ativo.id)).toBe(true);
    expect(ativos.some((t) => t.id === inativoBase.id)).toBe(false);
  });
});
