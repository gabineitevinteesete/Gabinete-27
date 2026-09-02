import { describe, it, expect } from 'vitest';
import { RequestService } from '../../src/services/request.service.js';
import { createFakeRequestTypeRepo, createFakeRequestRepo, createFakePhotoUploader, createFakeUserRepo } from '../helpers/fakes.js';

function buildService() {
  const requestTypeRepo = createFakeRequestTypeRepo([
    { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true },
  ]);
  const requestRepo = createFakeRequestRepo();
  const photoUploader = createFakePhotoUploader();
  const userRepo = createFakeUserRepo([
    { id: 'gabinete-1', nome: 'Gabinete', telefone: '+5534988880001', role: 'ASSESSOR_GABINETE', ativo: true, pinDefinido: true, pinHash: null, createdAt: new Date(), updatedAt: new Date() },
  ]);
  const service = new RequestService({ requestRepo, requestTypeRepo, photoUploader, userRepo });
  return { service, requestRepo, userRepo };
}

async function criarDemandaFake(requestRepo: ReturnType<typeof createFakeRequestRepo>, assessorId: string, status = 'ENVIADA') {
  const demanda = await requestRepo.create(
    {
      codigoInterno: `GD-${Math.random()}`,
      solicitanteNome: 'Solicitante',
      solicitanteTelefone: '+5534999990000',
      tituloResumido: 'Título',
      descricao: 'Descrição',
      requestTypeId: 'tipo-1',
      assessorResponsavelId: assessorId,
      autorizacaoDados: true,
    },
    [{ url: 'https://cdn/a.jpg', publicId: 'a', larguraPx: 10, alturaPx: 10, bytes: 100 }],
  );
  if (status !== 'ENVIADA') {
    await requestRepo.update(demanda.id, {});
    // força o status diretamente no fake para simular uma demanda já protocolada
    (demanda as { status: string }).status = status;
  }
  return demanda;
}

describe('RequestService.listar', () => {
  it('assessor de rua só vê as próprias demandas, mesmo tentando filtrar por outro assessor', async () => {
    const { service, requestRepo } = buildService();
    await criarDemandaFake(requestRepo, 'user-eu');
    await criarDemandaFake(requestRepo, 'user-outro');

    const resultado = await service.listar(
      { assessorResponsavelId: 'user-outro' },
      { pagina: 1, tamanhoPagina: 10 },
      { id: 'user-eu', role: 'ASSESSOR_RUA' },
    );

    expect(resultado.total).toBe(1);
    expect(resultado.items[0]?.assessorResponsavelId).toBe('user-eu');
  });

  it('gabinete vê todas e pode filtrar por um assessor específico', async () => {
    const { service, requestRepo } = buildService();
    await criarDemandaFake(requestRepo, 'user-a');
    await criarDemandaFake(requestRepo, 'user-b');

    const todas = await service.listar({}, { pagina: 1, tamanhoPagina: 10 }, { id: 'gabinete-1', role: 'ASSESSOR_GABINETE' });
    expect(todas.total).toBe(2);

    const filtradas = await service.listar(
      { assessorResponsavelId: 'user-a' },
      { pagina: 1, tamanhoPagina: 10 },
      { id: 'gabinete-1', role: 'ASSESSOR_GABINETE' },
    );
    expect(filtradas.total).toBe(1);
  });
});

describe('RequestService.buscarPorId', () => {
  it('assessor de rua acessa a própria demanda', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-eu');
    const resultado = await service.buscarPorId(demanda.id, { id: 'user-eu', role: 'ASSESSOR_RUA' });
    expect(resultado.status).toBe('ok');
  });

  it('assessor de rua não acessa demanda de outro assessor de rua', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-outro');
    const resultado = await service.buscarPorId(demanda.id, { id: 'user-eu', role: 'ASSESSOR_RUA' });
    expect(resultado.status).toBe('sem_permissao');
  });

  it('retorna nao_encontrada para um id inexistente', async () => {
    const { service } = buildService();
    const resultado = await service.buscarPorId('id-que-nao-existe', { id: 'user-eu', role: 'ASSESSOR_RUA' });
    expect(resultado.status).toBe('nao_encontrada');
  });

  it('gabinete acessa qualquer demanda', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-qualquer');
    const resultado = await service.buscarPorId(demanda.id, { id: 'gabinete-1', role: 'ASSESSOR_GABINETE' });
    expect(resultado.status).toBe('ok');
  });
});

