import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MaisPage from './page';

const useAuthMock = vi.fn();
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => useAuthMock() }));

describe('MaisPage', () => {
  it('mostra os links de Configurações e Privacidade para o chefe', () => {
    useAuthMock.mockReturnValue({ user: { id: 'chefe-1', role: 'CHEFE' } });

    render(<MaisPage />);

    expect(screen.getByRole('link', { name: /Configurações/ })).toHaveAttribute('href', '/painel/configuracoes');
    expect(screen.getByRole('link', { name: /Privacidade/ })).toHaveAttribute('href', '/painel/privacidade');
  });

  it('mostra mensagem de acesso negado para quem não é chefe', () => {
    useAuthMock.mockReturnValue({ user: { id: 'a1', role: 'ASSESSOR_RUA' } });

    render(<MaisPage />);

    expect(screen.queryByRole('link', { name: /Configurações/ })).not.toBeInTheDocument();
    expect(screen.getByText(/acesso restrito ao chefe/i)).toBeInTheDocument();
  });
});
