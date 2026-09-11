import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createRequestRepository, type CriarRequestInput } from '../../src/repositories/request.repository.js';
import { TransicaoConcorrenteError } from '../../src/utils/request-status.js';
import { AVISO_PRIVACIDADE_TEXTO_ATUAL } from '../../src/utils/aviso-privacidade.js';

const prisma = new PrismaClient();
const requestRepo = createRequestRepository(prisma);

let tipoId: string;
let assessorId: string;

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await prisma.requestPhoto.deleteMany();
  // requestStatusHistory/requestReassignmentHistory referenciam request com FK RESTRICT
  // (Task 3 adicionou linhas nessas tabelas) — precisam ser limpas antes de request.deleteMany().
  await prisma.requestStatusHistory.deleteMany();
  await prisma.requestReassignmentHistory.deleteMany();
  // internalNote também referencia request com FK RESTRICT — precisa ser limpa antes de
  // request.deleteMany() (o arquivo internal-note.routes.test.ts pode deixar notas para
  // trás quando os testes são rodados em conjunto/fora de ordem).
  await prisma.internalNote.deleteMany();
  await prisma.privacyConsent.deleteMany();
  await prisma.request.deleteMany();
  await prisma.requestType.deleteMany();
  // dutyRosterEntry referencia user com FK RESTRICT — precisa ser limpa antes de
  // user.deleteMany() (outro arquivo de teste pode deixar entradas de escala para
  // trás quando os testes são rodados em conjunto/fora de ordem).
  await prisma.dutyRosterEntry.deleteMany();
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
    criadoPorId: assessorId,
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
  // Cria vários registros em sequência contra o Postgres real (Neon, via rede); medido em
  // ~6s neste ambiente, acima do timeout padrão de 5s do Vitest. Timeout ampliado apenas
  // neste teste em vez de globalmente, para não mascarar travamentos/regressões N+1 em
  // outros testes do restante da suíte.
  it('filtra por bairro e pagina os resultados', async () => {
    await requestRepo.create(inputBase({ codigoInterno: 'GD-1', bairro: 'Centro' }), [fotoBase]);
    await requestRepo.create(inputBase({ codigoInterno: 'GD-2', bairro: 'Centro' }), [fotoBase]);
    await requestRepo.create(inputBase({ codigoInterno: 'GD-3', bairro: 'Vila Nova' }), [fotoBase]);

    const resultado = await requestRepo.list({ bairro: 'Centro' }, { pagina: 1, tamanhoPagina: 10 });
    expect(resultado.total).toBe(2);
    expect(resultado.items).toHaveLength(2);
  }, 20000);

  // Cria 5 registros em sequência; medido em ~11s neste ambiente. Mesmo raciocínio acima:
  // timeout ampliado só aqui, não globalmente.
  it('respeita o tamanho de página', async () => {
    for (let i = 0; i < 5; i++) {
      await requestRepo.create(inputBase({ codigoInterno: `GD-pag-${i}` }), [fotoBase]);
    }

    const pagina1 = await requestRepo.list({}, { pagina: 1, tamanhoPagina: 2 });
    expect(pagina1.items).toHaveLength(2);
    expect(pagina1.total).toBe(5);

    const pagina3 = await requestRepo.list({}, { pagina: 3, tamanhoPagina: 2 });
    expect(pagina3.items).toHaveLength(1);
  }, 20000);

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