describe('RequestService.editar', () => {
  it('assessor de rua edita a própria demanda antes de protocolada', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-eu');
    const resultado = await service.editar(demanda.id, { tituloResumido: 'Novo título' }, { id: 'user-eu', role: 'ASSESSOR_RUA' });
    expect(resultado.status).toBe('ok');
    if (resultado.status === 'ok') {
      expect(resultado.demanda.tituloResumido).toBe('Novo título');
    }
  });

  it('assessor de rua não edita depois de protocolada', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-eu', 'PROTOCOLADA');
    const resultado = await service.editar(demanda.id, { tituloResumido: 'Novo título' }, { id: 'user-eu', role: 'ASSESSOR_RUA' });
    expect(resultado.status).toBe('sem_permissao');
  });

  it('assessor de rua não edita demanda de outro assessor de rua', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-outro');
    const resultado = await service.editar(demanda.id, { tituloResumido: 'Novo título' }, { id: 'user-eu', role: 'ASSESSOR_RUA' });
    expect(resultado.status).toBe('sem_permissao');
  });

  it('gabinete edita qualquer demanda em qualquer status', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-qualquer', 'PROTOCOLADA');
    const resultado = await service.editar(demanda.id, { tituloResumido: 'Corrigido pelo gabinete' }, { id: 'gabinete-1', role: 'ASSESSOR_GABINETE' });
    expect(resultado.status).toBe('ok');
  });

  it('retorna nao_encontrada para um id inexistente', async () => {
    const { service } = buildService();
    const resultado = await service.editar('id-que-nao-existe', {}, { id: 'gabinete-1', role: 'ASSESSOR_GABINETE' });
    expect(resultado.status).toBe('nao_encontrada');
  });

  it('rejeita editar para um requestTypeId inexistente', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-eu');
    const resultado = await service.editar(
      demanda.id,
      { requestTypeId: 'tipo-que-nao-existe' },
      { id: 'user-eu', role: 'ASSESSOR_RUA' },
    );
    expect(resultado.status).toBe('tipo_invalido');
  });

  it('rejeita editar para um requestTypeId desativado', async () => {
    const requestTypeRepo = createFakeRequestTypeRepo([
      { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true },
      { id: 'tipo-desativado', nome: 'Desativado', exigeDescricaoObrigatoria: false, ativo: false },
    ]);
    const requestRepo = createFakeRequestRepo();
    const photoUploader = createFakePhotoUploader();
    const userRepo = createFakeUserRepo();
    const service = new RequestService({ requestRepo, requestTypeRepo, photoUploader, userRepo });
    const demanda = await criarDemandaFake(requestRepo, 'user-eu');

    const resultado = await service.editar(
      demanda.id,
      { requestTypeId: 'tipo-desativado' },
      { id: 'user-eu', role: 'ASSESSOR_RUA' },
    );
    expect(resultado.status).toBe('tipo_invalido');
  });

  it('exige descrição do assunto ao trocar para um tipo "Outros" sem descrição já armazenada', async () => {
    const requestTypeRepo = createFakeRequestTypeRepo([
      { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true },
      { id: 'tipo-outros', nome: 'Outros', exigeDescricaoObrigatoria: true, ativo: true },
    ]);
    const requestRepo = createFakeRequestRepo();
    const photoUploader = createFakePhotoUploader();
    const userRepo = createFakeUserRepo();
    const service = new RequestService({ requestRepo, requestTypeRepo, photoUploader, userRepo });
    const demanda = await criarDemandaFake(requestRepo, 'user-eu');

    const resultado = await service.editar(
      demanda.id,
      { requestTypeId: 'tipo-outros' },
      { id: 'user-eu', role: 'ASSESSOR_RUA' },
    );
    expect(resultado.status).toBe('descricao_outro_obrigatoria');
  });

  it('rejeita apagar a descrição de uma demanda que já é "Outros", mesmo sem mandar requestTypeId', async () => {
    const requestTypeRepo = createFakeRequestTypeRepo([
      { id: 'tipo-outros', nome: 'Outros', exigeDescricaoObrigatoria: true, ativo: true },
    ]);
    const requestRepo = createFakeRequestRepo();
    const photoUploader = createFakePhotoUploader();
    const userRepo = createFakeUserRepo();
    const service = new RequestService({ requestRepo, requestTypeRepo, photoUploader, userRepo });
    const demanda = await requestRepo.create(
      {
        codigoInterno: 'GD-outros',
        solicitanteNome: 'Solicitante',
        solicitanteTelefone: '+5534999990000',
        tituloResumido: 'Título',
        descricao: 'Descrição',
        descricaoOutroAssunto: 'Assunto original',
        requestTypeId: 'tipo-outros',
        assessorResponsavelId: 'user-eu',
        autorizacaoDados: true,
      },
      [{ url: 'https://cdn/a.jpg', publicId: 'a', larguraPx: 10, alturaPx: 10, bytes: 100 }],
    );

    const resultado = await service.editar(
      demanda.id,
      { descricaoOutroAssunto: '' },
      { id: 'user-eu', role: 'ASSESSOR_RUA' },
    );

    expect(resultado.status).toBe('descricao_outro_obrigatoria');
  });

  it('normaliza o telefone do solicitante ao editar e rejeita um telefone inválido', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-eu');

    const invalido = await service.editar(
      demanda.id,
      { solicitanteTelefone: '123' },
      { id: 'user-eu', role: 'ASSESSOR_RUA' },
    );
    expect(invalido.status).toBe('telefone_invalido');

    const ok = await service.editar(
      demanda.id,
      { solicitanteTelefone: '(34) 98888-1234' },
      { id: 'user-eu', role: 'ASSESSOR_RUA' },
    );
    expect(ok.status).toBe('ok');
    if (ok.status === 'ok') {
      expect(ok.demanda.solicitanteTelefone).toBe('+5534988881234');
    }
  });

  it('permite trocar para um tipo "Outros" quando a descrição é fornecida junto', async () => {
    const requestTypeRepo = createFakeRequestTypeRepo([
      { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true },
      { id: 'tipo-outros', nome: 'Outros', exigeDescricaoObrigatoria: true, ativo: true },
    ]);
    const requestRepo = createFakeRequestRepo();
    const photoUploader = createFakePhotoUploader();
    const userRepo = createFakeUserRepo();
    const service = new RequestService({ requestRepo, requestTypeRepo, photoUploader, userRepo });
    const demanda = await criarDemandaFake(requestRepo, 'user-eu');

    const resultado = await service.editar(
      demanda.id,
      { requestTypeId: 'tipo-outros', descricaoOutroAssunto: 'Detalhe do assunto' },
      { id: 'user-eu', role: 'ASSESSOR_RUA' },
    );
    expect(resultado.status).toBe('ok');
  });
});

