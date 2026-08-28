import { describe, it, expect } from 'vitest';
import { AuthService } from '../../src/services/auth.service.js';
import { hashPin } from '../../src/utils/pin.js';
import {
  createFakeUserRepo,
  createFakeRefreshTokenRepo,
  createFakeLoginAttemptRepo,
  createFakeAuditLogRepo,
} from '../helpers/fakes.js';

async function buildService(seedUsers: Awaited<ReturnType<typeof buildSeedUser>>[] = []) {
  const userRepo = createFakeUserRepo(seedUsers);
  const refreshTokenRepo = createFakeRefreshTokenRepo();
  const loginAttemptRepo = createFakeLoginAttemptRepo();
  const auditLogRepo = createFakeAuditLogRepo();
  const service = new AuthService({ userRepo, refreshTokenRepo, loginAttemptRepo, auditLogRepo });
  return { service, userRepo, refreshTokenRepo, loginAttemptRepo, auditLogRepo };
}

async function buildSeedUser(overrides: Partial<{ pin: string; role: 'CHEFE' | 'ASSESSOR_RUA' | 'ASSESSOR_GABINETE'; ativo: boolean; pinDefinido: boolean }> = {}) {
  const pin = overrides.pin ?? '482913';
  return {
    id: 'user-1',
    nome: 'Assessor Teste',
    telefone: '+5534999990001',
    role: overrides.role ?? 'ASSESSOR_RUA',
    ativo: overrides.ativo ?? true,
    pinDefinido: overrides.pinDefinido ?? true,
    pinHash: overrides.pinDefinido === false ? null : await hashPin(pin),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('AuthService.login', () => {
  it('retorna ok com tokens quando telefone e PIN estão corretos', async () => {
    const user = await buildSeedUser();
    const { service } = await buildService([user]);

    const result = await service.login({ telefone: user.telefone, pin: '482913' });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.user.id).toBe('user-1');
      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');
    }
  });

  it('retorna credenciais_invalidas quando o PIN está errado', async () => {
    const user = await buildSeedUser();
    const { service } = await buildService([user]);

    const result = await service.login({ telefone: user.telefone, pin: '000001' });
    expect(result.status).toBe('credenciais_invalidas');
  });

  it('retorna credenciais_invalidas quando o telefone não existe', async () => {
    const { service } = await buildService([]);
    const result = await service.login({ telefone: '+5534900000000', pin: '482913' });
    expect(result.status).toBe('credenciais_invalidas');
  });

  it('retorna inativo quando o usuário está desativado', async () => {
    const user = await buildSeedUser({ ativo: false });
    const { service } = await buildService([user]);
    const result = await service.login({ telefone: user.telefone, pin: '482913' });
    expect(result.status).toBe('inativo');
  });

  it('retorna primeiro_acesso quando o usuário ainda não definiu PIN', async () => {
    const user = await buildSeedUser({ pinDefinido: false });
    const { service } = await buildService([user]);
    const result = await service.login({ telefone: user.telefone, pin: '000000' });
    expect(result.status).toBe('primeiro_acesso');
    if (result.status === 'primeiro_acesso') {
      expect(result.userId).toBe('user-1');
    }
  });

  it('bloqueia após 5 tentativas incorretas em 15 minutos', async () => {
    const user = await buildSeedUser();
    const { service } = await buildService([user]);

    for (let i = 0; i < 5; i++) {
      await service.login({ telefone: user.telefone, pin: '000001' });
    }

    const result = await service.login({ telefone: user.telefone, pin: '482913' });
    expect(result.status).toBe('bloqueado');
  });

  it('registra cada tentativa de login', async () => {
    const user = await buildSeedUser();
    const { service, loginAttemptRepo } = await buildService([user]);

    await service.login({ telefone: user.telefone, pin: '482913' });
    await service.login({ telefone: user.telefone, pin: '000001' });

    expect(loginAttemptRepo.attempts).toHaveLength(2);
    expect(loginAttemptRepo.attempts[0]?.sucesso).toBe(true);
    expect(loginAttemptRepo.attempts[1]?.sucesso).toBe(false);
  });
});
