import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EditarDemandaPage from './page';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'demanda-1' }),
  useRouter: () => ({ push }),
}));

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient } from '@/services/api-client';

function demandaFake(overrides: Record<string, unknown> = {}) {
  return {
    id: 'demanda-1', codigoInterno: 'GD-1', tituloResumido: 'Buraco na rua', solicitanteNome: 'Maria',
    solicitanteTelefone: '+5534999990000', solicitanteNascimento: null, bairro: 'Centro', cep: '38400000',
    rua: 'Rua A', numero: '100', complemento: null, cidade: 'Uberlândia', estado: 'MG', pontoReferencia: null,
    localExato: 'Em frente ao 100', status: 'ENVIADA', assessorResponsavelId: 'user-dono',
    assessorResponsavelNome: 'Assessor', requestTypeId: 'tipo-1', requestTypeNome: 'Tapa-buraco', numeroProtocolo: null,
    descricao: 'Descrição detalhada', descricaoOutroAssunto: null, autorizacaoDados: true,
    createdAt: '2026-08-30T10:00:00.000Z', updatedAt: '2026-08-30T10:00:00.000Z', fotos: [],
    ...overrides,
  };
}

beforeEach(() => {
  push.mockReset();
  vi.mocked(apiClient.request).mockReset();
});

describe('EditarDemandaPage', () => {
  it('pré-preenche o formulário com os dados atuais da demanda', async () => {
    vi.mocked(apiClient.request)
      .mockResolvedValueOnce(demandaFake())
      .mockResolvedValueOnce([{ id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false }]);

    render(<EditarDemandaPage />);

    expect(await screen.findByDisplayValue('Maria')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Buraco na rua')).toBeInTheDocument();
  });

  it('salva as alterações com PATCH e volta para o detalhe', async () => {
    vi.mocked(apiClient.request)
      .mockResolvedValueOnce(demandaFake())
      .mockResolvedValueOnce([{ id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false }])
      .mockResolvedValueOnce({ id: 'demanda-1' });

    render(<EditarDemandaPage />);
    const campoTitulo = await screen.findByDisplayValue('Buraco na rua');
    fireEvent.change(campoTitulo, { target: { value: 'Buraco corrigido' } });

    fireEvent.click(screen.getByRole('button', { name: /salvar alterações/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/painel/demandas/demanda-1'));

    const chamada = vi.mocked(apiClient.request).mock.calls[2];
    expect(chamada?.[0]).toBe('/demandas/demanda-1');
    expect((chamada?.[1] as { method: string }).method).toBe('PATCH');
    // Tipo comum não deve gravar '' em descricaoOutroAssunto.
    expect((chamada?.[1] as { body: Record<string, unknown> }).body).not.toHaveProperty('descricaoOutroAssunto');
  });

  it('mostra o campo de descrição ao trocar o tipo para um que a exige, e o envia no PATCH', async () => {
    vi.mocked(apiClient.request)
      .mockResolvedValueOnce(demandaFake())
      .mockResolvedValueOnce([
        { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false },
        { id: 'tipo-outros', nome: 'Outros', exigeDescricaoObrigatoria: true },
      ])
      .mockResolvedValueOnce({ id: 'demanda-1' });

    render(<EditarDemandaPage />);
    await screen.findByDisplayValue('Buraco na rua');

    expect(screen.queryByLabelText(/descreva o assunto/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Outros' }));

    const campoAssunto = await screen.findByLabelText(/descreva o assunto/i);
    fireEvent.change(campoAssunto, { target: { value: 'Poste caído' } });

    fireEvent.click(screen.getByRole('button', { name: /salvar alterações/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/painel/demandas/demanda-1'));

    const corpo = (vi.mocked(apiClient.request).mock.calls[2]?.[1] as { body: Record<string, unknown> }).body;
    expect(corpo.requestTypeId).toBe('tipo-outros');
    expect(corpo.descricaoOutroAssunto).toBe('Poste caído');
  });

  it('pré-preenche a descrição do assunto quando a demanda já é de um tipo que a exige', async () => {
    vi.mocked(apiClient.request)
      .mockResolvedValueOnce(demandaFake({ requestTypeId: 'tipo-outros', descricaoOutroAssunto: 'Assunto original' }))
      .mockResolvedValueOnce([{ id: 'tipo-outros', nome: 'Outros', exigeDescricaoObrigatoria: true }]);

    render(<EditarDemandaPage />);

    expect(await screen.findByDisplayValue('Assunto original')).toBeInTheDocument();
  });

  it('mostra erro quando a permissão é negada (403)', async () => {
    const { ApiError } = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
    vi.mocked(apiClient.request)
      .mockResolvedValueOnce(demandaFake())
      .mockResolvedValueOnce([{ id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false }])
      .mockRejectedValueOnce(new ApiError(403, 'Você não tem permissão para editar esta demanda'));

    render(<EditarDemandaPage />);
    await screen.findByDisplayValue('Buraco na rua');

    fireEvent.click(screen.getByRole('button', { name: /salvar alterações/i }));

    expect(await screen.findByText(/você não tem permissão/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