describe('RequestService.mudarStatus', () => {
  it('avança o status quando a transição é válida', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-eu');

    const resultado = await service.mudarStatus(demanda.id, 'RECEBIDA', undefined, 'gabinete-1');

    expect(resultado.status).toBe('ok');
    if (resultado.status === 'ok') {
      expect(resultado.demanda.status).toBe('RECEBIDA');
    }
  });

  it('rejeita uma transição fora da máquina de estados', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-eu');

    const resultado = await service.mudarStatus(demanda.id, 'PROTOCOLADA', undefined, 'gabinete-1');

    expect(resultado.status).toBe('transicao_invalida');
  });

  it('exige motivo para PENDENTE_INFORMACAO', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-eu');
    await service.mudarStatus(demanda.id, 'RECEBIDA', undefined, 'gabinete-1');
    await service.mudarStatus(demanda.id, 'EM_CONFERENCIA', undefined, 'gabinete-1');

    const semMotivo = await service.mudarStatus(demanda.id, 'PENDENTE_INFORMACAO', undefined, 'gabinete-1');
    expect(semMotivo.status).toBe('motivo_obrigatorio');

    const comMotivo = await service.mudarStatus(demanda.id, 'PENDENTE_INFORMACAO', 'Falta telefone', 'gabinete-1');
    expect(comMotivo.status).toBe('ok');
  });

  it('retorna nao_encontrada para um id inexistente', async () => {
    const { service } = buildService();
    const resultado = await service.mudarStatus('id-inexistente', 'RECEBIDA', undefined, 'gabinete-1');
    expect(resultado.status).toBe('nao_encontrada');
  });
});

describe('RequestService.listarHistoricoStatus', () => {
  it('assessor de rua vê o histórico da própria demanda', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-eu');
    await service.mudarStatus(demanda.id, 'RECEBIDA', undefined, 'gabinete-1');

    const resultado = await service.listarHistoricoStatus(demanda.id, { id: 'user-eu', role: 'ASSESSOR_RUA' });

    expect(resultado.status).toBe('ok');
    if (resultado.status === 'ok') {
      expect(resultado.historico).toHaveLength(1);
    }
  });

  it('assessor de rua não vê o histórico de demanda de outro', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-outro');

    const resultado = await service.listarHistoricoStatus(demanda.id, { id: 'user-eu', role: 'ASSESSOR_RUA' });

    expect(resultado.status).toBe('sem_permissao');
  });
});

describe('RequestService.reatribuir', () => {
  it('reatribui para um assessor ativo', async () => {
    const { service, requestRepo, userRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-original');
    await userRepo.create({ nome: 'Novo Assessor', telefone: '+5534988880002', role: 'ASSESSOR_RUA' });
    const novoAssessor = userRepo.users.find((u) => u.nome === 'Novo Assessor')!;

    const resultado = await service.reatribuir(demanda.id, novoAssessor.id, 'chefe-1');

    expect(resultado.status).toBe('ok');
    if (resultado.status === 'ok') {
      expect(resultado.demanda.assessorResponsavelId).toBe(novoAssessor.id);
    }
  });

  it('rejeita reatribuir para um assessor inexistente', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-original');

    const resultado = await service.reatribuir(demanda.id, 'id-que-nao-existe', 'chefe-1');

    expect(resultado.status).toBe('assessor_invalido');
  });

  it('rejeita reatribuir para um assessor inativo', async () => {
    const { service, requestRepo, userRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-original');
    await userRepo.create({ nome: 'Assessor Inativo', telefone: '+5534988880003', role: 'ASSESSOR_RUA' });
    const inativo = userRepo.users.find((u) => u.nome === 'Assessor Inativo')!;
    await userRepo.setAtivo(inativo.id, false);

    const resultado = await service.reatribuir(demanda.id, inativo.id, 'chefe-1');

    expect(resultado.status).toBe('assessor_invalido');
  });
});
