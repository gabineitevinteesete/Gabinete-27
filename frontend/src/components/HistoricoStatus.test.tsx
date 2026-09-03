import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HistoricoStatus } from './HistoricoStatus';

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient } from '@/services/api-client';

beforeEach(() => {
  vi.mocked(apiClient.request).mockReset();
});

describe('HistoricoStatus', () => {
  it('lista cada mudança de status com quem fez e o motivo quando houver', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([
      {
        id: 'h2', statusAnterior: 'EM_CONFERENCIA', statusNovo: 'PENDENTE_INFORMACAO',
        usuarioId: 'u1', usuarioNome: 'Ana', observacao: 'Falta telefone', createdAt: '2026-09-02T10:00:00.000Z',
      },
      {
        id: 'h1', statusAnterior: 'RECEBIDA', statusNovo: 'EM_CONFERENCIA',
        usuarioId: 'u2', usuarioNome: 'Carlos', observacao: null, createdAt: '2026-09-01T10:00:00.000Z',
      },
    ]);

    render(<HistoricoStatus demandaId="d1" />);

    expect(await screen.findByText(/Ana/)).toBeInTheDocument();
    expect(screen.getByText(/Pendente de informação/)).toBeInTheDocument();
    expect(screen.getByText('Falta telefone')).toBeInTheDocument();
    expect(screen.getAllByText(/Em conferência/).length).toBeGreaterThan(0);
  });

  it('mostra a origem e o destino de cada mudança', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([
      {
        id: 'h1', statusAnterior: 'RECEBIDA', statusNovo: 'EM_CONFERENCIA',
        usuarioId: 'u2', usuarioNome: 'Carlos', observacao: null, createdAt: '2026-09-01T10:00:00.000Z',
      },
    ]);

    const { container } = render(<HistoricoStatus demandaId="d1" />);

    await screen.findByText('Carlos');
    expect(container.textContent).toContain('Carlos mudou de Recebida para Em conferência');
  });

  it('cai para "mudou para" quando não há status anterior', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([
      {
        id: 'h1', statusAnterior: null, statusNovo: 'RECEBIDA',
        usuarioId: 'u2', usuarioNome: 'Carlos', observacao: null, createdAt: '2026-09-01T10:00:00.000Z',
      },
    ]);

    const { container } = render(<HistoricoStatus demandaId="d1" />);

    await screen.findByText('Carlos');
    expect(container.textContent).toContain('Carlos mudou para Recebida');
    expect(container.textContent).not.toContain('mudou de');
  });

  it('mostra mensagem quando não há histórico ainda', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([]);
    render(<HistoricoStatus demandaId="d1" />);
    expect(await screen.findByText(/nenhuma mudança de status/i)).toBeInTheDocument();
  });

  it('mostra erro quando a busca falha, em vez da mensagem de histórico vazio', async () => {
    const { ApiError } = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
    vi.mocked(apiClient.request).mockRejectedValueOnce(new ApiError(403, 'Você não tem acesso a esta demanda'));

    render(<HistoricoStatus demandaId="d1" />);

    expect(await screen.findByText(/não foi possível carregar o histórico/i)).toBeInTheDocument();
    expect(screen.queryByText(/nenhuma mudança de status/i)).not.toBeInTheDocument();
  });

  it('refaz a busca quando a versão muda', async () => {
    vi.mocked(apiClient.request).mockResolvedValue([]);

    const { rerender } = render(<HistoricoStatus demandaId="d1" versao={0} />);
    await screen.findByText(/nenhuma mudança de status/i);
    expect(apiClient.request).toHaveBeenCalledTimes(1);

    rerender(<HistoricoStatus demandaId="d1" versao={1} />);

    await screen.findByText(/nenhuma mudança de status/i);
    expect(apiClient.request).toHaveBeenCalledTimes(2);
  });
});
