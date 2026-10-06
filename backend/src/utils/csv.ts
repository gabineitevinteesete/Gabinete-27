const SEPARADOR = ';';
// Excel/Sheets interpretam uma célula que começa com um destes caracteres como fórmula.
const PREFIXOS_DE_FORMULA = ['=', '+', '-', '@', '\t', '\r'];

export function escaparCelulaCsv(valor: string): string {
  const seguro = valor.length > 0 && PREFIXOS_DE_FORMULA.includes(valor[0]!) ? `'${valor}` : valor;
  return /[;"\r\n]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

// BOM no início: sem ele o Excel abre o arquivo UTF-8 com os acentos quebrados.
export function gerarCsv(cabecalho: string[], linhas: string[][]): string {
  const todas = [cabecalho, ...linhas].map((linha) => linha.map(escaparCelulaCsv).join(SEPARADOR));
  return `﻿${todas.join('\r\n')}\r\n`;
}
