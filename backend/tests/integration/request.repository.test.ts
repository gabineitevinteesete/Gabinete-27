import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createRequestRepository, type CriarRequestInput } from '../../src/repositories/request.repository.js';

const prisma = new PrismaClient();
const requestRepo = createRequestRepository(prisma);

let tipoId: string;
let assessorId: string;

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await prisma.requestPhoto.deleteMany();
  await prisma.request.deleteMany();
  await prisma.requestType.deleteMany();
  // refreshToken precisa ser limpo antes de user por causa da FK RESTRICT — outros
  // arquivos de teste de integração que compartilham este mesmo Postgres (ex.:
  // reset-db.ts, repositories.test.ts) seguem o mesmo cuidado.
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  const tipo = await prisma.requestType.create({
    data: { nome: 'Tapa-buraco', ativo: true, exigeDescricaoObrigatoria: false },
  });
  tipoId = tipo.id;

  const assessor = await prisma.user.create({
    data: { nome: 'Assessor Teste', telefone: '+5534999996100', role: 'ASSESSOR_RUA' },
  });
  assessorId = assessor.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

function inputBase(overrides: Partial<CriarRequestInput> = {}): CriarRequestInput {
  return {
    codigoInterno: 'GD-20260830-0001',
    solicitanteNome: 'Maria Solicitante',
    solicitanteTelefone: '+5534999990000',
    tituloResumido: 'Buraco na rua',
    descricao: 'Buraco grande em frente ao número 100',
    requestTypeId: tipoId,
    assessorResponsavelId: assessorId,
    autorizacaoDados: true,
    bairro: 'Centro',
    ...overrides,
  };
}

const fotoBase = { url: 'https://cdn.example/a.jpg', publicId: 'a', larguraPx: 800, alturaPx: 600, bytes: 12345 };

describe('RequestRepository.create', () => {
  it('cria a demanda com status ENVIADA e as fotos vinculadas', async () => {
    const criado = await requestRepo.create(inputBase(), [fotoBase, { ...fotoBase, publicId: 'b', url: 'https://cdn.example/b.jpg' }]);

    expect(criado.status).toBe('ENVIADA');
    expect(criado.fotos).toHaveLength(2);
    expect(criado.assessorResponsavelNome).toBe('Assessor Teste');
    expect(criado.requestTypeNome).toBe('Tapa-buraco');
  });
});

describe('RequestRepository.findById', () => {
  it('retorna null quando não existe', async () => {
    const encontrado = await requestRepo.findById('00000000-0000-0000-0000-000000000000');
    expect(encontrado).toBeNull();
  });

  it('retorna o detalhe completo quando existe', async () => {
    const criado = await requestRepo.create(inputBase(), [fotoBase]);
    const encontrado = await requestRepo.findById(criado.id);
    expect(encontrado?.solicitanteNome).toBe('Maria Solicitante');
    expect(encontrado?.fotos).toHaveLength(1);
  });
});

describe('RequestRepository.list', () => {
  it('filtra por bairro e pagina os resultados', async () => {
    await requestRepo.create(inputBase({ codigoInterno: 'GD-1', bairro: 'Centro' }), [fotoBase]);
    await requestRepo.create(inputBase({ codigoInterno: 'GD-2', bairro: 'Centro' }), [fotoBase]);
    await requestRepo.create(inputBase({ codigoInterno: 'GD-3', bairro: 'Vila Nova' }), [fotoBase]);

    const resultado = await requestRepo.list({ bairro: 'Centro' }, { pagina: 1, tamanhoPagina: 10 });
    expect(resultado.total).toBe(2);
    expect(resultado.items).toHaveLength(2);
  });

  it('respeita o tamanho de página', async () => {
    for (let i = 0; i < 5; i++) {
      await requestRepo.create(inputBase({ codigoInterno: `GD-pag-${i}` }), [fotoBase]);
    }

    const pagina1 = await requestRepo.list({}, { pagina: 1, tamanhoPagina: 2 });
    expect(pagina1.items).toHaveLength(2);
    expect(pagina1.total).toBe(5);

    const pagina3 = await requestRepo.list({}, { pagina: 3, tamanhoPagina: 2 });
    expect(pagina3.items).toHaveLength(1);
  });

  it('filtra por assessor responsável', async () => {
    const outroAssessor = await prisma.user.create({
      data: { nome: 'Outro Assessor', telefone: '+5534999996200', role: 'ASSESSOR_RUA' },
    });
    await requestRepo.create(inputBase({ codigoInterno: 'GD-meu' }), [fotoBase]);
    await requestRepo.create(inputBase({ codigoInterno: 'GD-outro', assessorResponsavelId: outroAssessor.id }), [fotoBase]);

    const resultado = await requestRepo.list({ assessorResponsavelId: assessorId }, { pagina: 1, tamanhoPagina: 10 });
    expect(resultado.total).toBe(1);
    expect(resultado.items[0]?.codigoInterno).toBe('GD-meu');
  });
});

describe('RequestRepository.update', () => {
  it('atualiza os campos informados e mantém os demais', async () => {
    const criado = await requestRepo.create(inputBase(), [fotoBase]);
    const atualizado = await requestRepo.update(criado.id, { tituloResumido: 'Buraco corrigido', bairro: 'Novo Bairro' });

    expect(atualizado.tituloResumido).toBe('Buraco corrigido');
    expect(atualizado.bairro).toBe('Novo Bairro');
    expect(atualizado.solicitanteNome).toBe('Maria Solicitante');
  });
});
