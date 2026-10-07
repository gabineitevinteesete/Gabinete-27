import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useFilaOffline } from './use-fila-offline';
import type { DemandaPendente } from '@/lib/fila-offline';

const useAuthMock = vi.fn();
const logout = vi.fn();
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => useAuthMock() }));

const listarPendentes = vi.fn();
const removerPendente = vi.fn();
const limparErro = vi.fn();
vi.mock('@/lib/fila-offline', () => ({
  EVENTO_FILA_MUDOU: 'gd:fila-mudou',
  escutarOutrasAbas: vi.fn(),
  listarPendentes: (...args: unknown[]) => listarPendentes(...args),
  removerPendente: (...args: unknown[]) => removerPendente(...args),
  limparErro: (...args: unknown[]) => limparErro(...args),
}));

const sincronizarFila = vi.fn();
vi.mock('@/lib/sincronizar-fila', () => ({ sincronizarFila: (...args: unknown[]) => sincronizarFila(...args) }));

function pendente(id: string, ultimoErro: string | null = null): DemandaPendente {
  return { id, usuarioId: 'u1', criadoEm: 1, campos: { tituloResumido: id }, fotos: [], tentativas: 0, ultimoErro };
}

beforeEach(() => {
  logout.mockReset().mockResolvedValue(undefined);
  useAuthMock.mockReturnValue({ user: { id: 'u1' }, logout });
  listarPendentes.mockReset().mockResolvedValue([]);
  removerPendente.mockReset().mockResolvedValue(undefined);
  limparErro.mockReset().mockResolvedValue(undefined);
  sincronizarFila.mockReset().mockResolvedValue({ enviadas: 0, recusadas: 0, sessaoExpirada: false });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useFilaOffline', () => {
  it('carrega as pendentes do usuário e tenta enviar ao montar', async () => {
    listarPendentes.mockResolvedValue([pendente('a')]);

    const { result } = renderHook(() => useFilaOffline());

    await waitFor(() => expect(result.current.pendentes).toHaveLength(1));
    expect(listarPendentes).toHaveBeenCalledWith('u1');
    expect(sincronizarFila).toHaveBeenCalledWith('u1');
  });

  it('quando o servidor diz que a sessão expirou, sai para o login (as demandas continuam guardadas)', async () => {
    sincronizarFila.mockResolvedValue({ enviadas: 0, recusadas: 0, sessaoExpirada: true });

    renderHook(() => useFilaOffline());

    await waitFor(() => expect(logout).toHaveBeenCalled());
  });

  it('sem usuário não carrega nem envia nada', async () => {
    useAuthMock.mockReturnValue({ user: null, logout });

    const { result } = renderHook(() => useFilaOffline());

    await waitFor(() => expect(result.current.pendentes).toEqual([]));
    expect(listarPendentes).not.toHaveBeenCalled();
    expect(sincronizarFila).not.toHaveBeenCalled();
  });

  it('envia de novo quando o aparelho volta a ter rede', async () => {
    const { result } = renderHook(() => useFilaOffline());
    await waitFor(() => expect(sincronizarFila).toHaveBeenCalledTimes(1));
    expect(result.current.sincronizando).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(sincronizarFila).toHaveBeenCalledTimes(2));
  });

  it('recarrega a lista quando a fila avisa que mudou', async () => {
    const { result } = renderHook(() => useFilaOffline());
    await waitFor(() => expect(result.current.pendentes).toHaveLength(0));

    listarPendentes.mockResolvedValue([pendente('nova')]);
    act(() => {
      window.dispatchEvent(new Event('gd:fila-mudou'));
    });

    await waitFor(() => expect(result.current.pendentes).toHaveLength(1));
  });

  it('repete o envio a cada 30 segundos enquanto houver pendente aguardando', async () => {
    listarPendentes.mockResolvedValue([pendente('a')]);
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { result } = renderHook(() => useFilaOffline());
    await waitFor(() => expect(result.current.pendentes).toHaveLength(1));
    const antes = sincronizarFila.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(sincronizarFila.mock.calls.length).toBeGreaterThan(antes);
  });

  it('não repete o envio sozinho quando só há pendentes recusadas', async () => {
    listarPendentes.mockResolvedValue([pendente('a', 'inválido')]);
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { result } = renderHook(() => useFilaOffline());
    await waitFor(() => expect(result.current.pendentes).toHaveLength(1));
    const antes = sincronizarFila.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(sincronizarFila.mock.calls.length).toBe(antes);
  });

  it('descartar remove a demanda da fila', async () => {
    const { result } = renderHook(() => useFilaOffline());
    await waitFor(() => expect(result.current.pendentes).toEqual([]));

    await act(async () => {
      await result.current.descartar('a');
    });

    expect(removerPendente).toHaveBeenCalledWith('a');
  });

  it('tentarDeNovo limpa o erro e envia', async () => {
    const { result } = renderHook(() => useFilaOffline());
    await waitFor(() => expect(sincronizarFila).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.tentarDeNovo('a');
    });

    expect(limparErro).toHaveBeenCalledWith('a');
    expect(sincronizarFila).toHaveBeenCalledTimes(2);
  });

  it('se o IndexedDB falhar, fica sem pendentes e sem quebrar', async () => {
    listarPendentes.mockRejectedValue(new Error('sem indexeddb'));

    const { result } = renderHook(() => useFilaOffline());

    await waitFor(() => expect(sincronizarFila).toHaveBeenCalled());
    expect(result.current.pendentes).toEqual([]);
  });
});
