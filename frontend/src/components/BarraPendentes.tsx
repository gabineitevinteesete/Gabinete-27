'use client';

import Link from 'next/link';
import { useFilaOffline } from '@/hooks/use-fila-offline';

/** Aviso fixo no painel enquanto houver demandas guardadas no aparelho esperando envio. */
export function BarraPendentes() {
  const { pendentes, sincronizando } = useFilaOffline();

  if (pendentes.length === 0) return null;

  const total = pendentes.length;
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-secondary-light px-4 py-3 text-sm text-secondary-dark">
      <span>
        {total} {total === 1 ? 'demanda aguardando envio' : 'demandas aguardando envio'}
        {sincronizando ? ' — enviando…' : ''}
      </span>
      <Link href="/painel/demandas/pendentes" className="font-medium underline">
        Ver
      </Link>
    </div>
  );
}
