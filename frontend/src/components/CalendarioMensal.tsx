'use client';

import { gerarGradeCalendario, hojeISO, mesAnterior, mesSeguinte } from '@/lib/calendario';
import type { AtribuicaoEscala } from '@/types/escala';

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface CalendarioMensalProps {
  mes: string;
  escalaPorDia: Record<string, AtribuicaoEscala[]>;
  onSelecionarDia: (data: string) => void;
  onMudarMes: (novoMes: string) => void;
}

export function CalendarioMensal({ mes, escalaPorDia, onSelecionarDia, onMudarMes }: CalendarioMensalProps) {
  const celulas = gerarGradeCalendario(mes);
  const hoje = hojeISO();

  return (
    <div className="rounded-card bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onMudarMes(mesAnterior(mes))}
          aria-label="Mês anterior"
          className="rounded-lg px-2 py-1 text-sm hover:bg-gray-100"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-primary-dark">{mes}</span>
        <button
          type="button"
          onClick={() => onMudarMes(mesSeguinte(mes))}
          aria-label="Próximo mês"
          className="rounded-lg px-2 py-1 text-sm hover:bg-gray-100"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500">
        {DIAS_SEMANA.map((dia) => (
          <div key={dia}>{dia}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {celulas.map((celula, indice) => {
          if (!celula.data) {
            return <div key={`vazio-${indice}`} />;
          }
          const atribuicoes = escalaPorDia[celula.data] ?? [];
          const gabinete = atribuicoes.filter((a) => a.local === 'GABINETE').length;
          const rua = atribuicoes.filter((a) => a.local === 'RUA').length;
          const ehHoje = celula.data === hoje;

          return (
            <button
              type="button"
              key={celula.data}
              onClick={() => onSelecionarDia(celula.data!)}
              className={`flex min-h-16 flex-col items-start rounded-lg border p-1 text-left text-xs hover:bg-gray-50 ${
                ehHoje ? 'border-primary bg-primary/5' : 'border-gray-200'
              }`}
            >
              <span className="font-medium text-gray-900">{celula.diaDoMes}</span>
              {(gabinete > 0 || rua > 0) && (
                <span className="text-gray-600">
                  {gabinete} gabinete · {rua} rua
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
