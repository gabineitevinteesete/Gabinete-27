import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MobileNav } from './MobileNav';

vi.mock('@/components/BotaoSair', () => ({
  BotaoSair: () => <button type="button">Sair</button>,
}));

describe('MobileNav', () => {
  it('mostra o item "Mais" para o chefe', () => {
    render(<MobileNav role="CHEFE" />);

    const link = screen.getByRole('link', { name: 'Mais' });
    expect(link).toHaveAttribute('href', '/painel/mais');
  });

  it('não mostra o item "Mais" para assessores', () => {
    render(<MobileNav role="ASSESSOR_RUA" />);

    expect(screen.queryByRole('link', { name: 'Mais' })).not.toBeInTheDocument();
  });
});
