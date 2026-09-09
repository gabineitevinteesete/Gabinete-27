export interface CelulaCalendario {
  data: string | null;
  diaDoMes: number | null;
}

export function mesAtual(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

export function hojeISO(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
}

export function mesAnterior(mes: string): string {
  const [ano, mesNum] = mes.split('-').map(Number) as [number, number];
  const data = new Date(Date.UTC(ano, mesNum - 2, 1));
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function mesSeguinte(mes: string): string {
  const [ano, mesNum] = mes.split('-').map(Number) as [number, number];
  const data = new Date(Date.UTC(ano, mesNum, 1));
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function gerarGradeCalendario(mes: string): CelulaCalendario[] {
  const [anoStr, mesStr] = mes.split('-') as [string, string];
  const ano = Number(anoStr);
  const mesIndice = Number(mesStr) - 1;
  const primeiroDia = new Date(Date.UTC(ano, mesIndice, 1));
  const diasNoMes = new Date(Date.UTC(ano, mesIndice + 1, 0)).getUTCDate();
  const offsetInicial = primeiroDia.getUTCDay();

  const celulas: CelulaCalendario[] = [];
  for (let i = 0; i < offsetInicial; i++) {
    celulas.push({ data: null, diaDoMes: null });
  }
  for (let dia = 1; dia <= diasNoMes; dia++) {
    celulas.push({ data: `${anoStr}-${mesStr}-${String(dia).padStart(2, '0')}`, diaDoMes: dia });
  }
  return celulas;
}
