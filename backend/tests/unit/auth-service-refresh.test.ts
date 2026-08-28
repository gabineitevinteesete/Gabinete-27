import { describe, it, expect } from 'vitest';
import { AuthService } from '../../src/services/auth.service.js';
import { hashPin } from '../../src/utils/pin.js';
import {
  createFakeUserRepo,
  createFakeRefreshTokenRepo,
  createFakeLoginAttemptRepo,
  createFakeAuditLogRepo,
} from '../helpers/fakes.js';

async function buildService() {
  const pinHash = await hashPin('482913');
  const user = {
    id: 'user-1',
    nome: 'Assessor Teste',
    telefone: '+5534999990001',
    role: 'ASSESSOR_RUA' as const,
    ativo: true,
    pinDefinido: true,
    pinHash,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const userRepo = createFakeUserRepo([user]);
  const refreshTokenRepo = createFakeRefreshTokenRepo();
  const loginAttemptRepo = createFakeLoginAttemptRepo();
  const auditLogRepo = createFakeAuditLogRepo();
  const service = new AuthService({ userRepo, refreshTokenRepo, loginAttemptRepo, auditLogRepo });
  return { service, userRepo, refreshTokenRepo, user };
}

describe('AuthService.refresh', () => {
  it('gira o refresh token: revoga o antigo e emite um novo par', async () => {
    const { service, refreshTokenRepo } = await buildService();
    const login = await service.login({ telefone: '+5534999990001', pin: '482913' });
    if (login.status !== 'ok') throw new Error('login deveria ter sucesso');

    const refreshed = await service.refresh({ refreshToken: login.refreshToken });
    expect(refreshed.status).toBe('ok');
    if (refreshed.status === 'ok') {
      expect(refreshed.refreshToken).not.toBe(login.refreshToken);
    }

    const tentativaReuso = await service.refresh({ refreshToken: login.refreshToken });
    expect(tentativaReuso.status).toBe('invalido');
    expect(refreshTokenRepo.tokens.filter((t) => t.revokedAt)).toHaveLength(1);
  });

  it('retorna invalido para um refresh token desconhecido', async () => {
    const { service } = await buildService();
    const result = await service.refresh({ refreshToken: 'token-que-nao-existe' });
    expect(result.status).toBe('invalido');
  });

  it('retorna usuario_inativo se o usuário foi desativado após o login', async () => {
    const { service, userRepo } = await buildService();
    const login = await service.login({ telefone: '+5534999990001', pin: '482913' });
    if (login.status !== 'ok') throw new Error('login deveria ter sucesso');

    await userRepo.setAtivo('user-1', false);

    const refreshed = await service.refresh({ refreshToken: login.refreshToken });
    expect(refreshed.status).toBe('usuario_inativo');
  });
});

describe('AuthService.logout', () => {
  it('revoga o refresh token informado', async () => {
    const { service, refreshTokenRepo } = await buildService();
    const login = await service.login({ telefone: '+5534999990001', pin: '482913' });
    if (login.status !== 'ok') throw new Error('login deveria ter sucesso');

    await service.logout({ refreshToken: login.refreshToken });

    const afterLogout = await service.refresh({ refreshToken: login.refreshToken });
    expect(afterLogout.status).toBe('invalido');
    expect(refreshTokenRepo.tokens.filter((t) => t.revokedAt)).toHaveLength(1);
  });
});
