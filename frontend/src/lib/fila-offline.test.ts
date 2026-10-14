import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  adicionarPendente,
  listarPendentes,
  removerPendente,
  marcarErro,
  limparErro,
} from './fila-offline';

function apagarBanco(): Promise<void> {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.deleteDatabase('gabinete-digital');
    pedido.onsuccess = () => resolve();
    pedido.onerror = () => reject(pedido.error);
  });
}

// O IndexedDB clona o Blob ao gravar; um objeto simples com os mesmos campos prova o mesmo
// round-trip sem depender de como o jsdom implementa Blob.
function fotoFake(nome: string): Blob {
  return { nome, size: 10, type: 'image/jpeg' } as unknown as Blob;
}

beforeEach(async () => {
  await apagarBanco();
});

describe('fila-offline', () => {
  it('guarda a demanda com campos e fotos e a devolve na listagem', async () => {
    const criado = await adicionarPendente({
      usuarioId: 'u1',
      campos: { solicitanteNome: 'Maria', tituloResumido: 'Buraco' },
      fotos: [fotoFake('a'), fotoFake('b')],
    });

    const lista = await listarPendentes('u1');

    expect(lista).toHaveLength(1);
    expect(lista[0]!.id).toBe(criado.id);
    expect(lista[0]!.campos).toEqual({ solicitanteNome: 'Maria', tituloResumido: 'Buraco' });
    expect(lista[0]!.fotos).toHaveLength(2);
    expect(lista[0]!.tentativas).toBe(0);
    expect(lista[0]!.ultimoErro).toBeNull();
  });

  it('usa o id recebido (é o código do envio) e, sem ele, gera um UUID', async () => {
    const chave = '3f8b6a52-5d4e-4c4e-9a53-1c1f2a9d7b10';

    const comId = await adicionarPendente({ id: chave, usuarioId: 'u1', campos: {}, fotos: [] });
    const semId = await adicionarPendente({ usuarioId: 'u1', campos: {}, fotos: [] });

    expect(comId.id).toBe(chave);
    expect(semId.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect((await listarPendentes('u1')).map((i) => i.id)).toContain(chave);
  });

  it('cada usuário só vê as próprias demandas', async () => {
    await adicionarPendente({ usuarioId: 'u1', campos: { tituloResumido: 'A' }, fotos: [] });
    await adicionarPendente({ usuarioId: 'u2', campos: { tituloResumido: 'B' }, fotos: [] });

    const doUm = await listarPendentes('u1');
    const doDois = await listarPendentes('u2');

    expect(doUm.map((i) => i.campos.tituloResumido)).toEqual(['A']);
    expect(doDois.map((i) => i.campos.tituloResumido)).toEqual(['B']);
  });

  it('lista da mais antiga para a mais nova', async () => {
    const primeira = await adicionarPendente({ usuarioId: 'u1', campos: { tituloResumido: '1' }, fotos: [] });
    await new Promise((r) => setTimeout(r, 5));
    const segunda = await adicionarPendente({ usuarioId: 'u1', campos: { tituloResumido: '2' }, fotos: [] });

    const lista = await listarPendentes('u1');

    expect(lista.map((i) => i.id)).toEqual([primeira.id, segunda.id]);
  });

  it('remove uma demanda', async () => {
    const criado = await adicionarPendente({ usuarioId: 'u1', campos: {}, fotos: [] });

    await removerPendente(criado.id);

    expect(await listarPendentes('u1')).toHaveLength(0);
  });

  it('marcarErro guarda a mensagem e conta a tentativa; limparErro volta a aguardar', async () => {
    const criado = await adicionarPendente({ usuarioId: 'u1', campos: {}, fotos: [] });

    await marcarErro(criado.id, 'Telefone do solicitante inválido');
    const comErro = (await listarPendentes('u1'))[0]!;
    expect(comErro.ultimoErro).toBe('Telefone do solicitante inválido');
    expect(comErro.tentativas).toBe(1);

    await limparErro(criado.id);
    const semErro = (await listarPendentes('u1'))[0]!;
    expect(semErro.ultimoErro).toBeNull();
    expect(semErro.tentativas).toBe(1);
  });

  it('marcarErro em um id que não existe não faz nada nem lança', async () => {
    await expect(marcarErro('nao-existe', 'x')).resolves.toBeUndefined();
  });
});
