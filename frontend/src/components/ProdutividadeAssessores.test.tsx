import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProdutividadeAssessores } from './ProdutividadeAssessores';

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient } from '@/services/api-client';

function assessorFake(overrides: Record<string, unknown> = {}) {
  return {
    assessorId: 'a1',
    assessorNome: 'Ana',
    porStatus: { RASCUNHO: 0, ENVIADA: 3, RECEBIDA: 0, EM_CONFERENCIA: 0, PENDENTE_INFORMACAO: 0, PROTOCOLADA: 2, EM_ANDAMENTO: 0, CONCLUIDA: 0, ARQUIVADA: 0, RECUSADA: 0 },
    total: 5,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(apiClient.request).mockReset();
});

describe('ProdutividadeAssessores', () => {
  it('mostra a tabela com nome, contagens por status e total', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([assessorFake()]);

    render(<ProdutividadeAssessores />);

    expect(await screen.findByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('refaz a busca quando o mês muda', async () => {
    vi.mocked(apiClient.request).mockResolvedValue([assessorFake()]);

    render(<ProdutividadeAssessores />);
    await waitFor(() => expect(apiClient.request).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText(/mês/i), { target: { value: '2026-01' } });

    await waitFor(() => expect(apiClient.request).toHaveBeenCalledTimes(2));
    const [url] = vi.mocked(apiClient.request).mock.calls[1]!;
    expect(url).toContain('mes=2026-01');
  });

  it('mostra mensagem quando não há assessores de rua ativos', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([]);

    render(<ProdutividadeAssessores />);

    expect(await screen.findByText(/nenhum assessor de rua/i)).toBeInTheDocument();
  });
});
