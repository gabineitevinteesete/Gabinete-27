import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { RequestService } from '../../src/services/request.service.js';
import { createFakeRequestTypeRepo, createFakeRequestRepo, createFakePhotoUploader } from '../helpers/fakes.js';

async function fotoValida(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 10, g: 20, b: 30 } } }).jpeg().toBuffer();
}

function buildService(tipos: Parameters<typeof createFakeRequestTypeRepo>[0]) {
  const requestTypeRepo = createFakeRequestTypeRepo(tipos);
  const requestRepo = createFakeRequestRepo();
  const photoUploader = createFakePhotoUploader();
  const service = new RequestService({ requestRepo, requestTypeRepo, photoUploader });
  return { service, requestRepo, photoUploader };
}

function inputBase(overrides: Record<string, unknown> = {}) {
  return {
    solicitanteNome: 'Maria Solicitante',
    solicitanteTelefone: '+5534999990000',
    localExato: 'Em frente ao número 100',
    tituloResumido: 'Buraco na rua',
    descricao: 'Buraco grande',
    requestTypeId: 'tipo-1',
    autorizacaoDados: true,
    assessorResponsavelId: 'user-1',
    fotos: [],
    ...overrides,
  };
}

describe('RequestService.criar', () => {
  it('cria a demanda quando tudo é válido', async () => {
    const { service, requestRepo, photoUploader } = buildService([
      { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true },
    ]);
    const fotos = [await fotoValida(), await fotoValida()];

    const resultado = await service.criar(inputBase({ fotos }));

    expect(resultado.status).toBe('ok');
    expect(requestRepo.created).toHaveLength(1);
    expect(photoUploader.uploads).toHaveLength(2);
  });

  it('rejeita quando o tipo não existe', async () => {
    const { service } = buildService([]);
    const fotos = [await fotoValida(), await fotoValida()];
    const resultado = await service.criar(inputBase({ fotos, requestTypeId: 'nao-existe' }));
    expect(resultado.status).toBe('tipo_invalido');
  });

  it('rejeita quando o tipo está desativado', async () => {
    const { service } = buildService([
      { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: false },
    ]);
    const fotos = [await fotoValida(), await fotoValida()];
    const resultado = await service.criar(inputBase({ fotos }));
    expect(resultado.status).toBe('tipo_invalido');
  });

  it('exige descrição do assunto quando o tipo é "Outros"', async () => {
    const { service } = buildService([
      { id: 'tipo-outros', nome: 'Outros', exigeDescricaoObrigatoria: true, ativo: true },
    ]);
    const fotos = [await fotoValida(), await fotoValida()];
    const resultado = await service.criar(inputBase({ fotos, requestTypeId: 'tipo-outros' }));
    expect(resultado.status).toBe('descricao_outro_obrigatoria');
  });

  it('aceita "Outros" quando a descrição do assunto vem preenchida', async () => {
    const { service } = buildService([
      { id: 'tipo-outros', nome: 'Outros', exigeDescricaoObrigatoria: true, ativo: true },
    ]);
    const fotos = [await fotoValida(), await fotoValida()];
    const resultado = await service.criar(
      inputBase({ fotos, requestTypeId: 'tipo-outros', descricaoOutroAssunto: 'Poste caído' }),
    );
    expect(resultado.status).toBe('ok');
  });

  it('rejeita menos de 2 fotos', async () => {
    const { service } = buildService([
      { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true },
    ]);
    const resultado = await service.criar(inputBase({ fotos: [await fotoValida()] }));
    expect(resultado.status).toBe('quantidade_fotos_invalida');
  });

  it('rejeita mais de 4 fotos', async () => {
    const { service } = buildService([
      { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true },
    ]);
    const fotos = [await fotoValida(), await fotoValida(), await fotoValida(), await fotoValida(), await fotoValida()];
    const resultado = await service.criar(inputBase({ fotos }));
    expect(resultado.status).toBe('quantidade_fotos_invalida');
  });

  it('rejeita quando autorizacaoDados é falso', async () => {
    const { service } = buildService([
      { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true },
    ]);
    const fotos = [await fotoValida(), await fotoValida()];
    const resultado = await service.criar(inputBase({ fotos, autorizacaoDados: false }));
    expect(resultado.status).toBe('autorizacao_obrigatoria');
  });

  it('rejeita uma foto que não é uma imagem de verdade, sem chegar a fazer upload de nada', async () => {
    const { service, photoUploader } = buildService([
      { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true },
    ]);
    const fotos = [await fotoValida(), Buffer.from('isto nao e uma imagem')];

    const resultado = await service.criar(inputBase({ fotos }));

    expect(resultado).toEqual({ status: 'foto_invalida', indice: 1 });
    expect(photoUploader.uploads).toHaveLength(0);
  });
});
