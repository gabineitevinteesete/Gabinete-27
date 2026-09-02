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
    expect(screen.getByText(/Em conferência/)).toBeInTheDocument();
  });

  it('mostra mensagem quando não há histórico ainda', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([]);
    render(<HistoricoStatus demandaId="d1" />);
    expect(await screen.findByText(/nenhuma mudança de status/i)).toBeInTheDocument();
  });
});
