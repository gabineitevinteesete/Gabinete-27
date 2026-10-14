'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { apiClient, ApiError } from '@/services/api-client';
import { STATUS_LABEL } from '@/lib/request-status';
import type { RelatorioPeriodo } from '@/types/request';

const MAXIMO_DIAS = 366;
const BAIRROS_EXIBIDOS = 15;
const DIA_MS = 24 * 60 * 60 * 1000;

function formatarDia(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
}

function periodoPadrao(): { de: string; ate: string } {
  const hoje = new Date();
  return { de: formatarDia(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate: formatarDia(hoje) };
}

/** Dias do período (extremos inclusos) ou null se alguma data estiver vazia/incompleta. */
function contarDias(de: string, ate: string): number | null {
  const inicio = Date.parse(`${de}T00:00:00Z`);
  const fim = Date.parse(`${ate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate) || Number.isNaN(inicio) || Number.isNaN(fim)) return null;
  return Math.round((fim - inicio) / DIA_MS) + 1;
}

function dataPorExtenso(dia: string): string {
  const [ano, mes, d] = dia.split('-');
  return `${d}/${mes}/${ano}`;
}

function Tabela({
  titulo,
  colunaNome,
  linhas,
}: {
  titulo: string;
  colunaNome: string;
  linhas: { nome: string; quantidade: number }[];
}) {
  return (
    <section className="break-inside-avoid rounded-card bg-white p-4 shadow-sm print:rounded-none print:shadow-none">
      <h2 className="mb-2 text-sm font-semibold text-primary-dark">{titulo}</h2>
      {linhas.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhuma demanda no período.</p>
      ) : (
        <table aria-label={titulo} className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-300 text-left text-xs text-gray-600">
              <th scope="col" className="py-1 font-medium">
                {colunaNome}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Demandas
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha, indice) => (
              // Nomes podem repetir (dois assessores iguais, um bairro chamado "Outros"): o índice desempata.
              <tr key={`${indice}-${linha.nome}`} className="border-b border-gray-100">
                <td className="py-1">{linha.nome}</td>
                <td className="py-1 text-right font-medium">{linha.quantidade}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function RelatorioPage() {
  const { user } = useAuth();
  const padrao = periodoPadrao();
  const [de, setDe] = useState(padrao.de);
  const [ate, setAte] = useState(padrao.ate);
  const [dados, setDados] = useState<RelatorioPeriodo | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [geradoEm, setGeradoEm] = useState<Date | null>(null);

  const dias = contarDias(de, ate);
  const aviso =
    dias === null
      ? 'Informe as duas datas.'
      : dias < 1
        ? 'A data final não pode ser anterior à inicial.'
        : dias > MAXIMO_DIAS
          ? `O período pode ter no máximo ${MAXIMO_DIAS} dias.`
          : null;
  const ehChefe = user?.role === 'CHEFE';

  useEffect(() => {
    if (!ehChefe) return;
    if (aviso !== null) {
      // Período inválido: nada em andamento nem erro antigo na tela, só o aviso.
      setCarregando(false);
      setErro(null);
      return;
    }
    // Ignora respostas de períodos antigos que cheguem depois de uma escolha mais nova.
    let ativo = true;
    setCarregando(true);
    setErro(null);
    apiClient
      .request<RelatorioPeriodo>(`/dashboard/relatorio?${new URLSearchParams({ de, ate }).toString()}`, { auth: true })
      .then((resposta) => {
        if (!ativo) return;
        setDados(resposta);
        setGeradoEm(new Date());
      })
      .catch((err) => {
        if (!ativo) return;
        setDados(null);
        setErro(err instanceof ApiError ? err.message : 'Não foi possível carregar o relatório. Tente novamente.');
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [ehChefe, aviso, de, ate]);

  if (!ehChefe) {
    return <p className="text-sm text-red-600">Acesso restrito ao chefe.</p>;
  }

  // Muitos bairros enchem a página: os maiores aparecem e o resto é somado em "Outros".
  const bairros = (dados?.porBairro ?? []).map((b) => ({ nome: b.bairro, quantidade: b.quantidade }));
  const bairrosExibidos = bairros.slice(0, BAIRROS_EXIBIDOS);
  const outros = bairros.slice(BAIRROS_EXIBIDOS).reduce((soma, b) => soma + b.quantidade, 0);
  if (outros > 0) bairrosExibidos.push({ nome: 'Outros', quantidade: outros });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 print:hidden">
        <h1 className="text-lg font-semibold text-primary-dark">Relatório por período</h1>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="relatorio-de" className="text-xs font-medium text-gray-600">
              De
            </label>
            <input
              id="relatorio-de"
              type="date"
              value={de}
              onChange={(e) => setDe(e.target.value)}
              className="mt-1 block rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label htmlFor="relatorio-ate" className="text-xs font-medium text-gray-600">
              Até
            </label>
            <input
              id="relatorio-ate"
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="mt-1 block rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={dados === null || carregando || aviso !== null}
            className="rounded-xl bg-secondary px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Imprimir / salvar em PDF
          </button>
        </div>
        {aviso && (
          <p role="alert" className="text-sm text-red-600">
            {aviso}
          </p>
        )}
        {erro && (
          <p role="alert" className="text-sm text-red-600">
            {erro}
          </p>
        )}
        {carregando && (
          <p role="status" className="text-sm text-gray-500">
            Carregando…
          </p>
        )}
      </div>

      {dados && aviso === null && (
        <article className="flex flex-col gap-4">
          <header>
            <h2 className="text-lg font-semibold text-primary-dark">Relatório de demandas</h2>
            <p className="text-sm text-gray-600">
              Demandas registradas de {dataPorExtenso(dados.de)} a {dataPorExtenso(dados.ate)}
            </p>
            <p className="mt-2 text-3xl font-semibold text-primary-dark">
              {dados.total} <span className="text-base font-normal text-gray-600">{dados.total === 1 ? 'demanda' : 'demandas'}</span>
            </p>
          </header>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 print:grid-cols-1">
            <Tabela
              titulo="Por status (situação atual)"
              colunaNome="Status"
              linhas={dados.porStatus.map((s) => ({ nome: STATUS_LABEL[s.status] ?? s.status, quantidade: s.quantidade }))}
            />
            <Tabela
              titulo="Por tipo de demanda"
              colunaNome="Tipo"
              linhas={dados.porTipo.map((t) => ({ nome: t.tipo, quantidade: t.quantidade }))}
            />
            <Tabela titulo="Por bairro" colunaNome="Bairro" linhas={bairrosExibidos} />
            <Tabela
              titulo="Por assessor responsável"
              colunaNome="Assessor"
              linhas={dados.porAssessor.map((a) => ({ nome: a.assessorNome, quantidade: a.quantidade }))}
            />
          </div>

          {geradoEm && user && (
            <footer className="text-xs text-gray-500">
              Gerado em {geradoEm.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} por {user.nome}.
            </footer>
          )}
        </article>
      )}
    </div>
  );
}
