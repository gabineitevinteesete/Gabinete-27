import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DashboardPage from './page';

const useAuthMock = vi.fn();
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => useAuthMock() }));

vi.mock('@/components/ResumoDashboard', () => ({
  ResumoDashboard: () => <div>Resumo do dashboard</div>,
}));
vi.mock('@/components/ProdutividadeAssessores', () => ({
  ProdutividadeAssessores: () => <div>Tabela de produtividade</div>,
}));

describe('DashboardPage', () => {
  it('mostra o conteúdo para o chefe', () => {
    useAuthMock.mockReturnValue({ user: { id: 'chefe-1', role: 'CHEFE' } });

    render(<DashboardPage />);

    expect(screen.getByText('Resumo do dashboard')).toBeInTheDocument();
    expect(screen.getByText('Tabela de produtividade')).toBeInTheDocument();
  });

  it('mostra mensagem de acesso negado para quem não é chefe', () => {
    useAuthMock.mockReturnValue({ user: { id: 'gabinete-1', role: 'ASSESSOR_GABINETE' } });

    render(<DashboardPage />);

    expect(screen.queryByText('Resumo do dashboard')).not.toBeInTheDocument();
    expect(screen.getByText(/acesso restrito ao chefe/i)).toBeInTheDocument();
  });
});
