'use client';

import type { TipoDemanda } from '@/types/request';

interface TipoDemandaChipsProps {
  tipos: TipoDemanda[];
  selecionadoId: string | null;
  onSelecionar: (id: string) => void;
}

export function TipoDemandaChips({ tipos, selecionadoId, onSelecionar }: TipoDemandaChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {tipos.map((tipo) => {
        const selecionado = tipo.id === selecionadoId;
        return (
          <button
            key={tipo.id}
            type="button"
            onClick={() => onSelecionar(tipo.id)}
            className={
              selecionado
                ? 'rounded-full bg-secondary px-4 py-2 text-xs font-medium text-white'
                : 'rounded-full border border-primary px-4 py-2 text-xs font-medium text-primary'
            }
          >
            {tipo.nome}
          </button>
        );
      })}
    </div>
  );
}
