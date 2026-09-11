import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModalAvisoPrivacidade } from './ModalAvisoPrivacidade';

describe('ModalAvisoPrivacidade', () => {
  it('mostra o texto do aviso e chama onFechar ao clicar em Fechar', () => {
    const onFechar = vi.fn();
    render(<ModalAvisoPrivacidade onFechar={onFechar} />);

    expect(screen.getByText('Aviso de privacidade')).toBeInTheDocument();
    expect(screen.getByText(/O que coletamos:/)).toBeInTheDocument();
    expect(screen.getByText(/Seus direitos:/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(onFechar).toHaveBeenCalled();
  });
});
