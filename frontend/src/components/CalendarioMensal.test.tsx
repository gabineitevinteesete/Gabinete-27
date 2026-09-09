import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CalendarioMensal } from './CalendarioMensal';

const escalaFake = {
  '2026-09-15': [
    { userId: 'a1', userNome: 'Ana', local: 'RUA' as const },
    { userId: 'a2', userNome: 'Beto', local: 'GABINETE' as const },
  ],
};

describe('CalendarioMensal', () => {
  it('mostra os dias do mês e o resumo de quem está escalado', () => {
    render(
      <CalendarioMensal mes="2026-09" escalaPorDia={escalaFake} onSelecionarDia={() => {}} onMudarMes={() => {}} />,
    );

    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('1 gabinete · 1 rua')).toBeInTheDocument();
  });

  it('chama onSelecionarDia com a data certa ao clicar num dia', () => {
    const onSelecionarDia = vi.fn();
    render(
      <CalendarioMensal mes="2026-09" escalaPorDia={escalaFake} onSelecionarDia={onSelecionarDia} onMudarMes={() => {}} />,
    );

    fireEvent.click(screen.getByText('15'));

    expect(onSelecionarDia).toHaveBeenCalledWith('2026-09-15');
  });

  it('chama onMudarMes com o mês anterior/seguinte ao navegar', () => {
    const onMudarMes = vi.fn();
    render(<CalendarioMensal mes="2026-09" escalaPorDia={{}} onSelecionarDia={() => {}} onMudarMes={onMudarMes} />);

    fireEvent.click(screen.getByLabelText('Próximo mês'));
    expect(onMudarMes).toHaveBeenCalledWith('2026-10');

    fireEvent.click(screen.getByLabelText('Mês anterior'));
    expect(onMudarMes).toHaveBeenCalledWith('2026-08');
  });
});
