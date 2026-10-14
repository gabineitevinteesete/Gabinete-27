/** "agora", "há 5 min", "há 3 h", "há 2 dias" ou a data, para datas mais antigas (uma semana ou mais). */
export function tempoRelativo(iso: string, agora: number = Date.now()): string {
  const data = new Date(iso).getTime();
  if (Number.isNaN(data)) return '';
  const segundos = Math.max(0, Math.floor((agora - data) / 1000));
  if (segundos < 60) return 'agora';
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias < 7) return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  return new Date(data).toLocaleDateString('pt-BR');
}
