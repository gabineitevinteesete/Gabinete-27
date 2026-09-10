'use client';

import { useState } from 'react';
import { apiClient, ApiError } from '@/services/api-client';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import type { TipoDemandaAdmin } from '@/types/request';

interface ModalTipoDemandaProps {
  modo: 'criar' | 'editar';
  tipo?: TipoDemandaAdmin;
  onFechar: () => void;
  onSalvo: (tipo: TipoDemandaAdmin) => void;
}

export function ModalTipoDemanda({ modo, tipo, onFechar, onSalvo }: ModalTipoDemandaProps) {
  const [nome, setNome] = useState(tipo?.nome ?? '');
  const [exigeDescricaoObrigatoria, setExigeDescricaoObrigatoria] = useState(tipo?.exigeDescricaoObrigatoria ?? false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setEnviando(true);
    setErro(null);
    try {
      const resultado =
        modo === 'criar'
          ? await apiClient.request<TipoDemandaAdmin>('/tipos-demanda', {
              method: 'POST',
              auth: true,
              body: { nome, exigeDescricaoObrigatoria },
            })
          : await apiClient.request<TipoDemandaAdmin>(`/tipos-demanda/${tipo!.id}`, {
              method: 'PATCH',
              auth: true,
              body: { nome, exigeDescricaoObrigatoria },
            });
      onSalvo(resultado);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível salvar. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  const formValido = nome.trim().length >= 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-card bg-white p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-primary-dark">
            {modo === 'criar' ? 'Novo tipo de demanda' : 'Editar tipo de demanda'}
          </h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="text-gray-500 hover:text-gray-700">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <TextField label="Nome" name="nome" value={nome} onChange={(e) => setNome(e.target.value)} />

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={exigeDescricaoObrigatoria}
              onChange={(e) => setExigeDescricaoObrigatoria(e.target.checked)}
            />
            Exige descrição obrigatória
          </label>

          <Button type="button" onClick={salvar} disabled={!formValido || enviando}>
            {enviando ? 'Salvando…' : 'Salvar'}
          </Button>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>
      </div>
    </div>
  );
}
