import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Sidebar } from './Sidebar';

vi.mock('@/components/BotaoSair', () => ({ BotaoSair: () => <button type="button">Sair</button> }));

describe('Sidebar', () => {
  it('o chefe vê Relatório, Dashboard, Configurações e Privacidade', () => {
    render(<Sidebar role="CHEFE" />);

    expect(screen.getByRole('link', { name: 'Relatório' })).toHaveAttribute('href', '/painel/relatorio');
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Configurações' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacidade' })).toBeInTheDocument();
  });

  it.each(['ASSESSOR_RUA', 'ASSESSOR_GABINETE'] as const)('%s não vê os itens do chefe', (role) => {
    render(<Sidebar role={role} />);

    expect(screen.queryByRole('link', { name: 'Relatório' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Demandas' })).toBeInTheDocument();
  });

  it('some na impressão (print:hidden)', () => {
    const { container } = render(<Sidebar role="CHEFE" />);

    expect(container.querySelector('aside')?.className).toContain('print:hidden');
  });
});
