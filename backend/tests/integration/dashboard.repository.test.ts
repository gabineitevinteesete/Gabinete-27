import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createDashboardRepository } from '../../src/repositories/dashboard.repository.js';
import { createRequestRepository, type CriarRequestInput } from '../../src/repositories/request.repository.js';

const prisma = new PrismaClient();
const dashboardRepo = createDashboardRepository(prisma);
const requestRepo = createRequestRepository(prisma);

let tipoId: string;
let assessorId: string;

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await prisma.internalNote.deleteMany();
  await prisma.requestPhoto.deleteMany();
  await prisma.requestStatusHistory.deleteMany();
  await prisma.requestReassignmentHistory.deleteMany();
  await prisma.request.deleteMany();
  await prisma.requestType.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  const tipo = await prisma.requestType.create({
    data: { nome: 'Tapa-buraco', ativo: true, exigeDescricaoObrigatoria: false },
  });
  tipoId = tipo.id;

  const assessor = await prisma.user.create({
    data: { nome: 'Assessor Teste', telefone: '+5534999995100', role: 'ASSESSOR_RUA' },
  });
  assessorId = assessor.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

function inputBase(overrides: Partial<CriarRequestInput> = {}): CriarRequestInput {
  return {
    codigoInterno: 'GD-dash-0001',
    solicitanteNome: 'Maria Solicitante',
    solicitanteTelefone: '+5534999990000',
    tituloResumido: 'Buraco na rua',
    descricao: 'Buraco grande',
    requestTypeId: tipoId,
    assessorResponsavelId: assessorId,
    criadoPorId: assessorId,
    autorizacaoDados: true,
    bairro: 'Centro',
    ...overrides,
  };
}

const fotoBase = { url: 'https://cdn.example/a.jpg', publicId: 'a', larguraPx: 800, alturaPx: 600, bytes: 12345 };

describe('DashboardRepository.resumo — status', () => {
  it('conta todas as demandas por status, inclusive finalizadas', async () => {
    const d1 = await requestRepo.create(inputBase({ codigoInterno: 'GD-dash-1' }), [fotoBase]);
    await requestRepo.create(inputBase({ codigoInterno: 'GD-dash-2' }), [fotoBase]);
    await requestRepo.updateStatus(d1.id, 'RECEBIDA', assessorId);

    const resumo = await dashboardRepo.resumo();

    const enviada = resumo.porStatus.find((s) => s.status === 'ENVIADA');
    const recebida = resumo.porStatus.find((s) => s.status === 'RECEBIDA');
    expect(enviada?.quantidade).toBe(1);
    expect(recebida?.quantidade).toBe(1);
  }, 20000);
});

describe('DashboardRepository.resumo — bairro e carga por assessor', () => {
  it('conta só demandas em aberto, agrupadas por bairro e por assessor', async () => {
    const outroAssessor = await prisma.user.create({
      data: { nome: 'Outro Assessor', telefone: '+5534999995200', role: 'ASSESSOR_RUA' },
    });
    const aberta = await requestRepo.create(
      inputBase({ codigoInterno: 'GD-dash-3', bairro: 'Vila Nova', assessorResponsavelId: outroAssessor.id, criadoPorId: outroAssessor.id }),
      [fotoBase],
    );
    const finalizada = await requestRepo.create(inputBase({ codigoInterno: 'GD-dash-4', bairro: 'Vila Nova' }), [fotoBase]);
    await requestRepo.updateStatus(finalizada.id, 'RECEBIDA', assessorId);
    await requestRepo.updateStatus(finalizada.id, 'EM_CONFERENCIA', assessorId);
    await requestRepo.updateStatus(finalizada.id, 'PROTOCOLADA', assessorId);
    await requestRepo.updateStatus(finalizada.id, 'EM_ANDAMENTO', assessorId);
    await requestRepo.updateStatus(finalizada.id, 'CONCLUIDA', assessorId);

    const resumo = await dashboardRepo.resumo();

    const vilaNova = resumo.porBairro.find((b) => b.bairro === 'Vila Nova');
    expect(vilaNova?.quantidade).toBe(1); // só a `aberta`, a `finalizada` está CONCLUIDA
    const cargaOutroAssessor = resumo.porAssessor.find((a) => a.assessorId === outroAssessor.id);
    expect(cargaOutroAssessor?.quantidade).toBe(1);
    const vilaNovaComFinalizada = resumo.porBairro.find((b) => b.bairro === 'Vila Nova');
    expect(vilaNovaComFinalizada?.quantidade).not.toBe(2); // a finalizada não deve ser contada
    expect(aberta.bairro).toBe('Vila Nova');
  }, 30000);
});

describe('DashboardRepository.resumo — demandas paradas', () => {
  it('lista demandas em aberto sem mudança de status há 2+ dias, usando createdAt quando nunca mudou', async () => {
    const antiga = await requestRepo.create(inputBase({ codigoInterno: 'GD-dash-5' }), [fotoBase]);
    await prisma.request.update({
      where: { id: antiga.id },
      data: { createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
    });
    await requestRepo.create(inputBase({ codigoInterno: 'GD-dash-6' }), [fotoBase]);

    const resumo = await dashboardRepo.resumo();

    const parada = resumo.paradas.find((p) => p.codigoInterno === 'GD-dash-5');
    const recente = resumo.paradas.find((p) => p.codigoInterno === 'GD-dash-6');
    expect(parada).toBeTruthy();
    expect(parada?.diasParada).toBeGreaterThanOrEqual(5);
    expect(recente).toBeUndefined();
  }, 20000);

  it('usa a data da mudança de status mais recente quando existe histórico', async () => {
    const demanda = await requestRepo.create(inputBase({ codigoInterno: 'GD-dash-7' }), [fotoBase]);
    await prisma.request.update({
      where: { id: demanda.id },
      data: { createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
    });
    await requestRepo.updateStatus(demanda.id, 'RECEBIDA', assessorId);
    await prisma.requestStatusHistory.updateMany({
      where: { requestId: demanda.id },
      data: { createdAt: new Date() },
    });

    const resumo = await dashboardRepo.resumo();

    const item = resumo.paradas.find((p) => p.codigoInterno === 'GD-dash-7');
    expect(item).toBeUndefined(); // mudou de status agora, não está parada
  }, 20000);

  it('não inclui demandas finalizadas mesmo se antigas', async () => {
    const demanda = await requestRepo.create(inputBase({ codigoInterno: 'GD-dash-8' }), [fotoBase]);
    await prisma.request.update({
      where: { id: demanda.id },
      data: { createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    });
    await requestRepo.updateStatus(demanda.id, 'RECUSADA', assessorId, 'Duplicado');

    const resumo = await dashboardRepo.resumo();

    expect(resumo.paradas.find((p) => p.codigoInterno === 'GD-dash-8')).toBeUndefined();
  }, 20000);
});
