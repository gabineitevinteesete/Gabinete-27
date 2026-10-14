import { describe, it, expect } from 'vitest';
import { tempoRelativo } from './tempo-relativo';

const AGORA = new Date('2026-10-14T12:00:00Z').getTime();
const atras = (ms: number) => new Date(AGORA - ms).toISOString();
const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

describe('tempoRelativo', () => {
  it.each([
    [10_000, 'agora'],
    [59_000, 'agora'],
    [60_000, 'há 1 min'],
    [5 * MIN, 'há 5 min'],
    [59 * MIN, 'há 59 min'],
    [HORA, 'há 1 h'],
    [23 * HORA, 'há 23 h'],
    [DIA, 'há 1 dia'],
    [3 * DIA, 'há 3 dias'],
  ])('%d ms atrás vira "%s"', (ms, esperado) => {
    expect(tempoRelativo(atras(ms), AGORA)).toBe(esperado);
  });

  it('uma semana ou mais atrás mostra a data', () => {
    expect(tempoRelativo(atras(10 * DIA), AGORA)).toBe('04/10/2026');
  });

  it('data no futuro (relógio desajustado) vira "agora" e data inválida vira vazio', () => {
    expect(tempoRelativo(new Date(AGORA + HORA).toISOString(), AGORA)).toBe('agora');
    expect(tempoRelativo('não é data', AGORA)).toBe('');
  });
});
