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
  const userRepo = createFakeUserRepo([
    {
      id: 'user-novo',
      nome: 'Assessor Novo',
      telefone: '+5534999990010',
      role: 'ASSESSOR_RUA',
      ativo: true,
      pinDefinido: false,
      pinHash: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'user-inativo',
      nome: 'Assessor Desativado',
      telefone: '+5534999990012',
      role: 'ASSESSOR_RUA',
      ativo: false,
      pinDefinido: false,
      pinHash: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'user-com-pin',
      nome: 'Assessor Com Pin',
      telefone: '+5534999990011',
      role: 'ASSESSOR_GABINETE',
      ativo: true,
      pinDefinido: true,
      pinHash: await hashPin('482913'),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  const refreshTokenRepo = createFakeRefreshTokenRepo();
  const loginAttemptRepo = createFakeLoginAttemptRepo();
  const auditLogRepo = createFakeAuditLogRepo();
  const service = new AuthService({ userRepo, refreshTokenRepo, loginAttemptRepo, auditLogRepo });
  return { service, userRepo, refreshTokenRepo, auditLogRepo };
}

describe('AuthService.definirPinInicial', () => {
  it('define o PIN e já retorna tokens de sessão', async () => {
    const { service } = await buildService();
    const result = await service.definirPinInicial({ userId: 'user-novo', novoPin: '482913' });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      // O tipo PublicUser não declara pinHash — a asserção confirma que o campo também não
      // vaza em runtime a partir do registro interno do repositório.
      expect((result.user as Record<string, unknown>).pinHash).toBeUndefined();
    }
  });

  // C3: o endpoint é público. Um usuário desativado não pode reconquistar acesso por ele,
  // e a resposta é a mesma de "não encontrado" para não vazar o estado da conta.
  it('recusa usuário desativado sem revelar que ele existe', async () => {
    const { service, userRepo } = await buildService();
    const result = await service.definirPinInicial({ userId: 'user-inativo', novoPin: '482913' });

    expect(result).toEqual({ status: 'usuario_nao_encontrado' });
    const user = await userRepo.findById('user-inativo');
    expect(user?.pinDefinido).toBe(false);
    expect(user?.pinHash).toBeNull();
  });

  it('recusa sobrescrever o PIN de um usuário que já tem PIN definido', async () => {
    const { service, userRepo } = await buildService();
    const antes = await userRepo.findById('user-com-pin');
    const result = await service.definirPinInicial({ userId: 'user-com-pin', novoPin: '739284' });

    expect(result).toEqual({ status: 'usuario_nao_encontrado' });
    const depois = await userRepo.findById('user-com-pin');
    expect(depois?.pinHash).toBe(antes?.pinHash);
  });

  it('rejeita PIN com formato inválido', async () => {
    const { service } = await buildService();
    const result = await service.definirPinInicial({ userId: 'user-novo', novoPin: '12' });
    expect(result).toEqual({ status: 'pin_invalido', motivo: 'formato' });
  });

  it('rejeita PIN óbvio', async () => {
    const { service } = await buildService();
    const result = await service.definirPinInicial({ userId: 'user-novo', novoPin: '123456' });
    expect(result).toEqual({ status: 'pin_invalido', motivo: 'obvio' });
  });
});

describe('AuthService.trocarPin', () => {
  it('troca o PIN quando o atual está correto e o novo é válido', async () => {
    const { service } = await buildService();
    const result = await service.trocarPin({ userId: 'user-com-pin', pinAtual: '482913', novoPin: '739284' });
    expect(result).toEqual({ status: 'ok' });
  });

  it('rejeita quando o PIN atual está incorreto', async () => {
    const { service } = await buildService();
    const result = await service.trocarPin({ userId: 'user-com-pin', pinAtual: '000000', novoPin: '739284' });
    expect(result).toEqual({ status: 'pin_atual_incorreto' });
  });

  it('rejeita novo PIN óbvio mesmo com PIN atual correto', async () => {
    const { service } = await buildService();
    const result = await service.trocarPin({ userId: 'user-com-pin', pinAtual: '482913', novoPin: '000000' });
    expect(result).toEqual({ status: 'pin_novo_invalido', motivo: 'obvio' });
  });

  it('revoga as demais sessões após uma troca de PIN bem-sucedida', async () => {
    const { service, refreshTokenRepo } = await buildService();
    await service.definirPinInicial({ userId: 'user-com-pin', novoPin: '482913' }).catch(() => undefined);
    await refreshTokenRepo.create({
      userId: 'user-com-pin',
      tokenHash: 'hash-de-outra-sessao',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await service.trocarPin({ userId: 'user-com-pin', pinAtual: '482913', novoPin: '739284' });

    expect(result).toEqual({ status: 'ok' });
    expect(refreshTokenRepo.tokens.every((t) => t.revokedAt !== null)).toBe(true);
  });
});

describe('AuthService.resetarAcesso', () => {
  it('limpa o PIN do usuário, forçando novo primeiro acesso, e grava auditoria', async () => {
    const { service, userRepo, auditLogRepo } = await buildService();
    await service.resetarAcesso({ chefeId: 'chefe-1', userId: 'user-com-pin' });

    const user = await userRepo.findById('user-com-pin');
    expect(user?.pinDefinido).toBe(false);
    expect(user?.pinHash).toBeNull();
    expect(auditLogRepo.records).toHaveLength(1);
  });
});
