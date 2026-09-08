'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/services/api-client';
import { STATUS_LABEL } from '@/lib/request-status';
import type { ResumoDashboard as ResumoDashboardData } from '@/types/request';

function Barra({ label, quantidade, maximo, href }: { label: string; quantidade: number; maximo: number; href?: string }) {
  const percentual = maximo === 0 ? 0 : Math.round((quantidade / maximo) * 100);
  return (
    <div className="mb-2">
      <div className="flex justify-between text-sm">
        {href ? (
          <Link href={href} className="text-primary-dark hover:underline">
            {label}
          </Link>
        ) : (
          <span className="text-primary-dark">{label}</span>
        )}
        <span className="font-medium">{quantidade}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-gray-100">
        <div className="h-2 rounded-full bg-primary" style={{ width: `${percentual}%` }} />
      </div>
    </div>
  );
}

export function ResumoDashboard() {
  const [dados, setDados] = useState<ResumoDashboardData | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    apiClient
      .request<ResumoDashboardData>('/dashboard/resumo', { auth: true })
      .then(setDados)
      .catch(() => setErro(true))
      .finally(() => setCarregando(false));
  }, []);

  if (carregando) return <p className="text-sm text-gray-500">Carregando…</p>;
  if (erro || !dados) return <p className="text-sm text-red-600">Não foi possível carregar o resumo.</p>;

  const maximoStatus = Math.max(1, ...dados.porStatus.map((s) => s.quantidade));
  const maximoBairro = Math.max(1, ...dados.porBairro.map((b) => b.quantidade));
  const maximoAssessor = Math.max(1, ...dados.porAssessor.map((a) => a.quantidade));

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="rounded-card bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-primary-dark">Status das demandas</h2>
        {dados.porStatus.map((item) => (
          <Barra
            key={item.status}
            label={STATUS_LABEL[item.status]}
            quantidade={item.quantidade}
            maximo={maximoStatus}
            href={`/painel/demandas?status=${item.status}`}
          />
        ))}
      </div>

      <div className="rounded-card bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-primary-dark">Demandas por bairro</h2>
        {dados.porBairro.map((item) => (
          <Barra
            key={item.bairro}
            label={item.bairro}
            quantidade={item.quantidade}
            maximo={maximoBairro}
            href={item.bairro === 'Sem bairro' ? undefined : `/painel/demandas?bairro=${encodeURIComponent(item.bairro)}`}
          />
        ))}
      </div>

      <div className="rounded-card bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-primary-dark">Carga por assessor responsável</h2>
        {dados.porAssessor.map((item) => (
          <Barra
            key={item.assessorId}
            label={item.assessorNome}
            quantidade={item.quantidade}
            maximo={maximoAssessor}
            href={`/painel/demandas?assessorResponsavelId=${item.assessorId}`}
          />
        ))}
      </div>

      <div className="rounded-card bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-primary-dark">Demandas paradas (2+ dias)</h2>
        {dados.paradas.length === 0 && <p className="text-sm text-gray-500">Nenhuma demanda parada.</p>}
        <ul className="flex flex-col gap-2">
          {dados.paradas.map((item) => (
            <li key={item.id}>
              <Link
                href={`/painel/demandas/${item.id}`}
                className="block rounded-xl border border-gray-200 p-2 text-sm hover:bg-gray-50"
              >
                <p className="font-medium text-gray-900">
                  {item.codigoInterno} — {item.tituloResumido}
                </p>
                <p className="text-xs text-gray-600">
                  {item.assessorResponsavelNome} — {STATUS_LABEL[item.status]} — {item.diasParada} dias parada
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
