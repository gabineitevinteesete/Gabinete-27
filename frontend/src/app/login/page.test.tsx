import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from './page';
import { AuthProvider } from '@/hooks/use-auth';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});

import { apiClient } from '@/services/api-client';

describe('LoginPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.request).mockReset();
    vi.mocked(apiClient.request).mockRejectedValueOnce(new Error('sem sessão'));
  });

  it('mantém o botão desabilitado até telefone e PIN completos', async () => {
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );

    const botao = await screen.findByRole('button', { name: /entrar/i });
    expect(botao).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/telefone/i), { target: { value: '34999998888' } });
    fireEvent.change(screen.getByLabelText(/pin/i), { target: { value: '482913' } });

    await waitFor(() => expect(botao).not.toBeDisabled());
  });

  it('mostra mensagem de erro quando o login falha', async () => {
    vi.mocked(apiClient.request).mockRejectedValueOnce(new (await import('@/services/api-client')).ApiError(401, 'Telefone ou PIN incorretos'));

    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );

    fireEvent.change(await screen.findByLabelText(/telefone/i), { target: { value: '34999998888' } });
    fireEvent.change(screen.getByLabelText(/pin/i), { target: { value: '482913' } });
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByText(/telefone ou pin incorretos/i)).toBeInTheDocument();
  });
});
