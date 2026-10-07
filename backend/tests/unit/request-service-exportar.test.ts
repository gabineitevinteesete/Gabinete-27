import { describe, it, expect } from 'vitest';
import { RequestService } from '../../src/services/request.service.js';
import {
  createFakeRequestTypeRepo,
  createFakeRequestRepo,
  createFakePhotoUploader,
  createFakeUserRepo,
  createFakeAuditLogRepo,
} from '../helpers/fakes.js';

function buildService() {
  const requestTypeRepo = createFakeRequestTypeRepo([
    { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true },
  ]);
  const requestRepo = createFakeRequestRepo();
  const auditLogRepo = createFakeAuditLogRepo();
  const service = new RequestService({
    requestRepo,
    requestTypeRepo,
    photoUploader: createFakePhotoUploader(),
    userRepo: createFakeUserRepo(),
    auditLogRepo,
  });
  return { service, requestRepo, auditLogRepo };
}

async function criarDemanda(
  requestRepo: ReturnType<typeof createFakeRequestRepo>,
  overrides: { codigoInterno?: string; bairro?: string; solicitanteNome?: string } = {},
) {
  return requestRepo.create(
    {
      codigoInterno: overrides.codigoInterno ?? 'GD-1',
      solicitanteNome: overrides.solicitanteNome ?? 'Maria Solicitante',
      solicitanteTelefone: '+5534999990000',
      bairro: overrides.bairro ?? 'Centro',
      tituloResumido: 'Buraco na rua',
      descricao: 'Descrição sigilosa',
      requestTypeId: 'tipo-1',
      assessorResponsavelId: 'user-a',
      criadoPorId: 'user-a',
      autorizacaoDados: true,
    },
    [],
  );
}

describe('RequestService.exportar', () => {
  it('formata "Criada em" no fuso de São Paulo e neutraliza fórmula em texto livre', async () => {
    const { service, requestRepo } = buildService();
    // 02:00Z em 8/out ainda é 23:00 de 7/out em São Paulo (UTC-3).
    const demanda = await criarDemanda(requestRepo, { solicitanteNome: '=HYPERLINK("x")' });
    (demanda as { createdAt: Date }).createdAt = new Date('2026-10-08T02:00:00.000Z');

    const resultado = await service.exportar({}, 'chefe-1');

    expect(resultado.status).toBe('ok');
    if (resultado.status !== 'ok') return;
    const linha = resultado.csv.replace('\uFEFF', '').trim().split('\r\n')[1]!;
    expect(linha.endsWith(';07/10/2026')).toBe(true);
    expect(linha).toContain('"\'=HYPERLINK(""x"")"');
  });

  it('gera o CSV com cabeçalho e uma linha por demanda, sem telefone nem descrição', async () => {
    const { service, requestRepo } = buildService();
    await criarDemanda(requestRepo);

    const resultado = await service.exportar({}, 'chefe-1');

    expect(resultado.status).toBe('ok');
    if (resultado.status !== 'ok') return;
    const linhas = resultado.csv.replace('﻿', '').trim().split('\r\n');
    expect(linhas[0]).toBe('Código;Título;Tipo;Status;Bairro;Solicitante;Assessor responsável;Criada em');
    expect(linhas).toHaveLength(2);
    expect(linhas[1]).toContain('GD-1;Buraco na rua;');
    expect(linhas[1]).toContain('Enviada');
    expect(linhas[1]).toContain('Centro;Maria Solicitante');
    expect(resultado.csv).not.toContain('+5534999990000');
    expect(resultado.csv).not.toContain('Descrição sigilosa');
    expect(resultado.quantidade).toBe(1);
  });

  it('respeita os filtros recebidos', async () => {
    const { service, requestRepo } = buildService();
    await criarDemanda(requestRepo, { codigoInterno: 'GD-1', bairro: 'Centro' });
    await criarDemanda(requestRepo, { codigoInterno: 'GD-2', bairro: 'Industrial' });

    const resultado = await service.exportar({ bairro: 'Industrial' }, 'chefe-1');

    expect(resultado.status).toBe('ok');
    if (resultado.status !== 'ok') return;
    expect(resultado.csv).toContain('GD-2');
    expect(resultado.csv).not.toContain('GD-1');
  });

  it('registra auditoria com a quantidade e sem os filtros', async () => {
    const { service, requestRepo, auditLogRepo } = buildService();
    await criarDemanda(requestRepo);

    await service.exportar({ solicitanteNome: 'Maria' }, 'chefe-1', '10.0.0.1');

    expect(auditLogRepo.records).toEqual([
      {
        actorUserId: 'chefe-1',
        acao: 'EXPORTAR_DEMANDAS',
        entidade: 'Request',
        detalhes: { quantidade: 1 },
        ip: '10.0.0.1',
      },
    ]);
  });

  it('acima do limite devolve limite_excedido, sem arquivo e sem auditoria', async () => {
    const { service, requestRepo, auditLogRepo } = buildService();
    await criarDemanda(requestRepo, { codigoInterno: 'GD-1' });
    await criarDemanda(requestRepo, { codigoInterno: 'GD-2' });
    await criarDemanda(requestRepo, { codigoInterno: 'GD-3' });

    const resultado = await service.exportar({}, 'chefe-1', undefined, 2);

    expect(resultado).toEqual({ status: 'limite_excedido', total: 3 });
    expect(auditLogRepo.records).toHaveLength(0);
  });

  it('exatamente no limite ainda exporta', async () => {
    const { service, requestRepo } = buildService();
    await criarDemanda(requestRepo, { codigoInterno: 'GD-1' });
    await criarDemanda(requestRepo, { codigoInterno: 'GD-2' });

    const resultado = await service.exportar({}, 'chefe-1', undefined, 2);

    expect(resultado.status).toBe('ok');
  });
});
