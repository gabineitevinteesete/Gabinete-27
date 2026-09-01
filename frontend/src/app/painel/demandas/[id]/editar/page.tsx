'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { CepField } from '@/components/CepField';
import { TipoDemandaChips } from '@/components/TipoDemandaChips';
import { maskPhone } from '@/lib/phone-mask';
import { apiClient, ApiError } from '@/services/api-client';
import type { DemandaDetalhe, TipoDemanda } from '@/types/request';

export default function EditarDemandaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [tipos, setTipos] = useState<TipoDemanda[]>([]);
  const [tipoSelecionadoId, setTipoSelecionadoId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroCarregamento, setErroCarregamento] = useState(false);

  const [solicitanteNome, setSolicitanteNome] = useState('');
  const [solicitanteTelefone, setSolicitanteTelefone] = useState('');
  const [cep, setCep] = useState('');
  const [rua, setRua] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [pontoReferencia, setPontoReferencia] = useState('');
  const [localExato, setLocalExato] = useState('');
  const [tituloResumido, setTituloResumido] = useState('');
  const [descricao, setDescricao] = useState('');
  const [descricaoOutroAssunto, setDescricaoOutroAssunto] = useState('');

  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    Promise.all([
      apiClient.request<DemandaDetalhe>(`/demandas/${params.id}`, { auth: true }),
      apiClient.request<TipoDemanda[]>('/tipos-demanda', { auth: true }),
    ])
      .then(([demanda, listaTipos]) => {
        setTipos(listaTipos);
        setTipoSelecionadoId(demanda.requestTypeId);
        setSolicitanteNome(demanda.solicitanteNome);
        setSolicitanteTelefone(demanda.solicitanteTelefone);
        setCep(demanda.cep ?? '');
        setRua(demanda.rua ?? '');
        setNumero(demanda.numero ?? '');
        setComplemento(demanda.complemento ?? '');
        setBairro(demanda.bairro ?? '');
        setCidade(demanda.cidade ?? '');
        setEstado(demanda.estado ?? '');
        setPontoReferencia(demanda.pontoReferencia ?? '');
        setLocalExato(demanda.localExato ?? '');
        setTituloResumido(demanda.tituloResumido);
        setDescricao(demanda.descricao);
        setDescricaoOutroAssunto(demanda.descricaoOutroAssunto ?? '');
      })
      .catch(() => setErroCarregamento(true))
      .finally(() => setCarregando(false));
  }, [params.id]);

  const tipoSelecionado = useMemo(
    () => tipos.find((t) => t.id === tipoSelecionadoId) ?? null,
    [tipos, tipoSelecionadoId],
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      await apiClient.request(`/demandas/${params.id}`, {
        method: 'PATCH',
        auth: true,
        body: {
          solicitanteNome,
          solicitanteTelefone,
          cep,
          rua,
          numero,
          complemento,
          bairro,
          cidade,
          estado,
          pontoReferencia,
          localExato,
          tituloResumido,
          descricao,
          // Só acompanha o PATCH quando o tipo escolhido pede descrição — assim um tipo
          // comum não grava '' nesta coluna, e apagar o texto num tipo "Outros" continua
          // caindo na validação do backend em vez de passar batido.
          ...(tipoSelecionado?.exigeDescricaoObrigatoria ? { descricaoOutroAssunto } : {}),
          requestTypeId: tipoSelecionadoId ?? undefined,
        },
      });
      router.push(`/painel/demandas/${params.id}`);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível salvar as alterações.');
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return <p className="text-sm text-gray-500">Carregando…</p>;
  }
  if (erroCarregamento) {
    return <p className="text-sm text-red-600">Não foi possível carregar esta demanda para edição.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-md flex-col gap-4 rounded-card bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-primary-dark">Editar demanda</h1>

      <div>
        <p className="mb-2 text-xs font-medium text-gray-600">Tipo de demanda</p>
        <TipoDemandaChips tipos={tipos} selecionadoId={tipoSelecionadoId} onSelecionar={setTipoSelecionadoId} />
      </div>

      {/* Sem este campo, trocar o tipo para um que exige descrição ("Outros") deixava o
          formulário num beco sem saída: o backend recusava com 400 e não havia onde
          preencher a descrição. */}
      {tipoSelecionado?.exigeDescricaoObrigatoria && (
        <TextField
          label="Descreva o assunto"
          name="descricaoOutroAssunto"
          value={descricaoOutroAssunto}
          onChange={(e) => setDescricaoOutroAssunto(e.target.value)}
        />
      )}

      <TextField
        label="Nome do solicitante"
        name="solicitanteNome"
        value={solicitanteNome}
        onChange={(e) => setSolicitanteNome(e.target.value)}
      />
      <TextField
        label="Telefone do solicitante"
        name="solicitanteTelefone"
        inputMode="numeric"
        value={maskPhone(solicitanteTelefone)}
        onChange={(e) => setSolicitanteTelefone(e.target.value)}
      />

      <CepField
        value={cep}
        onChange={setCep}
        onEnderecoEncontrado={(endereco) => {
          setRua(endereco.rua);
          setBairro(endereco.bairro);
          setCidade(endereco.cidade);
          setEstado(endereco.estado);
        }}
      />
      <TextField label="Rua" name="rua" value={rua} onChange={(e) => setRua(e.target.value)} />
      <TextField label="Número" name="numero" value={numero} onChange={(e) => setNumero(e.target.value)} />
      <TextField
        label="Complemento (opcional)"
        name="complemento"
        value={complemento}
        onChange={(e) => setComplemento(e.target.value)}
      />
      <TextField label="Bairro" name="bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
      <TextField label="Cidade" name="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
      <TextField label="Estado" name="estado" value={estado} onChange={(e) => setEstado(e.target.value)} />
      <TextField
        label="Ponto de referência (opcional)"
        name="pontoReferencia"
        value={pontoReferencia}
        onChange={(e) => setPontoReferencia(e.target.value)}
      />
      <TextField
        label="Local exato do problema"
        name="localExato"
        value={localExato}
        onChange={(e) => setLocalExato(e.target.value)}
      />
      <TextField
        label="Título resumido"
        name="tituloResumido"
        value={tituloResumido}
        onChange={(e) => setTituloResumido(e.target.value)}
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="descricao" className="text-sm font-medium text-gray-700">
          Descrição
        </label>
        <textarea
          id="descricao"
          name="descricao"
          rows={4}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          className="rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      <Button type="submit" variant="secondary" disabled={salvando}>
        {salvando ? 'Salvando…' : 'Salvar alterações'}
      </Button>
    </form>
  );
}
