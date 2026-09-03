import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createInternalNoteRepository } from '../../src/repositories/internal-note.repository.js';
import { createRequestRepository, type CriarRequestInput } from '../../src/repositories/request.repository.js';

const prisma = new PrismaClient();
const internalNoteRepo = createInternalNoteRepository(prisma);
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
    data: { nome: 'Assessor Teste', telefone: '+5534999997100', role: 'ASSESSOR_GABINETE' },
  });
  assessorId = assessor.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

function inputBase(overrides: Partial<CriarRequestInput> = {}): CriarRequestInput {
  return {
    codigoInterno: 'GD-obs-0001',
    solicitanteNome: 'Maria Solicitante',
    solicitanteTelefone: '+5534999990000',
    tituloResumido: 'Buraco na rua',
    descricao: 'Buraco grande em frente ao número 100',
    requestTypeId: tipoId,
    assessorResponsavelId: assessorId,
    autorizacaoDados: true,
    ...overrides,
  };
}

const fotoBase = { url: 'https://cdn.example/a.jpg', publicId: 'a', larguraPx: 800, alturaPx: 600, bytes: 12345 };

async function criarDemanda(codigoInterno: string) {
  return requestRepo.create(inputBase({ codigoInterno }), [fotoBase]);
}

describe('InternalNoteRepository.create', () => {
  it('cria a observação com autor e sem updatedAt', async () => {
    const demanda = await criarDemanda('GD-obs-1');

    const criada = await internalNoteRepo.create(demanda.id, assessorId, 'Liguei pra prefeitura');

    expect(criada.texto).toBe('Liguei pra prefeitura');
    expect(criada.autorId).toBe(assessorId);
    expect(criada.autorNome).toBe('Assessor Teste');
    expect(criada.requestId).toBe(demanda.id);
    expect(criada.updatedAt).toBeNull();
  });
});

describe('InternalNoteRepository.list', () => {
  it('lista as observações da demanda, mais recente primeiro', async () => {
    const demanda = await criarDemanda('GD-obs-2');
    await internalNoteRepo.create(demanda.id, assessorId, 'Primeira nota');
    await internalNoteRepo.create(demanda.id, assessorId, 'Segunda nota');

    const lista = await internalNoteRepo.list(demanda.id);

    expect(lista).toHaveLength(2);
    expect(lista[0]?.texto).toBe('Segunda nota');
    expect(lista[1]?.texto).toBe('Primeira nota');
  });

  it('não retorna observações de outra demanda', async () => {
    const demandaA = await criarDemanda('GD-obs-3');
    const demandaB = await criarDemanda('GD-obs-4');
    await internalNoteRepo.create(demandaA.id, assessorId, 'Nota da A');
    await internalNoteRepo.create(demandaB.id, assessorId, 'Nota da B');

    const lista = await internalNoteRepo.list(demandaA.id);

    expect(lista).toHaveLength(1);
    expect(lista[0]?.texto).toBe('Nota da A');
  });
});

describe('InternalNoteRepository.findById', () => {
  it('retorna null quando não existe', async () => {
    const encontrada = await internalNoteRepo.findById('00000000-0000-0000-0000-000000000000');
    expect(encontrada).toBeNull();
  });

  it('retorna a observação quando existe', async () => {
    const demanda = await criarDemanda('GD-obs-5');
    const criada = await internalNoteRepo.create(demanda.id, assessorId, 'Nota');

    const encontrada = await internalNoteRepo.findById(criada.id);

    expect(encontrada?.texto).toBe('Nota');
  });
});

describe('InternalNoteRepository.update', () => {
  it('atualiza o texto e grava updatedAt', async () => {
    const demanda = await criarDemanda('GD-obs-6');
    const criada = await internalNoteRepo.create(demanda.id, assessorId, 'Texto original');

    const atualizada = await internalNoteRepo.update(criada.id, 'Texto corrigido');

    expect(atualizada.texto).toBe('Texto corrigido');
    expect(atualizada.updatedAt).not.toBeNull();
  });
});

describe('InternalNoteRepository.delete', () => {
  it('remove a observação', async () => {
    const demanda = await criarDemanda('GD-obs-7');
    const criada = await internalNoteRepo.create(demanda.id, assessorId, 'Nota a apagar');

    await internalNoteRepo.delete(criada.id);

    const encontrada = await internalNoteRepo.findById(criada.id);
    expect(encontrada).toBeNull();
  });
});
