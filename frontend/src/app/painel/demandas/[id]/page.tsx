'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/services/api-client';
import { useAuth } from '@/hooks/use-auth';
import { STATUS_ANTES_DE_PROTOCOLAR, STATUS_LABEL } from '@/lib/request-status';
import type { DemandaDetalhe } from '@/types/request';
import { StatusActions } from '@/components/StatusActions';
import { HistoricoStatus } from '@/components/HistoricoStatus';
import { ReatribuirDemanda } from '@/components/ReatribuirDemanda';

export default function DemandaDetalhePage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const [demanda, setDemanda] = useState<DemandaDetalhe | null>(null);
  const [carregando, setCarregando] = useState(true);
  // Incrementado a cada ação que muda o histórico, para o timeline refazer o fetch.
  const [versaoHistorico, setVersaoHistorico] = useState(0);

  useEffect(() => {
    apiClient
      .request<DemandaDetalhe>(`/demandas/${params.id}`, { auth: true })
      .then(setDemanda)
      // `demanda` continua null e o branch de erro abaixo já cobre a tela; o catch existe
      // só para a falha não virar uma promise rejeitada sem tratamento.
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, [params.id]);

  if (carregando) {
    return <p className="text-sm text-gray-500">Carregando…</p>;
  }

  if (!demanda) {
    return <p className="text-sm text-red-600">Não foi possível carregar esta demanda.</p>;
  }

  const podeEditar =
    user?.role === 'ASSESSOR_GABINETE' ||
    user?.role === 'CHEFE' ||
    (user?.role === 'ASSESSOR_RUA' &&
      demanda.assessorResponsavelId === user.id &&
      (STATUS_ANTES_DE_PROTOCOLAR as string[]).includes(demanda.status));

  const podeMudarStatus = user?.role === 'ASSESSOR_GABINETE' || user?.role === 'CHEFE';
  const ehChefe = user?.role === 'CHEFE';

  return (
    <div className="flex flex-col gap-4 rounded-card bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-primary-dark">{demanda.tituloResumido}</h1>
        {podeEditar && (
          <Link
            href={`/painel/demandas/${demanda.id}/editar`}
            className="rounded-xl bg-secondary px-4 py-2 text-sm font-medium text-white"
          >
            Editar
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs text-gray-500">Código {demanda.codigoInterno} — {demanda.requestTypeNome}</p>
        <span className="inline-block rounded-full bg-primary-light px-3 py-1 text-xs font-medium text-primary-dark">
          {STATUS_LABEL[demanda.status] ?? demanda.status}
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {demanda.fotos.map((foto) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={foto.id} src={foto.url} alt="Foto da demanda" className="h-24 w-24 flex-shrink-0 rounded-lg object-cover" />
        ))}
      </div>

      <div>
        <p className="text-xs font-medium text-gray-600">Solicitante</p>
        <p className="text-sm text-gray-900">{demanda.solicitanteNome}</p>
        <p className="text-sm text-gray-600">{demanda.solicitanteTelefone}</p>
      </div>

      <div>
        <p className="text-xs font-medium text-gray-600">Local</p>
        <p className="text-sm text-gray-900">{demanda.localExato}</p>
        <p className="text-sm text-gray-600">{demanda.bairro ?? 'sem bairro informado'}</p>
      </div>

      <div>
        <p className="text-xs font-medium text-gray-600">Descrição</p>
        <p className="text-sm text-gray-900">{demanda.descricao}</p>
      </div>

      <div>
        <p className="text-xs font-medium text-gray-600">Assessor responsável</p>
        <p className="text-sm text-gray-900">{demanda.assessorResponsavelNome}</p>
      </div>

      {podeMudarStatus && (
        <StatusActions
          demandaId={demanda.id}
          statusAtual={demanda.status}
          onStatusAlterado={(atualizado) => {
            // A resposta do PATCH já é a demanda inteira e atualizada — mesclar tudo evita
            // deixar campos derivados (nome do responsável, updatedAt) desatualizados na tela.
            setDemanda((prev) => (prev ? { ...prev, ...atualizado } : prev));
            setVersaoHistorico((v) => v + 1);
          }}
        />
      )}

      {ehChefe && (
        <ReatribuirDemanda
          demandaId={demanda.id}
          assessorAtualId={demanda.assessorResponsavelId}
          onReatribuido={(atualizado) => {
            setDemanda((prev) => (prev ? { ...prev, ...atualizado } : prev));
            setVersaoHistorico((v) => v + 1);
          }}
        />
      )}

      <div>
        <p className="text-xs font-medium text-gray-600">Histórico</p>
        <HistoricoStatus demandaId={demanda.id} versao={versaoHistorico} />
      </div>
    </div>
  );
}
