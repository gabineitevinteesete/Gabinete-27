import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PainelLayout from './layout';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const useAuthMock = vi.fn();
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => useAuthMock(),
}));

describe('PainelLayout', () => {
  beforeEach(() => {
    push.mockClear();
    useAuthMock.mockReset();
  });

  it('redireciona para /login quando não há usuário autenticado', async () => {
    useAuthMock.mockReturnValue({ user: null, loading: false });

    render(<PainelLayout>conteúdo</PainelLayout>);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'));
  });

  it('renderiza o conteúdo quando o usuário está autenticado', async () => {
    useAuthMock.mockReturnValue({
      user: { id: '1', nome: 'Ana', telefone: '+5534999998888', role: 'ASSESSOR_RUA', ativo: true, pinDefinido: true },
      loading: false,
    });

    render(<PainelLayout>conteúdo do painel</PainelLayout>);

    expect(await screen.findByText('conteúdo do painel')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('não redireciona enquanto ainda está carregando a sessão', () => {
    useAuthMock.mockReturnValue({ user: null, loading: true });

    render(<PainelLayout>conteúdo</PainelLayout>);

    expect(push).not.toHaveBeenCalled();
  });
});
