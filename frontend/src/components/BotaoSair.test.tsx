import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BotaoSair } from './BotaoSair';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const logout = vi.fn();
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ logout }) }));

const useFilaOfflineMock = vi.fn();
vi.mock('@/hooks/use-fila-offline', () => ({ useFilaOffline: () => useFilaOfflineMock() }));

const confirmSpy = vi.spyOn(window, 'confirm');
const pendente = { id: 'a', usuarioId: 'u1', criadoEm: 1, campos: {}, fotos: [], tentativas: 0, ultimoErro: null };

beforeEach(() => {
  push.mockReset();
  logout.mockReset().mockResolvedValue(undefined);
  useFilaOfflineMock.mockReset();
  confirmSpy.mockReset();
});

describe('BotaoSair', () => {
  it('sai direto quando não há demandas pendentes', async () => {
    useFilaOfflineMock.mockReturnValue({ pendentes: [] });

    render(<BotaoSair />);
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(logout).toHaveBeenCalled();
  });

  it('com pendentes, pergunta antes e não sai se o usuário cancelar', async () => {
    useFilaOfflineMock.mockReturnValue({ pendentes: [pendente] });
    confirmSpy.mockReturnValue(false);

    render(<BotaoSair />);
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Há 1 demanda não enviada neste aparelho. Elas continuam salvas e serão enviadas quando você entrar de novo. Sair mesmo assim?',
    );
    expect(logout).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('com pendentes, sai quando o usuário confirma', async () => {
    useFilaOfflineMock.mockReturnValue({ pendentes: [pendente, { ...pendente, id: 'b' }] });
    confirmSpy.mockReturnValue(true);

    render(<BotaoSair />);
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Há 2 demandas não enviadas'));
    expect(logout).toHaveBeenCalled();
  });
});
