import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PrivacidadePage from './page';

const useAuthMock = vi.fn();
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => useAuthMock() }));

vi.mock('@/components/BuscaCidadao', () => ({
  BuscaCidadao: () => <div>Busca de cidadão</div>,
}));

describe('PrivacidadePage', () => {
  it('mostra o conteúdo para o chefe', () => {
    useAuthMock.mockReturnValue({ user: { id: 'chefe-1', role: 'CHEFE' } });

    render(<PrivacidadePage />);

    expect(screen.getByText('Busca de cidadão')).toBeInTheDocument();
  });

  it('mostra mensagem de acesso negado para quem não é chefe', () => {
    useAuthMock.mockReturnValue({ user: { id: 'a1', role: 'ASSESSOR_RUA' } });

    render(<PrivacidadePage />);

    expect(screen.queryByText('Busca de cidadão')).not.toBeInTheDocument();
    expect(screen.getByText(/acesso restrito ao chefe/i)).toBeInTheDocument();
  });
});
