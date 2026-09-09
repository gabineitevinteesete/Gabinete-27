import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AssessoresPage from './page';

const useAuthMock = vi.fn();
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => useAuthMock() }));

vi.mock('@/components/ListaAssessores', () => ({
  ListaAssessores: () => <div>Lista de assessores</div>,
}));

describe('AssessoresPage', () => {
  it('mostra o conteúdo para o chefe', () => {
    useAuthMock.mockReturnValue({ user: { id: 'chefe-1', role: 'CHEFE' } });

    render(<AssessoresPage />);

    expect(screen.getByText('Lista de assessores')).toBeInTheDocument();
  });

  it('mostra mensagem de acesso negado para quem não é chefe', () => {
    useAuthMock.mockReturnValue({ user: { id: 'a1', role: 'ASSESSOR_RUA' } });

    render(<AssessoresPage />);

    expect(screen.queryByText('Lista de assessores')).not.toBeInTheDocument();
    expect(screen.getByText(/acesso restrito ao chefe/i)).toBeInTheDocument();
  });
});
