import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adicionarPendente, listarPendentes } from './fila-offline';
import { sincronizarFila, montarFormData } from './sincronizar-fila';

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient, ApiError } from '@/services/api-client';

function apagarBanco(): Promise<void> {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.deleteDatabase('gabinete-digital');
    pedido.onsuccess = () => resolve();
    pedido.onerror = () => reject(pedido.error);
  });
}

function pendenteBase(usuarioId = 'u1', titulo = 'Buraco') {
  return { usuarioId, campos: { tituloResumido: titulo, solicitanteNome: 'Maria' }, fotos: [] as Blob[] };
}

beforeEach(async () => {
  await apagarBanco();
  vi.mocked(apiClient.request).mockReset();
});

describe('sincronizarFila', () => {
  it('envia as pendentes e remove cada uma do aparelho quando o servidor aceita', async () => {
    await adicionarPendente(pendenteBase('u1', 'A'));
    await adicionarPendente(pendenteBase('u1', 'B'));
    vi.mocked(apiClient.request).mockResolvedValue({ id: 'novo' });

    const resultado = await sincronizarFila('u1');

    expect(resultado).toEqual({ enviadas: 2, recusadas: 0, sessaoExpirada: false });
    expect(apiClient.request).toHaveBeenCalledTimes(2);
    expect(vi.mocked(apiClient.request).mock.calls[0]![0]).toBe('/demandas');
    expect(vi.mocked(apiClient.request).mock.calls[0]![1]).toMatchObject({ method: 'POST', auth: true });
    expect(await listarPendentes('u1')).toHaveLength(0);
  });

  it('manda os campos de texto no FormData', async () => {
    const criado = await adicionarPendente(pendenteBase());
    const formData = montarFormData(criado);

    expect(formData.get('tituloResumido')).toBe('Buraco');
    expect(formData.get('solicitanteNome')).toBe('Maria');
  });

  it('quando o servidor recusa, marca o erro, mantém a demanda e segue para a próxima', async () => {
    await adicionarPendente(pendenteBase('u1', 'Recusada'));
    // A fila envia da mais antiga para a mais nova; instantes diferentes tornam a ordem determinística.
    await new Promise((r) => setTimeout(r, 5));
    await adicionarPendente(pendenteBase('u1', 'Aceita'));
    vi.mocked(apiClient.request)
      .mockRejectedValueOnce(new ApiError(400, 'Telefone do solicitante inválido'))
      .mockResolvedValueOnce({ id: 'novo' });

    const resultado = await sincronizarFila('u1');

    expect(resultado).toEqual({ enviadas: 1, recusadas: 1, sessaoExpirada: false });
    const restantes = await listarPendentes('u1');
    expect(restantes).toHaveLength(1);
    expect(restantes[0]!.campos.tituloResumido).toBe('Recusada');
    expect(restantes[0]!.ultimoErro).toBe('Telefone do solicitante inválido');
  });

  it('erro de rede interrompe a rodada e mantém tudo, sem marcar erro', async () => {
    await adicionarPendente(pendenteBase('u1', 'A'));
    await adicionarPendente(pendenteBase('u1', 'B'));
    vi.mocked(apiClient.request).mockRejectedValue(new TypeError('Failed to fetch'));

    const resultado = await sincronizarFila('u1');

    expect(resultado).toEqual({ enviadas: 0, recusadas: 0, sessaoExpirada: false });
    expect(apiClient.request).toHaveBeenCalledTimes(1);
    const restantes = await listarPendentes('u1');
    expect(restantes).toHaveLength(2);
    expect(restantes.every((item) => item.ultimoErro === null)).toBe(true);
  });

  it('401 depois de renovar a sessão sinaliza sessão expirada e mantém a demanda', async () => {
    await adicionarPendente(pendenteBase('u1', 'A'));
    vi.mocked(apiClient.request).mockRejectedValue(new ApiError(401, 'Sessão expirada'));

    const resultado = await sincronizarFila('u1');

    expect(resultado).toEqual({ enviadas: 0, recusadas: 0, sessaoExpirada: true });
    const restantes = await listarPendentes('u1');
    expect(restantes).toHaveLength(1);
    expect(restantes[0]!.ultimoErro).toBeNull();
  });

  it('o FormData leva as fotos com o nome foto-N.jpg e os campos de texto', async () => {
    const foto = new Blob(['x'], { type: 'image/jpeg' });
    const formData = montarFormData({ campos: { tituloResumido: 'T' }, fotos: [foto, foto] });

    const fotos = formData.getAll('fotos') as File[];
    expect(fotos.map((f) => f.name)).toEqual(['foto-0.jpg', 'foto-1.jpg']);
    expect(formData.get('tituloResumido')).toBe('T');
  });

  it('com outra aba já enviando (trava de Web Locks ocupada), não envia nada', async () => {
    await adicionarPendente(pendenteBase('u1', 'A'));
    const original = Object.getOwnPropertyDescriptor(navigator, 'locks');
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { request: async (_nome: string, _opcoes: unknown, cb: (trava: null) => Promise<void>) => cb(null) },
    });

    const resultado = await sincronizarFila('u1');

    expect(resultado).toEqual({ enviadas: 0, recusadas: 0, sessaoExpirada: false });
    expect(apiClient.request).not.toHaveBeenCalled();
    if (original) Object.defineProperty(navigator, 'locks', original);
    else Reflect.deleteProperty(navigator, 'locks');
  });

  it.each([401, 408, 429, 500, 503])(
    'resposta %i é problema temporário: interrompe a rodada e NÃO marca a demanda como recusada',
    async (status) => {
      await adicionarPendente(pendenteBase('u1', 'A'));
      await adicionarPendente(pendenteBase('u1', 'B'));
      vi.mocked(apiClient.request).mockRejectedValue(new ApiError(status, 'indisponível'));

      const resultado = await sincronizarFila('u1');

      expect(resultado).toEqual({ enviadas: 0, recusadas: 0, sessaoExpirada: status === 401 });
      expect(apiClient.request).toHaveBeenCalledTimes(1);
      const restantes = await listarPendentes('u1');
      expect(restantes).toHaveLength(2);
      expect(restantes.every((item) => item.ultimoErro === null)).toBe(true);
    },
  );

  it('não reenvia automaticamente o que já foi recusado', async () => {
    await adicionarPendente(pendenteBase('u1', 'Recusada'));
    vi.mocked(apiClient.request).mockRejectedValueOnce(new ApiError(400, 'inválido'));
    await sincronizarFila('u1');
    vi.mocked(apiClient.request).mockReset();

    const resultado = await sincronizarFila('u1');

    expect(resultado).toEqual({ enviadas: 0, recusadas: 0, sessaoExpirada: false });
    expect(apiClient.request).not.toHaveBeenCalled();
  });

  it('só envia as demandas do usuário informado', async () => {
    await adicionarPendente(pendenteBase('u1', 'Minha'));
    await adicionarPendente(pendenteBase('u2', 'De outro'));
    vi.mocked(apiClient.request).mockResolvedValue({ id: 'novo' });

    await sincronizarFila('u1');

    expect(apiClient.request).toHaveBeenCalledTimes(1);
    expect(await listarPendentes('u2')).toHaveLength(1);
  });

  it('duas chamadas simultâneas enviam cada demanda uma única vez', async () => {
    await adicionarPendente(pendenteBase('u1', 'A'));
    let liberar: (valor: unknown) => void = () => {};
    vi.mocked(apiClient.request).mockImplementation(() => new Promise((resolve) => (liberar = resolve)));

    const primeira = sincronizarFila('u1');
    await vi.waitFor(() => expect(apiClient.request).toHaveBeenCalledTimes(1));
    const segunda = await sincronizarFila('u1');
    liberar({ id: 'novo' });
    await primeira;

    expect(segunda).toEqual({ enviadas: 0, recusadas: 0, sessaoExpirada: false });
    expect(apiClient.request).toHaveBeenCalledTimes(1);
  });
});
