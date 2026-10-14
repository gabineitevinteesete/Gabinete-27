import { describe, it, expect, vi, afterEach } from 'vitest';
import sharp from 'sharp';
import { RequestService } from '../../src/services/request.service.js';
import { TransicaoConcorrenteError } from '../../src/utils/request-status.js';
import { NotificacaoService } from '../../src/services/notificacao.service.js';
import {
  createFakeRequestTypeRepo,
  createFakeRequestRepo,
  createFakePhotoUploader,
  createFakeUserRepo,
  createFakeAuditLogRepo,
  createFakeNotificationRepo,
} from '../helpers/fakes.js';

function pessoa(id: string, role: 'CHEFE' | 'ASSESSOR_RUA' | 'ASSESSOR_GABINETE') {
  return {
    id,
    nome: `Pessoa ${id}`,
    telefone: `+55349999${id.padStart(5, '0')}`,
    role,
    ativo: true,
    pinDefinido: true,
    pinHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function build(comNotificacoes = true) {
  const userRepo = createFakeUserRepo([pessoa('chefe-1', 'CHEFE'), pessoa('rua-1', 'ASSESSOR_RUA'), pessoa('rua-2', 'ASSESSOR_RUA')]);
  const requestRepo = createFakeRequestRepo();
  const notificationRepo = createFakeNotificationRepo();
  const service = new RequestService({
    requestRepo,
    requestTypeRepo: createFakeRequestTypeRepo([{ id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true }]),
    photoUploader: createFakePhotoUploader(),
    userRepo,
    auditLogRepo: createFakeAuditLogRepo(),
    notificacaoService: comNotificacoes ? new NotificacaoService({ notificationRepo, userRepo }) : undefined,
  });
  return { service, requestRepo, notificationRepo };
}

async function foto(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 1, g: 2, b: 3 } } }).jpeg().toBuffer();
}

async function criar(service: RequestService, criadoPor = 'rua-1') {
  const resultado = await service.criar({
    solicitanteNome: 'Maria',
    solicitanteTelefone: '+5534999990000',
    localExato: 'Rua A',
    tituloResumido: 'Buraco',
    descricao: 'Grande',
    requestTypeId: 'tipo-1',
    autorizacaoDados: true,
    assessorResponsavelId: criadoPor,
    fotos: [await foto(), await foto()],
  });
  if (resultado.status !== 'ok') throw new Error('esperava ok');
  return resultado.demanda;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RequestService — avisos', () => {
  it('criar demanda avisa o chefe', async () => {
    const { service, notificationRepo } = build();

    const demanda = await criar(service);

    expect(notificationRepo.criadas).toEqual([
      {
        userId: 'chefe-1',
        requestId: demanda.id,
        tipo: 'DEMANDA_NOVA',
        mensagem: `Nova demanda ${demanda.codigoInterno} registrada.`,
      },
    ]);
  });

  it('mudar o status avisa o responsável quando quem mudou foi outra pessoa', async () => {
    const { service, notificationRepo } = build();
    const demanda = await criar(service);
    notificationRepo.criadas.length = 0;

    const resultado = await service.mudarStatus(demanda.id, 'RECEBIDA', undefined, 'chefe-1');

    expect(resultado.status).toBe('ok');
    expect(notificationRepo.criadas).toEqual([
      {
        userId: 'rua-1',
        requestId: demanda.id,
        tipo: 'STATUS_ALTERADO',
        mensagem: `A demanda ${demanda.codigoInterno} passou para "Recebida".`,
      },
    ]);
  });

  it('transição inválida não gera aviso', async () => {
    const { service, notificationRepo } = build();
    const demanda = await criar(service);
    notificationRepo.criadas.length = 0;

    const resultado = await service.mudarStatus(demanda.id, 'CONCLUIDA', undefined, 'chefe-1');

    expect(resultado.status).toBe('transicao_invalida');
    expect(notificationRepo.criadas).toHaveLength(0);
  });

  it('reatribuir avisa o novo responsável; reatribuir para quem já é o responsável não avisa', async () => {
    const { service, notificationRepo } = build();
    const demanda = await criar(service);
    notificationRepo.criadas.length = 0;

    await service.reatribuir(demanda.id, 'rua-2', 'chefe-1');
    expect(notificationRepo.criadas).toEqual([
      {
        userId: 'rua-2',
        requestId: demanda.id,
        tipo: 'DEMANDA_REATRIBUIDA',
        mensagem: `Você recebeu a demanda ${demanda.codigoInterno}.`,
      },
    ]);

    notificationRepo.criadas.length = 0;
    await service.reatribuir(demanda.id, 'rua-2', 'chefe-1');
    expect(notificationRepo.criadas).toHaveLength(0);
  });

  it('se criar o aviso falhar, a ação principal continua concluída e o erro vai para o log', async () => {
    const { service, requestRepo, notificationRepo } = build();
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    notificationRepo.create = async () => {
      throw new Error('banco fora do ar');
    };

    const demanda = await criar(service);
    const resultado = await service.mudarStatus(demanda.id, 'RECEBIDA', undefined, 'chefe-1');

    expect(requestRepo.created).toHaveLength(1);
    expect(resultado.status).toBe('ok');
    expect(erro).toHaveBeenCalled();
  });

  it('o motivo digitado ao recusar NUNCA aparece no texto do aviso', async () => {
    const { service, notificationRepo } = build();
    const demanda = await criar(service);
    notificationRepo.criadas.length = 0;

    const resultado = await service.mudarStatus(demanda.id, 'RECUSADA', 'SEGREDO-XYZ telefone 34 99999-0000', 'chefe-1');

    expect(resultado.status).toBe('ok');
    expect(notificationRepo.criadas).toHaveLength(1);
    expect(notificationRepo.criadas[0]!.mensagem).toBe(`A demanda ${demanda.codigoInterno} passou para "Recusada".`);
    expect(JSON.stringify(notificationRepo.criadas)).not.toMatch(/SEGREDO|99999/);
  });

  it('se a mudança de status perder a corrida (transição concorrente), nenhum aviso sai', async () => {
    const { service, requestRepo, notificationRepo } = build();
    const demanda = await criar(service);
    notificationRepo.criadas.length = 0;
    requestRepo.updateStatus = async () => {
      throw new TransicaoConcorrenteError();
    };

    const resultado = await service.mudarStatus(demanda.id, 'RECEBIDA', undefined, 'chefe-1');

    expect(resultado.status).toBe('transicao_invalida');
    expect(notificationRepo.criadas).toHaveLength(0);
  });

  it('falha ao criar o aviso na reatribuição também não derruba a ação e é registrada no log', async () => {
    const { service, notificationRepo } = build();
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const demanda = await criar(service);
    notificationRepo.create = async () => {
      throw new Error('banco fora do ar');
    };

    const resultado = await service.reatribuir(demanda.id, 'rua-2', 'chefe-1');

    expect(resultado.status).toBe('ok');
    expect(erro).toHaveBeenCalledTimes(1);
  });

  it('sem o serviço de avisos o comportamento é o de sempre', async () => {
    const { service } = build(false);

    const demanda = await criar(service);
    const resultado = await service.mudarStatus(demanda.id, 'RECEBIDA', undefined, 'chefe-1');

    expect(resultado.status).toBe('ok');
  });
});
