import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConfiguracoesPage from './page';

const useAuthMock = vi.fn();
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => useAuthMock() }));

vi.mock('@/components/ListaTiposDemanda', () => ({
  ListaTiposDemanda: () => <div>Lista de tipos de demanda</div>,
}));

describe('ConfiguracoesPage', () => {
  it('mostra o conteúdo para o chefe', () => {
    useAuthMock.mockReturnValue({ user: { id: 'chefe-1', role: 'CHEFE' } });

    render(<ConfiguracoesPage />);

    expect(screen.getByText('Lista de tipos de demanda')).toBeInTheDocument();
  });

  it('mostra mensagem de acesso negado para quem não é chefe', () => {
    useAuthMock.mockReturnValue({ user: { id: 'a1', role: 'ASSESSOR_RUA' } });

    render(<ConfiguracoesPage />);

    expect(screen.queryByText('Lista de tipos de demanda')).not.toBeInTheDocument();
    expect(screen.getByText(/acesso restrito ao chefe/i)).toBeInTheDocument();
  });
});
