import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResumoDashboard } from './ResumoDashboard';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient } from '@/services/api-client';

const resumoFake = {
  porStatus: [
    { status: 'ENVIADA', quantidade: 3 },
    { status: 'PROTOCOLADA', quantidade: 5 },
  ],
  porBairro: [{ bairro: 'Centro', quantidade: 2 }],
  porAssessor: [{ assessorId: 'a1', assessorNome: 'Ana', quantidade: 4 }],
  paradas: [
    { id: 'd1', codigoInterno: 'GD-1', tituloResumido: 'Buraco', assessorResponsavelNome: 'Ana', status: 'EM_CONFERENCIA', diasParada: 3 },
  ],
};

beforeEach(() => {
  vi.mocked(apiClient.request).mockReset();
});

describe('ResumoDashboard', () => {
  it('mostra os 4 blocos com os dados carregados', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce(resumoFake);

    render(<ResumoDashboard />);

    expect(await screen.findByText('Centro')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText(/GD-1/)).toBeInTheDocument();
    expect(screen.getByText(/3 dias/)).toBeInTheDocument();
  });

  it('cada contagem é um link para a listagem já filtrada', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce(resumoFake);

    render(<ResumoDashboard />);
    await screen.findByText('Centro');

    expect(screen.getByRole('link', { name: /Centro/ })).toHaveAttribute('href', '/painel/demandas?bairro=Centro');
    expect(screen.getByRole('link', { name: /Ana/ })).toHaveAttribute('href', '/painel/demandas?assessorResponsavelId=a1');
  });

  it('mostra mensagem quando não há demandas paradas', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({ ...resumoFake, paradas: [] });

    render(<ResumoDashboard />);

    expect(await screen.findByText(/nenhuma demanda parada/i)).toBeInTheDocument();
  });

  it('mostra erro quando a API rejeita', async () => {
    vi.mocked(apiClient.request).mockRejectedValueOnce(new Error('falhou'));

    render(<ResumoDashboard />);

    expect(await screen.findByText(/não foi possível carregar/i)).toBeInTheDocument();
  });
});
