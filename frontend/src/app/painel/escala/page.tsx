'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { apiClient } from '@/services/api-client';
import { mesAtual } from '@/lib/calendario';
import { CalendarioMensal } from '@/components/CalendarioMensal';
import { PainelDiaEscala } from '@/components/PainelDiaEscala';
import type { AtribuicaoEscala } from '@/types/escala';

export default function EscalaPage() {
  const { user } = useAuth();
  const [mes, setMes] = useState(mesAtual());
  const [escalaPorDia, setEscalaPorDia] = useState<Record<string, AtribuicaoEscala[]>>({});
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    setCarregando(true);
    setErro(false);
    apiClient
      .request<{ dias: Record<string, AtribuicaoEscala[]> }>(`/escala?mes=${mes}`, { auth: true })
      .then((res) => setEscalaPorDia(res.dias))
      .catch(() => setErro(true))
      .finally(() => setCarregando(false));
  }, [mes]);

  function handleSalvo(data: string, novasAtribuicoes: AtribuicaoEscala[]) {
    setEscalaPorDia((prev) => ({ ...prev, [data]: novasAtribuicoes }));
    setDiaSelecionado(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-primary-dark">Escala do gabinete</h1>

      {carregando && <p className="text-sm text-gray-500">Carregando…</p>}
      {erro && <p className="text-sm text-red-600">Não foi possível carregar a escala.</p>}

      {!carregando && !erro && (
        <CalendarioMensal mes={mes} escalaPorDia={escalaPorDia} onSelecionarDia={setDiaSelecionado} onMudarMes={setMes} />
      )}

      {diaSelecionado && (
        <PainelDiaEscala
          data={diaSelecionado}
          atribuicoes={escalaPorDia[diaSelecionado] ?? []}
          podeEditar={user?.role === 'CHEFE'}
          onFechar={() => setDiaSelecionado(null)}
          onSalvo={handleSalvo}
        />
      )}
    </div>
  );
}
