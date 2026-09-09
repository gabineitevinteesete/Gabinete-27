import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ObservacoesInternas } from './ObservacoesInternas';

const useAuthMock = vi.fn();
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => useAuthMock() }));

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient } from '@/services/api-client';

function notaFake(overrides: Record<string, unknown> = {}) {
  return {
    id: 'n1', requestId: 'd1', autorId: 'user-eu', autorNome: 'Ana',
    texto: 'Liguei pra prefeitura', createdAt: '2026-09-03T10:00:00.000Z', updatedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  useAuthMock.mockReturnValue({ user: { id: 'user-eu', role: 'ASSESSOR_GABINETE' } });
  vi.mocked(apiClient.request).mockReset();
});

describe('ObservacoesInternas', () => {
  it('lista as observações já existentes', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([notaFake()]);
    render(<ObservacoesInternas demandaId="d1" />);
    expect(await screen.findByText('Liguei pra prefeitura')).toBeInTheDocument();
    expect(screen.getByText(/Ana/)).toBeInTheDocument();
  });

  it('mostra mensagem quando não há observações', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([]);
    render(<ObservacoesInternas demandaId="d1" />);
    expect(await screen.findByText(/nenhuma observação/i)).toBeInTheDocument();
  });

  it('mostra erro de carregamento em vez de "nenhuma observação" quando a busca falha', async () => {
    vi.mocked(apiClient.request).mockRejectedValueOnce(new Error('falha de rede'));
    render(<ObservacoesInternas demandaId="d1" />);

    expect(await screen.findByText(/não foi possível carregar as observações/i)).toBeInTheDocument();
    expect(screen.queryByText(/nenhuma observação/i)).not.toBeInTheDocument();
  });

  it('cria uma nova observação e mostra na lista', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([]);
    vi.mocked(apiClient.request).mockResolvedValueOnce(notaFake());
    render(<ObservacoesInternas demandaId="d1" />);
    await screen.findByText(/nenhuma observação/i);

    fireEvent.change(screen.getByPlaceholderText(/escrever uma observação/i), { target: { value: 'Liguei pra prefeitura' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar observação/i }));

    expect(await screen.findByText('Liguei pra prefeitura')).toBeInTheDocument();
    expect(apiClient.request).toHaveBeenLastCalledWith('/demandas/d1/observacoes', {
      method: 'POST', auth: true, body: { texto: 'Liguei pra prefeitura' },
    });
  });

  it('mostra editar e apagar só na própria nota', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([
      notaFake({ id: 'minha', autorId: 'user-eu' }),
      notaFake({ id: 'de-outro', autorId: 'user-outro', autorNome: 'Bruno' }),
    ]);
    render(<ObservacoesInternas demandaId="d1" />);
    await screen.findByText(/Ana/);

    const botoesEditar = screen.getAllByRole('button', { name: /editar/i });
    expect(botoesEditar).toHaveLength(1);
  });

  it('edita a própria nota', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([notaFake()]);
    vi.mocked(apiClient.request).mockResolvedValueOnce(notaFake({ texto: 'Texto corrigido', updatedAt: '2026-09-03T11:00:00.000Z' }));
    render(<ObservacoesInternas demandaId="d1" />);
    await screen.findByText('Liguei pra prefeitura');

    fireEvent.click(screen.getByRole('button', { name: /editar/i }));
    const caixaEdicao = screen.getByDisplayValue('Liguei pra prefeitura');
    fireEvent.change(caixaEdicao, { target: { value: 'Texto corrigido' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    expect(await screen.findByText('Texto corrigido', { ignore: 'textarea' })).toBeInTheDocument();
    expect(apiClient.request).toHaveBeenLastCalledWith('/demandas/d1/observacoes/n1', {
      method: 'PATCH', auth: true, body: { texto: 'Texto corrigido' },
    });
  });

  it('apaga a própria nota depois de confirmar', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.mocked(apiClient.request).mockResolvedValueOnce([notaFake()]);
    vi.mocked(apiClient.request).mockResolvedValueOnce(undefined);
    render(<ObservacoesInternas demandaId="d1" />);
    await screen.findByText('Liguei pra prefeitura');

    fireEvent.click(screen.getByRole('button', { name: /apagar/i }));

    await waitFor(() => expect(screen.queryByText('Liguei pra prefeitura')).not.toBeInTheDocument());
    expect(apiClient.request).toHaveBeenLastCalledWith('/demandas/d1/observacoes/n1', { method: 'DELETE', auth: true });
    vi.unstubAllGlobals();
  });

  it('mostra erro quando a API rejeita a criação', async () => {
    const { ApiError } = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
    vi.mocked(apiClient.request).mockResolvedValueOnce([]);
    vi.mocked(apiClient.request).mockRejectedValueOnce(new ApiError(400, 'Texto obrigatório'));
    render(<ObservacoesInternas demandaId="d1" />);
    await screen.findByText(/nenhuma observação/i);

    fireEvent.change(screen.getByPlaceholderText(/escrever uma observação/i), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar observação/i }));

    expect(await screen.findByText('Texto obrigatório')).toBeInTheDocument();
  });
});