describe('RequestRepository.updateStatus', () => {
  // Margem observada perto do timeout padrão de 5000ms sob latência real do Neon (1
  // create + 1 updateStatus, cada um sua própria transação, + 1 leitura); ampliado só
  // aqui pelo mesmo motivo dos demais testes desta suíte.
  it('atualiza o status e grava uma linha no histórico', async () => {
    const criado = await requestRepo.create(inputBase({ codigoInterno: 'GD-status-1' }), [fotoBase]);

    const atualizada = await requestRepo.updateStatus(criado.id, 'RECEBIDA', assessorId);

    expect(atualizada.status).toBe('RECEBIDA');
    const historico = await prisma.requestStatusHistory.findMany({ where: { requestId: criado.id } });
    expect(historico).toHaveLength(1);
    expect(historico[0]?.statusAnterior).toBe('ENVIADA');
    expect(historico[0]?.statusNovo).toBe('RECEBIDA');
    expect(historico[0]?.usuarioId).toBe(assessorId);
    expect(historico[0]?.observacao).toBeNull();
  }, 20000);

  // 1 create + 3 updateStatus em sequência contra o Neon real; mesmo raciocínio dos testes
  // de paginação acima (timeout ampliado só aqui, não globalmente).
  it('grava o motivo quando informado', async () => {
    const criado = await requestRepo.create(inputBase({ codigoInterno: 'GD-status-2' }), [fotoBase]);
    await requestRepo.updateStatus(criado.id, 'RECEBIDA', assessorId);
    await requestRepo.updateStatus(criado.id, 'EM_CONFERENCIA', assessorId);

    await requestRepo.updateStatus(criado.id, 'PENDENTE_INFORMACAO', assessorId, 'Falta o telefone do solicitante');

    const historico = await prisma.requestStatusHistory.findMany({
      where: { requestId: criado.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(historico).toHaveLength(3);
    expect(historico[2]?.observacao).toBe('Falta o telefone do solicitante');
  }, 20000);

  // 1 create + 2 updateStatus (cada um sua própria transação) + 1 leitura em sequência
  // contra o Neon real; mesmo raciocínio dos demais testes com timeout ampliado acima.
  it('grava arquivadoEm ao entrar em ARQUIVADA', async () => {
    const criado = await requestRepo.create(inputBase({ codigoInterno: 'GD-status-3' }), [fotoBase]);
    await requestRepo.updateStatus(criado.id, 'RECUSADA', assessorId, 'Duplicado');

    await requestRepo.updateStatus(criado.id, 'ARQUIVADA', assessorId);

    const linha = await prisma.request.findUniqueOrThrow({ where: { id: criado.id } });
    expect(linha.arquivadoEm).not.toBeNull();
  }, 20000);

  // Prova a revalidação dentro da transação sem precisar de concorrência real: a primeira
  // chamada já consumiu a transição, então a segunda chega com uma origem obsoleta —
  // exatamente o que uma requisição concorrente veria.
  it('rejeita uma transição que deixou de ser válida entre a leitura do service e a gravação', async () => {
    const criado = await requestRepo.create(inputBase({ codigoInterno: 'GD-status-4' }), [fotoBase]);
    await requestRepo.updateStatus(criado.id, 'RECEBIDA', assessorId);

    await expect(requestRepo.updateStatus(criado.id, 'RECEBIDA', assessorId)).rejects.toBeInstanceOf(
      TransicaoConcorrenteError,
    );

    const historico = await prisma.requestStatusHistory.findMany({ where: { requestId: criado.id } });
    expect(historico).toHaveLength(1);
  }, 20000);
});

describe('RequestRepository.listarHistoricoStatus', () => {
  it('lista o histórico mais recente primeiro, com o nome de quem alterou', async () => {
    const criado = await requestRepo.create(inputBase({ codigoInterno: 'GD-hist-1' }), [fotoBase]);
    await requestRepo.updateStatus(criado.id, 'RECEBIDA', assessorId);
    await requestRepo.updateStatus(criado.id, 'EM_CONFERENCIA', assessorId);

    const historico = await requestRepo.listarHistoricoStatus(criado.id);

    expect(historico).toHaveLength(2);
    expect(historico[0]?.statusNovo).toBe('EM_CONFERENCIA');
    expect(historico[1]?.statusNovo).toBe('RECEBIDA');
    expect(historico[0]?.usuarioNome).toBe('Assessor Teste');
  }, 20000);

  it('retorna lista vazia para uma demanda sem mudança de status', async () => {
    const criado = await requestRepo.create(inputBase({ codigoInterno: 'GD-hist-2' }), [fotoBase]);

    const historico = await requestRepo.listarHistoricoStatus(criado.id);

    expect(historico).toEqual([]);
  });
});

describe('RequestRepository.reatribuir', () => {
  // 1 create + 2 user.create + 1 reatribuir (transação) + 1 leitura em sequência contra
  // o Neon real; mesma margem apertada observada nos demais testes desta suíte.
  it('atualiza o assessor responsável e grava uma linha no histórico de reatribuição', async () => {
    const criado = await requestRepo.create(inputBase({ codigoInterno: 'GD-reatrib-1' }), [fotoBase]);
    const novoAssessor = await prisma.user.create({
      data: { nome: 'Novo Assessor', telefone: '+5534999996300', role: 'ASSESSOR_GABINETE' },
    });
    const chefe = await prisma.user.create({
      data: { nome: 'Chefe Teste', telefone: '+5534999996400', role: 'CHEFE' },
    });

    const atualizada = await requestRepo.reatribuir(criado.id, novoAssessor.id, chefe.id);

    expect(atualizada.assessorResponsavelId).toBe(novoAssessor.id);
    const historico = await prisma.requestReassignmentHistory.findMany({ where: { requestId: criado.id } });
    expect(historico).toHaveLength(1);
    expect(historico[0]?.assessorAnteriorId).toBe(assessorId);
    expect(historico[0]?.assessorNovoId).toBe(novoAssessor.id);
    expect(historico[0]?.reatribuidoPorId).toBe(chefe.id);
  }, 20000);
});

describe('RequestRepository.create — criadoPorId', () => {
  it('grava criadoPorId igual a assessorResponsavelId no momento da criação', async () => {
    const criado = await requestRepo.create(inputBase({ codigoInterno: 'GD-criador-1' }), [fotoBase]);

    const linha = await prisma.request.findUniqueOrThrow({ where: { id: criado.id } });
    expect(linha.criadoPorId).toBe(assessorId);
  });

  it('criadoPorId não muda depois de uma reatribuição', async () => {
    const criado = await requestRepo.create(inputBase({ codigoInterno: 'GD-criador-2' }), [fotoBase]);
    const novoAssessor = await prisma.user.create({
      data: { nome: 'Novo Assessor', telefone: '+5534999996500', role: 'ASSESSOR_GABINETE' },
    });

    await requestRepo.reatribuir(criado.id, novoAssessor.id, novoAssessor.id);

    const linha = await prisma.request.findUniqueOrThrow({ where: { id: criado.id } });
    expect(linha.criadoPorId).toBe(assessorId);
    expect(linha.assessorResponsavelId).toBe(novoAssessor.id);
  });
});

describe('RequestRepository.create — PrivacyConsent', () => {
  it('grava um PrivacyConsent com o texto vigente ao criar a demanda', async () => {
    // inputBase() já preenche autorizacaoDados: true por padrão.
    const criado = await requestRepo.create(inputBase(), []);

    const consentimento = await prisma.privacyConsent.findUnique({ where: { requestId: criado.id } });

    expect(consentimento).not.toBeNull();
    expect(consentimento?.autorizado).toBe(true);
    expect(consentimento?.textoVersao).toBe(AVISO_PRIVACIDADE_TEXTO_ATUAL);
  });

  it('grava autorizado: false quando o input não autoriza', async () => {
    const criado = await requestRepo.create(inputBase({ autorizacaoDados: false }), []);

    const consentimento = await prisma.privacyConsent.findUnique({ where: { requestId: criado.id } });

    expect(consentimento?.autorizado).toBe(false);
  });
});
