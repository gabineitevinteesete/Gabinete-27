import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createDutyRosterRepository } from '../../src/repositories/duty-roster.repository.js';
import { resetDb } from '../helpers/reset-db.js';

const prisma = new PrismaClient();
const dutyRosterRepo = createDutyRosterRepository(prisma);

let assessorId: string;
let outroAssessorId: string;

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await resetDb();

  const assessor = await prisma.user.create({
    data: { nome: 'Ana Rua', telefone: '+5534999996700', role: 'ASSESSOR_RUA' },
  });
  assessorId = assessor.id;

  const outro = await prisma.user.create({
    data: { nome: 'Beto Gabinete', telefone: '+5534999996701', role: 'ASSESSOR_GABINETE' },
  });
  outroAssessorId = outro.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('DutyRosterRepository.listarMes', () => {
  it('agrupa as atribuições por dia dentro do intervalo do mês', async () => {
    await prisma.dutyRosterEntry.createMany({
      data: [
        { data: new Date('2026-09-15T00:00:00.000Z'), userId: assessorId, local: 'RUA' },
        { data: new Date('2026-09-15T00:00:00.000Z'), userId: outroAssessorId, local: 'GABINETE' },
        { data: new Date('2026-08-31T00:00:00.000Z'), userId: assessorId, local: 'RUA' },
      ],
    });

    const dias = await dutyRosterRepo.listarMes(
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-10-01T00:00:00.000Z'),
    );

    expect(dias['2026-09-15']).toHaveLength(2);
    expect(dias['2026-09-15']?.find((a) => a.userId === assessorId)?.local).toBe('RUA');
    expect(dias['2026-09-15']?.find((a) => a.userId === outroAssessorId)?.userNome).toBe('Beto Gabinete');
    expect(dias['2026-08-31']).toBeUndefined();
  }, 20000);

  it('um dia sem nenhuma entrada não aparece no resultado', async () => {
    const dias = await dutyRosterRepo.listarMes(
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-10-01T00:00:00.000Z'),
    );

    expect(dias['2026-09-20']).toBeUndefined();
  }, 20000);
});

describe('DutyRosterRepository.substituirDia', () => {
  it('cria as atribuições quando o dia estava vazio', async () => {
    await dutyRosterRepo.substituirDia(new Date('2026-09-15T00:00:00.000Z'), [
      { userId: assessorId, local: 'RUA' },
    ]);

    const dias = await dutyRosterRepo.listarMes(
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-10-01T00:00:00.000Z'),
    );
    expect(dias['2026-09-15']).toHaveLength(1);
    expect(dias['2026-09-15']?.[0]?.local).toBe('RUA');
  }, 20000);

  it('substitui inteiramente as atribuições já existentes do dia', async () => {
    await dutyRosterRepo.substituirDia(new Date('2026-09-15T00:00:00.000Z'), [
      { userId: assessorId, local: 'RUA' },
      { userId: outroAssessorId, local: 'GABINETE' },
    ]);

    await dutyRosterRepo.substituirDia(new Date('2026-09-15T00:00:00.000Z'), [
      { userId: assessorId, local: 'GABINETE' },
    ]);

    const dias = await dutyRosterRepo.listarMes(
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-10-01T00:00:00.000Z'),
    );
    expect(dias['2026-09-15']).toHaveLength(1);
    expect(dias['2026-09-15']?.[0]?.userId).toBe(assessorId);
    expect(dias['2026-09-15']?.[0]?.local).toBe('GABINETE');
  }, 20000);

  it('esvazia o dia quando a lista de atribuições enviada é vazia', async () => {
    await dutyRosterRepo.substituirDia(new Date('2026-09-15T00:00:00.000Z'), [
      { userId: assessorId, local: 'RUA' },
    ]);
    await dutyRosterRepo.substituirDia(new Date('2026-09-15T00:00:00.000Z'), []);

    const dias = await dutyRosterRepo.listarMes(
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-10-01T00:00:00.000Z'),
    );
    expect(dias['2026-09-15']).toBeUndefined();
  }, 20000);
});
