import { describe, it, expect } from 'vitest';
import { DutyRosterService } from '../../src/services/duty-roster.service.js';
import { createFakeUserRepo } from '../helpers/fakes.js';
import type { DutyRosterRepository, LocalEscalaValue } from '../../src/repositories/duty-roster.repository.js';

function createFakeDutyRosterRepo(): DutyRosterRepository & {
  chamadasSubstituir: { data: Date; atribuicoes: { userId: string; local: LocalEscalaValue }[] }[];
} {
  const chamadasSubstituir: { data: Date; atribuicoes: { userId: string; local: LocalEscalaValue }[] }[] = [];
  return {
    chamadasSubstituir,
    async listarMes() {
      return {};
    },
    async substituirDia(data, atribuicoes) {
      chamadasSubstituir.push({ data, atribuicoes });
    },
  };
}

function buildService() {
  const agora = new Date();
  const userRepo = createFakeUserRepo([
    {
      id: 'assessor-1',
      nome: 'Ana',
      telefone: '+5534999990001',
      role: 'ASSESSOR_RUA',
      ativo: true,
      pinDefinido: false,
      pinHash: null,
      createdAt: agora,
      updatedAt: agora,
    },
    {
      id: 'chefe-1',
      nome: 'Chefe',
      telefone: '+5534999990002',
      role: 'CHEFE',
      ativo: true,
      pinDefinido: false,
      pinHash: null,
      createdAt: agora,
      updatedAt: agora,
    },
    {
      id: 'inativo-1',
      nome: 'Inativo',
      telefone: '+5534999990003',
      role: 'ASSESSOR_GABINETE',
      ativo: false,
      pinDefinido: false,
      pinHash: null,
      createdAt: agora,
      updatedAt: agora,
    },
  ]);
  const dutyRosterRepo = createFakeDutyRosterRepo();
  const service = new DutyRosterService({ dutyRosterRepo, userRepo });
  return { service, dutyRosterRepo };
}

describe('DutyRosterService.substituirDia', () => {
  it('aceita um assessor ativo e delega ao repositório', async () => {
    const { service, dutyRosterRepo } = buildService();

    const result = await service.substituirDia('2026-09-15', [{ userId: 'assessor-1', local: 'RUA' }]);

    expect(result.status).toBe('ok');
    expect(dutyRosterRepo.chamadasSubstituir).toHaveLength(1);
    expect(dutyRosterRepo.chamadasSubstituir[0]?.atribuicoes).toEqual([{ userId: 'assessor-1', local: 'RUA' }]);
    expect(dutyRosterRepo.chamadasSubstituir[0]?.data.toISOString()).toBe('2026-09-15T00:00:00.000Z');
  });

  it('rejeita quando o userId é de um chefe', async () => {
    const { service, dutyRosterRepo } = buildService();

    const result = await service.substituirDia('2026-09-15', [{ userId: 'chefe-1', local: 'GABINETE' }]);

    expect(result.status).toBe('usuario_invalido');
    expect(dutyRosterRepo.chamadasSubstituir).toHaveLength(0);
  });

  it('rejeita quando o assessor está inativo', async () => {
    const { service, dutyRosterRepo } = buildService();

    const result = await service.substituirDia('2026-09-15', [{ userId: 'inativo-1', local: 'GABINETE' }]);

    expect(result.status).toBe('usuario_invalido');
    expect(dutyRosterRepo.chamadasSubstituir).toHaveLength(0);
  });

  it('rejeita quando o userId não existe', async () => {
    const { service, dutyRosterRepo } = buildService();

    const result = await service.substituirDia('2026-09-15', [{ userId: 'nao-existe', local: 'RUA' }]);

    expect(result.status).toBe('usuario_invalido');
    expect(dutyRosterRepo.chamadasSubstituir).toHaveLength(0);
  });
});
