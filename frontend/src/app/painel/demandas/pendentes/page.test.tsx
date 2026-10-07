import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DemandasPendentesPage from './page';

const useFilaOfflineMock = vi.fn();
vi.mock('@/hooks/use-fila-offline', () => ({ useFilaOffline: () => useFilaOfflineMock() }));

const acoes = {
  sincronizarAgora: vi.fn(),
  descartar: vi.fn(),
  tentarDeNovo: vi.fn(),
};

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a',
    usuarioId: 'u1',
    criadoEm: new Date('2026-10-07T12:00:00-03:00').getTime(),
    campos: { tituloResumido: 'Buraco na rua', solicitanteNome: 'Maria' },
    fotos: [],
    tentativas: 0,
    ultimoErro: null,
    ...overrides,
  };
}

const confirmSpy = vi.spyOn(window, 'confirm');

beforeEach(() => {
  Object.values(acoes).forEach((fn) => fn.mockReset());
  useFilaOfflineMock.mockReset();
  confirmSpy.mockReset();
});

afterEach(() => {
  confirmSpy.mockReset();
});

describe('DemandasPendentesPage', () => {
  it('mostra a mensagem de lista vazia', () => {
    useFilaOfflineMock.mockReturnValue({ pendentes: [], sincronizando: false, ...acoes });

    render(<DemandasPendentesPage />);

    expect(screen.getByText('Nenhuma demanda pendente.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar agora' })).not.toBeInTheDocument();
  });

  it('lista a demanda aguardando sinal e permite enviar agora', () => {
    useFilaOfflineMock.mockReturnValue({ pendentes: [item()], sincronizando: false, ...acoes });

    render(<DemandasPendentesPage />);

    expect(screen.getByText('Buraco na rua')).toBeInTheDocument();
    expect(screen.getByText(/Maria/)).toBeInTheDocument();
    expect(screen.getByText('Aguardando sinal')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar agora' }));
    expect(acoes.sincronizarAgora).toHaveBeenCalled();
  });

  it('mostra o motivo da recusa e permite tentar de novo', () => {
    useFilaOfflineMock.mockReturnValue({
      pendentes: [item({ ultimoErro: 'Telefone do solicitante inválido' })],
      sincronizando: false,
      ...acoes,
    });

    render(<DemandasPendentesPage />);

    expect(screen.getByText('Recusada: Telefone do solicitante inválido')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(acoes.tentarDeNovo).toHaveBeenCalledWith('a');
  });

  it('descarta só depois de confirmar', () => {
    useFilaOfflineMock.mockReturnValue({ pendentes: [item({ ultimoErro: 'inválido' })], sincronizando: false, ...acoes });
    render(<DemandasPendentesPage />);

    confirmSpy.mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(acoes.descartar).not.toHaveBeenCalled();

    confirmSpy.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(acoes.descartar).toHaveBeenCalledWith('a');
  });

  it('desabilita o envio enquanto sincroniza', () => {
    useFilaOfflineMock.mockReturnValue({ pendentes: [item()], sincronizando: true, ...acoes });

    render(<DemandasPendentesPage />);

    expect(screen.getByRole('button', { name: 'Enviando…' })).toBeDisabled();
  });
});
