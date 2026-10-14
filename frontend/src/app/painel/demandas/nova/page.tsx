'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { CepField } from '@/components/CepField';
import { TipoDemandaChips } from '@/components/TipoDemandaChips';
import { PhotoUploader, type FotoSelecionada } from '@/components/PhotoUploader';
import { ModalAvisoPrivacidade } from '@/components/ModalAvisoPrivacidade';
import { maskPhone } from '@/lib/phone-mask';
import { useAuth } from '@/hooks/use-auth';
import { adicionarPendente } from '@/lib/fila-offline';
import { montarFormData } from '@/lib/sincronizar-fila';
import { gerarUuid } from '@/lib/uuid';
import { apiClient, ApiError } from '@/services/api-client';
import type { TipoDemanda } from '@/types/request';

const CHAVE_CACHE_TIPOS = 'gd:tipos-demanda';

// Cópia dos tipos para a tela abrir sem rede (sem eles não dá para escolher o tipo).
function lerTiposGuardados(): TipoDemanda[] {
  try {
    const bruto = localStorage.getItem(CHAVE_CACHE_TIPOS);
    return bruto ? (JSON.parse(bruto) as TipoDemanda[]) : [];
  } catch {
    return [];
  }
}

function guardarTipos(tipos: TipoDemanda[]): void {
  try {
    localStorage.setItem(CHAVE_CACHE_TIPOS, JSON.stringify(tipos));
  } catch {
    // Sem armazenamento local: a tela só deixa de funcionar offline.
  }
}

export default function NovaDemandaPage() {
  const [salvoOffline, setSalvoOffline] = useState(false);
  // Trocar a chave recria o formulário do zero (limpa campos e fotos) depois de guardar offline.
  const [chave, setChave] = useState(0);

  return (
    <>
      {salvoOffline && (
        <div role="status" className="mx-auto mb-4 max-w-md rounded-xl bg-success-light px-4 py-3 text-sm text-success-dark">
          Demanda salva no celular. Será enviada quando houver sinal.{' '}
          <Link href="/painel/demandas/pendentes" className="font-medium underline">
            Ver pendentes
          </Link>
        </div>
      )}
      <FormularioNovaDemanda
        key={chave}
        onSalvoOffline={() => {
          setSalvoOffline(true);
          setChave((atual) => atual + 1);
        }}
      />
    </>
  );
}

function FormularioNovaDemanda({ onSalvoOffline }: { onSalvoOffline: () => void }) {
  const router = useRouter();
  const { user } = useAuth();
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
  const [avisoAberto, setAvisoAberto] = useState(false);
  const [fotos, setFotos] = useState<FotoSelecionada[]>([]);

  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const ultimoEnvio = useRef<{ assinatura: string; chave: string } | null>(null);

  useEffect(() => {
    apiClient
      .request<TipoDemanda[]>('/tipos-demanda', { auth: true })
      .then((lista) => {
        setTipos(lista);
        guardarTipos(lista);
      })
      .catch(() => setTipos(lerTiposGuardados()));
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
    const campos: Record<string, string> = {
      solicitanteNome,
      solicitanteTelefone,
      localExato,
      tituloResumido,
      descricao,
      requestTypeId: tipoSelecionadoId,
      autorizacaoDados: String(autorizacaoDados),
    };
    const opcionais: Record<string, string> = {
      solicitanteNascimento,
      cep,
      rua,
      numero,
      complemento,
      bairro,
      cidade,
      estado,
      pontoReferencia,
      descricaoOutroAssunto,
    };
    Object.entries(opcionais).forEach(([chave, valor]) => {
      if (valor) campos[chave] = valor;
    });
    const arquivos = fotos.map((foto) => foto.blob);
    // Código deste envio: o servidor o usa para reconhecer um reenvio (resposta perdida, fila offline)
    // e não criar a demanda duas vezes. A fila guarda a demanda com este mesmo código. Enquanto o
    // formulário não mudar, uma nova tentativa (ex.: depois de um 502 em que o servidor chegou a gravar)
    // reaproveita o código; se o assessor editar qualquer coisa, é um envio novo.
    const assinatura = JSON.stringify([campos, fotos.map((foto) => foto.id)]);
    if (ultimoEnvio.current?.assinatura !== assinatura) {
      ultimoEnvio.current = { assinatura, chave: gerarUuid() };
    }
    const chave = ultimoEnvio.current.chave;

    async function guardarNoAparelho() {
      if (!user) {
        setErro('Sem conexão. Entre novamente para guardar a demanda no aparelho.');
        return;
      }
      try {
        await adicionarPendente({ id: chave, usuarioId: user.id, campos, fotos: arquivos });
        onSalvoOffline();
      } catch {
        setErro('Sem conexão e não foi possível guardar a demanda neste aparelho. Tente novamente.');
      }
    }

    try {
      if (navigator.onLine === false) {
        await guardarNoAparelho();
        return;
      }
      const formData = montarFormData({ campos, fotos: arquivos });
      const demanda = await apiClient.request<{ id: string }>('/demandas', {
        method: 'POST',
        body: formData,
        auth: true,
        headers: { 'Idempotency-Key': chave },
      });
      router.push(`/painel/demandas/${demanda.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setErro(err.message);
      } else {
        // Sem resposta do servidor (sem rede): a demanda fica guardada e sai quando houver sinal.
        await guardarNoAparelho();
      }
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

      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={autorizacaoDados}
            onChange={(e) => setAutorizacaoDados(e.target.checked)}
            className="mt-1"
          />
          Autorizo o uso e armazenamento dos dados desta demanda pelo gabinete, conforme o aviso de privacidade.
        </label>
        <button
          type="button"
          onClick={() => setAvisoAberto(true)}
          className="w-fit text-xs font-medium text-primary-dark hover:underline"
        >
          Ver aviso de privacidade
        </button>
      </div>

      {avisoAberto && <ModalAvisoPrivacidade onFechar={() => setAvisoAberto(false)} />}

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      <Button type="submit" variant="secondary" disabled={!formValido || enviando}>
        {enviando ? 'Enviando…' : 'Enviar demanda'}
      </Button>
    </form>
  );
}
