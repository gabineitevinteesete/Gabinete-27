'use client';

import { useFilaOffline } from '@/hooks/use-fila-offline';

export default function DemandasPendentesPage() {
  const { pendentes, sincronizando, sincronizarAgora, descartar, tentarDeNovo } = useFilaOffline();

  function handleDescartar(id: string, titulo: string) {
    if (window.confirm(`Descartar a demanda "${titulo}"? Ela não foi enviada e os dados serão apagados deste aparelho.`)) {
      void descartar(id);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-primary-dark">Demandas pendentes de envio</h1>
        {pendentes.length > 0 && (
          <button
            type="button"
            onClick={() => void sincronizarAgora()}
            disabled={sincronizando}
            className="rounded-xl bg-secondary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {sincronizando ? 'Enviando…' : 'Enviar agora'}
          </button>
        )}
      </div>

      {pendentes.length === 0 && <p className="text-sm text-gray-500">Nenhuma demanda pendente.</p>}

      <div className="flex flex-col gap-2">
        {pendentes.map((item) => {
          const titulo = item.campos.tituloResumido ?? 'Sem título';
          return (
            <div key={item.id} className="rounded-card bg-white p-4 shadow-sm">
              <p className="font-medium text-gray-900">{titulo}</p>
              <p className="text-sm text-gray-600">
                {item.campos.solicitanteNome} — {new Date(item.criadoEm).toLocaleString('pt-BR')}
              </p>
              {item.ultimoErro === null ? (
                <p className="mt-1 text-xs text-gray-500">Aguardando sinal</p>
              ) : (
                <>
                  <p className="mt-1 text-xs text-red-600">Recusada: {item.ultimoErro}</p>
                  <div className="mt-2 flex gap-3">
                    <button
                      type="button"
                      onClick={() => void tentarDeNovo(item.id)}
                      className="text-sm font-medium text-primary-dark hover:underline"
                    >
                      Tentar de novo
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDescartar(item.id, titulo)}
                      className="text-sm font-medium text-red-600 hover:underline"
                    >
                      Descartar
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
