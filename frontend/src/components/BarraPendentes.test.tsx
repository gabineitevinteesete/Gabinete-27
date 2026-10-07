import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BarraPendentes } from './BarraPendentes';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const useFilaOfflineMock = vi.fn();
vi.mock('@/hooks/use-fila-offline', () => ({ useFilaOffline: () => useFilaOfflineMock() }));

const pendente = { id: 'a', usuarioId: 'u1', criadoEm: 1, campos: {}, fotos: [], tentativas: 0, ultimoErro: null };

beforeEach(() => {
  useFilaOfflineMock.mockReset();
});

describe('BarraPendentes', () => {
  it('não aparece quando não há pendentes', () => {
    useFilaOfflineMock.mockReturnValue({ pendentes: [], sincronizando: false });

    const { container } = render(<BarraPendentes />);

    expect(container).toBeEmptyDOMElement();
  });

  it('mostra a contagem no singular e o link para os pendentes', () => {
    useFilaOfflineMock.mockReturnValue({ pendentes: [pendente], sincronizando: false });

    render(<BarraPendentes />);

    expect(screen.getByText('1 demanda aguardando envio')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver' })).toHaveAttribute('href', '/painel/demandas/pendentes');
  });

  it('mostra a contagem no plural e que está enviando', () => {
    useFilaOfflineMock.mockReturnValue({ pendentes: [pendente, { ...pendente, id: 'b' }], sincronizando: true });

    render(<BarraPendentes />);

    expect(screen.getByText('2 demandas aguardando envio — enviando…')).toBeInTheDocument();
  });
});
