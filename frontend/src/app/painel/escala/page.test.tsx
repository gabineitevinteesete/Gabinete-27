import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EscalaPage from './page';

const useAuthMock = vi.fn();
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => useAuthMock() }));

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient } from '@/services/api-client';

vi.mock('@/lib/calendario', async () => {
  const actual = await vi.importActual<typeof import('@/lib/calendario')>('@/lib/calendario');
  return { ...actual, mesAtual: () => '2026-09' };
});

describe('EscalaPage', () => {
  it('carrega a escala do mês atual e mostra o calendário', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'chefe-1', role: 'CHEFE' } });
    vi.mocked(apiClient.request).mockResolvedValueOnce({ dias: {} });

    render(<EscalaPage />);

    await waitFor(() => expect(apiClient.request).toHaveBeenCalledWith('/escala?mes=2026-09', { auth: true }));
    expect(await screen.findByText('Setembro de 2026')).toBeInTheDocument();
  });

  it('abre o painel do dia ao clicar num dia, editável para o chefe', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'chefe-1', role: 'CHEFE' } });
    vi.mocked(apiClient.request).mockResolvedValueOnce({ dias: {} }).mockResolvedValueOnce([]);

    render(<EscalaPage />);
    await screen.findByText('Setembro de 2026');

    fireEvent.click(screen.getByText('15'));

    expect(await screen.findByText('Escala de 15/09/2026')).toBeInTheDocument();
  });

  it('mostra mensagem de erro quando a API falha', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'a1', role: 'ASSESSOR_RUA' } });
    vi.mocked(apiClient.request).mockRejectedValueOnce(new Error('falhou'));

    render(<EscalaPage />);

    expect(await screen.findByText(/não foi possível carregar a escala/i)).toBeInTheDocument();
  });
});
