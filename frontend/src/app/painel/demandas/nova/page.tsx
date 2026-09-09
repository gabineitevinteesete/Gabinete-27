'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { CepField } from '@/components/CepField';
import { TipoDemandaChips } from '@/components/TipoDemandaChips';
import { PhotoUploader, type FotoSelecionada } from '@/components/PhotoUploader';
import { maskPhone } from '@/lib/phone-mask';
import { apiClient, ApiError } from '@/services/api-client';
import type { TipoDemanda } from '@/types/request';

export default function NovaDemandaPage() {
  const router = useRouter();
  const [tipos, setTipos] = useState<TipoDemanda[]>([]);
  const [tipoSelecionadoId, setTipoSelecionadoId] = useState<string | null>(null);

  const [solicitanteNome, setSolicitanteNome] = useState('');
  const [solicitanteTelefone, setSolicitanteTelefone] = useState('');
  const [solicitanteNascimento, setSolicitanteNascimento] = useState('');
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
  const [autorizacaoDados, setAutorizacaoDados] = useState(false);
  const [fotos, setFotos] = useState<FotoSelecionada[]>([]);

  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    apiClient
      .request<TipoDemanda[]>('/tipos-demanda', { auth: true })
      .then(setTipos)
      .catch(() => setTipos([]));
  }, []);

  const tipoSelecionado = useMemo(() => tipos.find((t) => t.id === tipoSelecionadoId) ?? null, [tipos, tipoSelecionadoId]);

  const formValido =
    solicitanteNome.trim().length > 1 &&
    solicitanteTelefone.replace(/\D/g, '').length >= 10 &&
    localExato.trim().length > 1 &&
    tituloResumido.trim().length > 1 &&
    descricao.trim().length > 1 &&
    tipoSelecionadoId !== null &&
    (!tipoSelecionado?.exigeDescricaoObrigatoria || descricaoOutroAssunto.trim().length > 0) &&
    autorizacaoDados &&
    fotos.length >= 2 &&
    fotos.length <= 4;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErro(null);

    if (!formValido || !tipoSelecionadoId) {
      setErro('Preencha todos os campos obrigatórios e adicione de 2 a 4 fotos.');
      return;
    }

    setEnviando(true);
    try {
      const formData = new FormData();
      formData.append('solicitanteNome', solicitanteNome);
      formData.append('solicitanteTelefone', solicitanteTelefone);
      if (solicitanteNascimento) formData.append('solicitanteNascimento', solicitanteNascimento);
      if (cep) formData.append('cep', cep);
      if (rua) formData.append('rua', rua);
      if (numero) formData.append('numero', numero);
      if (complemento) formData.append('complemento', complemento);
      if (bairro) formData.append('bairro', bairro);
      if (cidade) formData.append('cidade', cidade);
      if (estado) formData.append('estado', estado);
      if (pontoReferencia) formData.append('pontoReferencia', pontoReferencia);
      formData.append('localExato', localExato);
      formData.append('tituloResumido', tituloResumido);
      formData.append('descricao', descricao);
      if (descricaoOutroAssunto) formData.append('descricaoOutroAssunto', descricaoOutroAssunto);
      formData.append('requestTypeId', tipoSelecionadoId);
      formData.append('autorizacaoDados', String(autorizacaoDados));
      fotos.forEach((foto, indice) => formData.append('fotos', foto.blob, `foto-${indice}.jpg`));

      const demanda = await apiClient.request<{ id: string }>('/demandas', { method: 'POST', body: formData, auth: true });
      router.push(`/painel/demandas/${demanda.id}`);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível enviar a demanda. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-md flex-col gap-4 rounded-card bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-primary-dark">Nova demanda</h1>

      <PhotoUploader fotos={fotos} onChange={setFotos} />

      <div>
        <p className="mb-2 text-xs font-medium text-gray-600">Tipo de demanda</p>
        <TipoDemandaChips tipos={tipos} selecionadoId={tipoSelecionadoId} onSelecionar={setTipoSelecionadoId} />
      </div>

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
      <TextField
        label="Data de nascimento (opcional)"
        name="solicitanteNascimento"
        type="date"
        value={solicitanteNascimento}
        onChange={(e) => setSolicitanteNascimento(e.target.value)}
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

      <label className="flex items-start gap-2 text-xs text-gray-600">
        <input
          type="checkbox"
          checked={autorizacaoDados}
          onChange={(e) => setAutorizacaoDados(e.target.checked)}
          className="mt-1"
        />
        Autorizo o uso e armazenamento dos dados desta demanda pelo gabinete, conforme o aviso de privacidade.
      </label>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      <Button type="submit" variant="secondary" disabled={!formValido || enviando}>
        {enviando ? 'Enviando…' : 'Enviar demanda'}
      </Button>
    </form>
  );
}
