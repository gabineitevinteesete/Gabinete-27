import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { RequestService } from '../../src/services/request.service.js';
import {
  createFakeRequestTypeRepo,
  createFakeRequestRepo,
  createFakePhotoUploader,
  createFakeUserRepo,
  createFakeAuditLogRepo,
} from '../helpers/fakes.js';

const CHAVE = '3f8b6a52-5d4e-4c4e-9a53-1c1f2a9d7b10';

async function fotoValida(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 10, g: 20, b: 30 } } }).jpeg().toBuffer();
}

function buildService() {
  const requestTypeRepo = createFakeRequestTypeRepo([
    { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true },
  ]);
  const requestRepo = createFakeRequestRepo();
  const photoUploader = createFakePhotoUploader();
  const auditLogRepo = createFakeAuditLogRepo();
  const service = new RequestService({
    requestRepo,
    requestTypeRepo,
    photoUploader,
    userRepo: createFakeUserRepo(),
    auditLogRepo,
  });
  return { service, requestRepo, photoUploader, auditLogRepo };
}

async function inputBase(overrides: Record<string, unknown> = {}) {
  return {
    solicitanteNome: 'Maria Solicitante',
    solicitanteTelefone: '+5534999990000',
    localExato: 'Em frente ao número 100',
    tituloResumido: 'Buraco na rua',
    descricao: 'Buraco grande',
    requestTypeId: 'tipo-1',
    autorizacaoDados: true,
    assessorResponsavelId: 'user-1',
    fotos: [await fotoValida(), await fotoValida()],
    ...overrides,
  };
}

describe('RequestService.criar — chave de idempotência', () => {
  it('um reenvio com a mesma chave devolve a demanda já criada, sem fotos novas nem nova auditoria', async () => {
    const { service, requestRepo, photoUploader, auditLogRepo } = buildService();
    const primeiro = await service.criar(await inputBase({ idempotencyKey: CHAVE }));
    expect(primeiro.status).toBe('ok');
    if (primeiro.status !== 'ok') return;

    const reenvio = await service.criar(await inputBase({ idempotencyKey: CHAVE }));

    expect(reenvio.status).toBe('ok');
    if (reenvio.status !== 'ok') return;
    expect(reenvio.demanda.id).toBe(primeiro.demanda.id);
    expect(requestRepo.created).toHaveLength(1);
    expect(photoUploader.uploads).toHaveLength(2);
    expect(auditLogRepo.records).toHaveLength(1);
  });

  it('o reenvio devolve a demanda mesmo que o corpo reenviado venha incompleto (já foi aceita antes)', async () => {
    const { service } = buildService();
    const primeiro = await service.criar(await inputBase({ idempotencyKey: CHAVE }));
    if (primeiro.status !== 'ok') throw new Error('esperava ok');

    const reenvio = await service.criar(await inputBase({ idempotencyKey: CHAVE, fotos: [] }));

    expect(reenvio.status).toBe('ok');
    if (reenvio.status !== 'ok') return;
    expect(reenvio.demanda.id).toBe(primeiro.demanda.id);
  });

  it('outro usuário com a mesma chave cria a própria demanda', async () => {
    const { service, requestRepo } = buildService();
    await service.criar(await inputBase({ idempotencyKey: CHAVE }));

    const outro = await service.criar(await inputBase({ idempotencyKey: CHAVE, assessorResponsavelId: 'user-2' }));

    expect(outro.status).toBe('ok');
    expect(requestRepo.created).toHaveLength(2);
  });

  it('chaves diferentes criam demandas diferentes', async () => {
    const { service, requestRepo } = buildService();

    await service.criar(await inputBase({ idempotencyKey: CHAVE }));
    await service.criar(await inputBase({ idempotencyKey: '8a1d6f20-0c0a-4f6e-8d3b-2f9f3c7a1e55' }));

    expect(requestRepo.created).toHaveLength(2);
  });

  it('sem chave, cada envio cria uma demanda (comportamento de antes)', async () => {
    const { service, requestRepo } = buildService();

    await service.criar(await inputBase());
    await service.criar(await inputBase());

    expect(requestRepo.created).toHaveLength(2);
  });

  it('grava a chave junto da demanda criada', async () => {
    const { service, requestRepo } = buildService();

    await service.criar(await inputBase({ idempotencyKey: CHAVE }));

    expect(requestRepo.created[0]!.input.idempotencyKey).toBe(CHAVE);
  });

  it('corrida: se o índice único barrar o segundo envio (P2002), apaga as fotos subidas e devolve a demanda do primeiro', async () => {
    const { service, requestRepo, photoUploader, auditLogRepo } = buildService();
    const original = requestRepo.create.bind(requestRepo);
    let primeiraChamada = true;
    // Simula o outro envio gravando entre a nossa checagem inicial e o nosso create.
    requestRepo.create = async (input, fotos) => {
      if (primeiraChamada) {
        primeiraChamada = false;
        await original({ ...input }, []);
        const erro = new Error('Unique constraint failed') as Error & { code: string };
        erro.code = 'P2002';
        throw erro;
      }
      return original(input, fotos);
    };

    const resultado = await service.criar(await inputBase({ idempotencyKey: CHAVE }));

    expect(resultado.status).toBe('ok');
    if (resultado.status !== 'ok') return;
    expect(requestRepo.created).toHaveLength(1);
    expect(photoUploader.uploads).toHaveLength(2);
    expect(photoUploader.deleted).toHaveLength(2);
    expect(auditLogRepo.records).toHaveLength(0);
    expect(resultado.demanda.id).toBe('fake-request-1');
  });

  it('erro de banco que não é conflito de chave continua sendo lançado', async () => {
    const { service, requestRepo } = buildService();
    requestRepo.create = async () => {
      throw new Error('falha de conexão');
    };

    await expect(service.criar(await inputBase({ idempotencyKey: CHAVE }))).rejects.toThrow('falha de conexão');
  });
});
