import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PrimeiroAcessoPage from './page';
import { AuthProvider } from '@/hooks/use-auth';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams('userId=user-123'),
}));

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});

import { apiClient } from '@/services/api-client';

describe('PrimeiroAcessoPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.request).mockReset();
    vi.mocked(apiClient.request).mockRejectedValueOnce(new Error('sem sessão'));
  });

  it('mostra erro quando os dois PINs não coincidem', async () => {
    render(
      <AuthProvider>
        <PrimeiroAcessoPage />
      </AuthProvider>,
    );

    fireEvent.change(await screen.findByLabelText(/novo pin/i), { target: { value: '482913' } });
    fireEvent.change(screen.getByLabelText(/confirme o pin/i), { target: { value: '482914' } });
    fireEvent.click(screen.getByRole('button', { name: /criar pin/i }));

    expect(await screen.findByText(/os pins não coincidem/i)).toBeInTheDocument();
    expect(apiClient.request).toHaveBeenCalledTimes(1);
  });

  it('envia o novo PIN e redireciona para o painel em caso de sucesso', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({
      accessToken: 'token-novo',
      user: { id: 'user-123', nome: 'Teste', telefone: '+5534999998888', role: 'ASSESSOR_RUA', ativo: true, pinDefinido: true },
    } as never);

    render(
      <AuthProvider>
        <PrimeiroAcessoPage />
      </AuthProvider>,
    );

    fireEvent.change(screen.getByLabelText(/novo pin/i), { target: { value: '482913' } });
    fireEvent.change(screen.getByLabelText(/confirme o pin/i), { target: { value: '482913' } });
    fireEvent.click(screen.getByRole('button', { name: /criar pin/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/painel'));
  });
});
