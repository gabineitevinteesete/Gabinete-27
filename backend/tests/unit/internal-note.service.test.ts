import { describe, it, expect } from 'vitest';
import { InternalNoteService } from '../../src/services/internal-note.service.js';
import { createFakeInternalNoteRepo, createFakeRequestRepo, createFakeRequestTypeRepo, createFakePhotoUploader, createFakeUserRepo } from '../helpers/fakes.js';

function buildService() {
  const internalNoteRepo = createFakeInternalNoteRepo();
  const requestRepo = createFakeRequestRepo();
  const service = new InternalNoteService({ internalNoteRepo, requestRepo });
  return { service, internalNoteRepo, requestRepo };
}

async function criarDemandaFake(requestRepo: ReturnType<typeof createFakeRequestRepo>) {
  return requestRepo.create(
    {
      codigoInterno: `GD-${Math.random()}`,
      solicitanteNome: 'Solicitante',
      solicitanteTelefone: '+5534999990000',
      tituloResumido: 'Título',
      descricao: 'Descrição',
      requestTypeId: 'tipo-1',
      assessorResponsavelId: 'gabinete-1',
      autorizacaoDados: true,
    },
    [{ url: 'https://cdn/a.jpg', publicId: 'a', larguraPx: 10, alturaPx: 10, bytes: 100 }],
  );
}

describe('InternalNoteService.criar', () => {
  it('cria a observação quando a demanda existe', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo);

    const resultado = await service.criar(demanda.id, 'gabinete-1', 'Liguei pra prefeitura');

    expect(resultado.status).toBe('ok');
    if (resultado.status === 'ok') {
      expect(resultado.observacao.texto).toBe('Liguei pra prefeitura');
      expect(resultado.observacao.autorId).toBe('gabinete-1');
    }
  });

  it('retorna nao_encontrada para uma demanda inexistente', async () => {
    const { service } = buildService();
    const resultado = await service.criar('id-inexistente', 'gabinete-1', 'Nota');
    expect(resultado.status).toBe('nao_encontrada');
  });
});

describe('InternalNoteService.listar', () => {
  it('lista as observações da demanda', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo);
    await service.criar(demanda.id, 'gabinete-1', 'Primeira');
    await service.criar(demanda.id, 'gabinete-1', 'Segunda');

    const resultado = await service.listar(demanda.id);

    expect(resultado.status).toBe('ok');
    if (resultado.status === 'ok') {
      expect(resultado.observacoes).toHaveLength(2);
    }
  });

  it('retorna nao_encontrada para uma demanda inexistente', async () => {
    const { service } = buildService();
    const resultado = await service.listar('id-inexistente');
    expect(resultado.status).toBe('nao_encontrada');
  });
});

describe('InternalNoteService.editar', () => {
  it('autor edita a própria observação', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo);
    const criada = await service.criar(demanda.id, 'gabinete-1', 'Original');
    const notaId = criada.status === 'ok' ? criada.observacao.id : '';

    const resultado = await service.editar(demanda.id, notaId, 'Corrigida', 'gabinete-1');

    expect(resultado.status).toBe('ok');
    if (resultado.status === 'ok') {
      expect(resultado.observacao.texto).toBe('Corrigida');
      expect(resultado.observacao.updatedAt).not.toBeNull();
    }
  });

  it('bloqueia quem não é o autor', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo);
    const criada = await service.criar(demanda.id, 'gabinete-1', 'Original');
    const notaId = criada.status === 'ok' ? criada.observacao.id : '';

    const resultado = await service.editar(demanda.id, notaId, 'Tentativa', 'gabinete-2');

    expect(resultado.status).toBe('sem_permissao');
  });

  it('retorna nao_encontrada para uma nota inexistente', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo);
    const resultado = await service.editar(demanda.id, 'nota-inexistente', 'Texto', 'gabinete-1');
    expect(resultado.status).toBe('nao_encontrada');
  });

  it('retorna nao_encontrada quando a nota não pertence à demanda informada', async () => {
    const { service, requestRepo } = buildService();
    const demandaA = await criarDemandaFake(requestRepo);
    const demandaB = await criarDemandaFake(requestRepo);
    const criada = await service.criar(demandaA.id, 'gabinete-1', 'Nota da A');
    const notaId = criada.status === 'ok' ? criada.observacao.id : '';

    const resultado = await service.editar(demandaB.id, notaId, 'Tentativa', 'gabinete-1');

    expect(resultado.status).toBe('nao_encontrada');
  });
});

describe('InternalNoteService.apagar', () => {
  it('autor apaga a própria observação', async () => {
    const { service, requestRepo, internalNoteRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo);
    const criada = await service.criar(demanda.id, 'gabinete-1', 'Nota a apagar');
    const notaId = criada.status === 'ok' ? criada.observacao.id : '';

    const resultado = await service.apagar(demanda.id, notaId, 'gabinete-1');

    expect(resultado.status).toBe('ok');
    expect(internalNoteRepo.store).toHaveLength(0);
  });

  it('bloqueia quem não é o autor', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo);
    const criada = await service.criar(demanda.id, 'gabinete-1', 'Nota');
    const notaId = criada.status === 'ok' ? criada.observacao.id : '';

    const resultado = await service.apagar(demanda.id, notaId, 'gabinete-2');

    expect(resultado.status).toBe('sem_permissao');
  });
});
