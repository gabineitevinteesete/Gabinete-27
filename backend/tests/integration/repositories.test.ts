import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createUserRepository } from '../../src/repositories/user.repository.js';
import { createRefreshTokenRepository } from '../../src/repositories/refresh-token.repository.js';
import { createLoginAttemptRepository } from '../../src/repositories/login-attempt.repository.js';
import { createAuditLogRepository } from '../../src/repositories/audit-log.repository.js';

const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://gabinete:gabinete@localhost:5433/gabinete_test' } },
});

const userRepo = createUserRepository(prisma);
const refreshTokenRepo = createRefreshTokenRepository(prisma);
const loginAttemptRepo = createLoginAttemptRepository(prisma);
const auditLogRepo = createAuditLogRepository(prisma);

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.loginAttempt.deleteMany();
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
