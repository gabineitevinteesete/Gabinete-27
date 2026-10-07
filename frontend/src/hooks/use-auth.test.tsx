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

import { apiClient, ApiError } from '@/services/api-client';

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
    localStorage.clear();
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

describe('AuthProvider — abrir o app sem internet', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(apiClient.request).mockReset();
    vi.mocked(apiClient.setAccessToken).mockReset();
  });

  function renderizar() {
    return render(
      <AuthProvider>
        <Consumidor />
      </AuthProvider>,
    );
  }

  it('guarda o resumo do usuário (sem token) depois de carregar a sessão', async () => {
    vi.mocked(apiClient.request)
      .mockResolvedValueOnce({ accessToken: 'token-secreto' })
      .mockResolvedValueOnce({ user: USUARIO });

    renderizar();
    await screen.findByText('autenticado: Ana Assessora');

    const guardado = localStorage.getItem('gd:usuario')!;
    expect(JSON.parse(guardado)).toEqual(USUARIO);
    expect(guardado).not.toContain('token-secreto');
  });

  it('sem rede, mantém o usuário guardado em vez de mandar para o login', async () => {
    localStorage.setItem('gd:usuario', JSON.stringify(USUARIO));
    vi.mocked(apiClient.request).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    renderizar();

    expect(await screen.findByText('autenticado: Ana Assessora')).toBeInTheDocument();
  });

  it('sem rede e sem usuário guardado, fica sem sessão', async () => {
    vi.mocked(apiClient.request).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    renderizar();

    expect(await screen.findByText('sem sessão')).toBeInTheDocument();
  });

  it('quando o servidor responde 401, a sessão é inválida e o resumo guardado é apagado', async () => {
    localStorage.setItem('gd:usuario', JSON.stringify(USUARIO));
    vi.mocked(apiClient.request).mockRejectedValueOnce(new ApiError(401, 'Sessão expirada'));

    renderizar();

    expect(await screen.findByText('sem sessão')).toBeInTheDocument();
    expect(localStorage.getItem('gd:usuario')).toBeNull();
  });

  it('o logout apaga o resumo guardado', async () => {
    function BotaoLogout() {
      const { logout } = useAuth();
      return (
        <button type="button" onClick={() => void logout()}>
          sair
        </button>
      );
    }
    vi.mocked(apiClient.request)
      .mockResolvedValueOnce({ accessToken: 't' })
      .mockResolvedValueOnce({ user: USUARIO })
      .mockResolvedValueOnce(undefined);

    render(
      <AuthProvider>
        <Consumidor />
        <BotaoLogout />
      </AuthProvider>,
    );
    await screen.findByText('autenticado: Ana Assessora');
    expect(localStorage.getItem('gd:usuario')).not.toBeNull();

    screen.getByRole('button', { name: 'sair' }).click();

    await waitFor(() => expect(localStorage.getItem('gd:usuario')).toBeNull());
  });
});
