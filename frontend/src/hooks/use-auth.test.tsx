import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/hooks/use-auth';

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return {
    ...actual,
    apiClient: { ...actual.apiClient, request: vi.fn(), setAccessToken: vi.fn() },
  };
});

import { apiClient } from '@/services/api-client';

function Consumidor() {
  const { user, loading } = useAuth();
  if (loading) return <p>carregando</p>;
  return <p>{user ? `autenticado: ${user.nome}` : 'sem sessão'}</p>;
}

const USUARIO = {
  id: 'u-1',
  nome: 'Ana Assessora',
  telefone: '+5534999998888',
  role: 'ASSESSOR_RUA' as const,
  ativo: true,
  pinDefinido: true,
};

describe('AuthProvider — restauração da sessão na montagem', () => {
  beforeEach(() => {
    vi.mocked(apiClient.request).mockReset();
    vi.mocked(apiClient.setAccessToken).mockReset();
  });

  // I1: antes, o provider só guardava o accessToken e deixava `user` null, então um reload
  // de página derrubava o usuário de volta para /login mesmo com cookie de refresh válido.
  it('busca /auth/me após o refresh e popula o usuário', async () => {
    vi.mocked(apiClient.request)
      .mockResolvedValueOnce({ accessToken: 'token-novo' })
      .mockResolvedValueOnce({ user: USUARIO });

    render(
      <AuthProvider>
        <Consumidor />
      </AuthProvider>,
    );

    expect(await screen.findByText('autenticado: Ana Assessora')).toBeInTheDocument();
    expect(vi.mocked(apiClient.request).mock.calls[0]?.[0]).toBe('/auth/refresh');
    expect(vi.mocked(apiClient.request).mock.calls[1]?.[0]).toBe('/auth/me');
    expect(apiClient.setAccessToken).toHaveBeenCalledWith('token-novo');
  });

  it('fica sem sessão quando o refresh falha', async () => {
    vi.mocked(apiClient.request).mockRejectedValueOnce(new Error('sem cookie'));

    render(
      <AuthProvider>
        <Consumidor />
      </AuthProvider>,
    );

    expect(await screen.findByText('sem sessão')).toBeInTheDocument();
    expect(apiClient.setAccessToken).toHaveBeenCalledWith(null);
  });

  it('fica sem sessão quando o /auth/me falha depois de um refresh bem-sucedido', async () => {
    vi.mocked(apiClient.request)
      .mockResolvedValueOnce({ accessToken: 'token-novo' })
      .mockRejectedValueOnce(new Error('usuário desativado'));

    render(
      <AuthProvider>
        <Consumidor />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('sem sessão')).toBeInTheDocument());
    expect(apiClient.setAccessToken).toHaveBeenLastCalledWith(null);
  });
});
