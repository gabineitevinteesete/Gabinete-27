import { apiClient, ApiError } from '@/services/api-client';
import { listarPendentes, marcarErro, removerPendente, type DemandaPendente } from '@/lib/fila-offline';

export interface ResultadoSincronizacao {
  enviadas: number;
  recusadas: number;
}

// Evita duas rodadas ao mesmo tempo (evento `online` + intervalo), que enviariam a mesma
// demanda duas vezes.
let emAndamento = false;

export function montarFormData(pendente: Pick<DemandaPendente, 'campos' | 'fotos'>): FormData {
  const formData = new FormData();
  Object.entries(pendente.campos).forEach(([chave, valor]) => formData.append(chave, valor));
  pendente.fotos.forEach((foto, indice) => formData.append('fotos', foto, `foto-${indice}.jpg`));
  return formData;
}

/**
 * Envia as demandas pendentes do usuário que ainda não foram recusadas pelo servidor.
 * - sucesso: remove do aparelho;
 * - ApiError de recusa (o servidor respondeu 4xx): marca o erro e segue para a próxima;
 * - sessão expirada (401), servidor instável (5xx), limite de requisições (429) e qualquer erro
 *   sem resposta (sem rede etc.): interrompe a rodada e mantém tudo como está, para tentar de novo
 *   depois — nada disso é culpa da demanda.
 */
function ehProblemaTemporario(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  return err.status === 401 || err.status === 408 || err.status === 429 || err.status >= 500;
}

export async function sincronizarFila(usuarioId: string): Promise<ResultadoSincronizacao> {
  const resultado: ResultadoSincronizacao = { enviadas: 0, recusadas: 0 };
  if (emAndamento) return resultado;

  emAndamento = true;
  try {
    const pendentes = (await listarPendentes(usuarioId)).filter((item) => item.ultimoErro === null);
    for (const pendente of pendentes) {
      try {
        await apiClient.request('/demandas', { method: 'POST', body: montarFormData(pendente), auth: true });
        await removerPendente(pendente.id);
        resultado.enviadas += 1;
      } catch (err) {
        if (ehProblemaTemporario(err)) break;
        await marcarErro(pendente.id, (err as ApiError).message);
        resultado.recusadas += 1;
      }
    }
  } finally {
    emAndamento = false;
  }
  return resultado;
}
