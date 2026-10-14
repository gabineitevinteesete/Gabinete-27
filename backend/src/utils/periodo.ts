const FORMATO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const DIA_MS = 24 * 60 * 60 * 1000;

// Brasília é UTC-3 o ano todo (o horário de verão acabou em 2019).
const DESLOCAMENTO_BRASILIA_HORAS = 3;

export const MAXIMO_DIAS_RELATORIO = 366;

/** Interpreta "AAAA-MM-DD" como dia do calendário; `null` se o formato ou a data (ex.: 31/02) forem inválidos. */
export function lerDiaCalendario(valor: string): number | null {
  const partes = FORMATO_DATA.exec(valor);
  if (!partes) return null;
  const [ano, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  const confere = data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
  return confere ? data.getTime() : null;
}

/** Quantidade de dias do período, contando os dois extremos. `null` se alguma data for inválida. */
export function diasDoPeriodo(de: string, ate: string): number | null {
  const inicio = lerDiaCalendario(de);
  const fim = lerDiaCalendario(ate);
  if (inicio === null || fim === null) return null;
  return Math.round((fim - inicio) / DIA_MS) + 1;
}

/**
 * Intervalo [inicio, fimExclusivo) em UTC que cobre do começo do dia `de` ao fim do dia `ate`,
 * no horário de Brasília.
 */
export function intervaloBrasilia(de: string, ate: string): { inicio: Date; fimExclusivo: Date } {
  const diaInicio = lerDiaCalendario(de);
  const diaFim = lerDiaCalendario(ate);
  if (diaInicio === null || diaFim === null) throw new Error('Período inválido');
  const deslocamento = DESLOCAMENTO_BRASILIA_HORAS * 60 * 60 * 1000;
  return {
    inicio: new Date(diaInicio + deslocamento),
    fimExclusivo: new Date(diaFim + DIA_MS + deslocamento),
  };
}
