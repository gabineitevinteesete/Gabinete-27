import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { SinoNotificacoes } from './SinoNotificacoes';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient } from '@/services/api-client';

function aviso(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    requestId: `demanda-${id}`,
    tipo: 'DEMANDA_NOVA',
    mensagem: `Nova demanda GD-${id} registrada.`,
    lida: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function responder(items: unknown[], naoLidas: number) {
  vi.mocked(apiClient.request).mockImplementation((async (url: string, opcoes?: { method?: string }) => {
    if (url === '/notificacoes' && !opcoes?.method) return { items, naoLidas };
    return { ok: true };
  }) as unknown as typeof apiClient.request);
}

function chamadasPatch() {
  return vi.mocked(apiClient.request).mock.calls.filter(([, opcoes]) => (opcoes as { method?: string } | undefined)?.method === 'PATCH');
}

beforeEach(() => {
  push.mockReset();
  vi.mocked(apiClient.request).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SinoNotificacoes', () => {
  it('mostra o contador de não lidos no sino', async () => {
    responder([aviso('1'), aviso('2')], 2);

    render(<SinoNotificacoes />);

    expect(await screen.findByRole('button', { name: 'Avisos (2 não lidos)' })).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('acima de 9 mostra "9+" e sem avisos não mostra contador', async () => {
    responder([aviso('1')], 25);
    const { unmount } = render(<SinoNotificacoes />);
    expect(await screen.findByText('9+')).toBeInTheDocument();
    unmount();

    responder([], 0);
    render(<SinoNotificacoes />);
    expect(await screen.findByRole('button', { name: 'Avisos' })).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('abre a lista com os textos e "Nenhum aviso por enquanto." quando está vazia', async () => {
    responder([aviso('1')], 1);
    const { unmount } = render(<SinoNotificacoes />);
    fireEvent.click(await screen.findByRole('button', { name: /Avisos/ }));
    expect(screen.getByText('Nova demanda GD-1 registrada.')).toBeInTheDocument();
    unmount();

    responder([], 0);
    render(<SinoNotificacoes />);
    fireEvent.click(await screen.findByRole('button', { name: /Avisos/ }));
    expect(screen.getByText('Nenhum aviso por enquanto.')).toBeInTheDocument();
  });

  it('clicar em um aviso o marca como lido, abre a demanda e fecha a lista', async () => {
    responder([aviso('1'), aviso('2')], 2);
    render(<SinoNotificacoes />);
    fireEvent.click(await screen.findByRole('button', { name: /Avisos/ }));

    fireEvent.click(screen.getByText('Nova demanda GD-1 registrada.'));

    expect(push).toHaveBeenCalledWith('/painel/demandas/demanda-1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Avisos (1 não lidos)' })).toBeInTheDocument();
    expect(chamadasPatch()).toHaveLength(1);
    expect(chamadasPatch()[0]![0]).toBe('/notificacoes/1/lida');
  });

  it('clicar em um aviso que já estava lido só abre a demanda, sem nova chamada', async () => {
    responder([aviso('1', { lida: true })], 0);
    render(<SinoNotificacoes />);
    fireEvent.click(await screen.findByRole('button', { name: /Avisos/ }));

    fireEvent.click(screen.getByText('Nova demanda GD-1 registrada.'));

    expect(push).toHaveBeenCalledWith('/painel/demandas/demanda-1');
    expect(chamadasPatch()).toHaveLength(0);
  });

  it('"Marcar todas como lidas" zera o contador e chama a rota certa', async () => {
    responder([aviso('1'), aviso('2')], 2);
    render(<SinoNotificacoes />);
    fireEvent.click(await screen.findByRole('button', { name: /Avisos/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Marcar todas como lidas' }));

    expect(screen.getByRole('button', { name: 'Avisos' })).toBeInTheDocument();
    expect(chamadasPatch().map(([url]) => url)).toEqual(['/notificacoes/lidas']);
    expect(screen.queryByRole('button', { name: 'Marcar todas como lidas' })).not.toBeInTheDocument();
  });

  it('fecha ao apertar Esc e ao clicar fora', async () => {
    responder([aviso('1')], 1);
    render(<SinoNotificacoes />);
    fireEvent.click(await screen.findByRole('button', { name: /Avisos/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Avisos/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('falha de rede é silenciosa e mantém o que já estava na tela', async () => {
    responder([aviso('1')], 1);
    render(<SinoNotificacoes />);
    await screen.findByRole('button', { name: 'Avisos (1 não lidos)' });

    vi.mocked(apiClient.request).mockRejectedValue(new TypeError('Failed to fetch'));
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(vi.mocked(apiClient.request).mock.calls.length).toBeGreaterThan(1));

    expect(screen.getByRole('button', { name: 'Avisos (1 não lidos)' })).toBeInTheDocument();
  });

  it('busca de novo a cada 60 segundos', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    responder([], 0);
    render(<SinoNotificacoes />);
    await waitFor(() => expect(vi.mocked(apiClient.request)).toHaveBeenCalledTimes(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(vi.mocked(apiClient.request).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('um aviso novo que chega na busca seguinte atualiza o contador', async () => {
    responder([], 0);
    render(<SinoNotificacoes />);
    await screen.findByRole('button', { name: 'Avisos' });

    responder([aviso('9')], 1);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(await screen.findByRole('button', { name: 'Avisos (1 não lidos)' })).toBeInTheDocument();
  });
});
