import { describe, it, expect } from 'vitest';
import { diasDoPeriodo, intervaloBrasilia, lerDiaCalendario, MAXIMO_DIAS_RELATORIO } from '../../src/utils/periodo.js';

describe('lerDiaCalendario', () => {
  it('aceita datas reais e recusa formato errado e datas que não existem', () => {
    expect(lerDiaCalendario('2026-10-14')).not.toBeNull();
    expect(lerDiaCalendario('2028-02-29')).not.toBeNull();
    expect(lerDiaCalendario('2026-02-29')).toBeNull();
    expect(lerDiaCalendario('2026-02-31')).toBeNull();
    expect(lerDiaCalendario('2026-13-01')).toBeNull();
    expect(lerDiaCalendario('14/10/2026')).toBeNull();
    expect(lerDiaCalendario('2026-1-5')).toBeNull();
    expect(lerDiaCalendario('')).toBeNull();
  });
});

describe('diasDoPeriodo', () => {
  it('conta os dois extremos', () => {
    expect(diasDoPeriodo('2026-10-14', '2026-10-14')).toBe(1);
    expect(diasDoPeriodo('2026-10-01', '2026-10-31')).toBe(31);
    expect(diasDoPeriodo('2026-12-30', '2027-01-02')).toBe(4);
  });

  it('um ano comum tem 365 dias e um bissexto 366 (o máximo permitido)', () => {
    expect(diasDoPeriodo('2026-01-01', '2026-12-31')).toBe(365);
    expect(diasDoPeriodo('2028-01-01', '2028-12-31')).toBe(MAXIMO_DIAS_RELATORIO);
  });

  it('data final antes da inicial dá número negativo ou zero; data inválida dá null', () => {
    expect(diasDoPeriodo('2026-10-14', '2026-10-13')).toBe(0);
    expect(diasDoPeriodo('2026-10-14', '2026-10-10')).toBeLessThan(0);
    expect(diasDoPeriodo('2026-02-30', '2026-03-01')).toBeNull();
  });
});

describe('intervaloBrasilia', () => {
  it('um dia vai da meia-noite de Brasília (03:00 UTC) até a meia-noite seguinte, exclusiva', () => {
    const { inicio, fimExclusivo } = intervaloBrasilia('2026-10-14', '2026-10-14');

    expect(inicio.toISOString()).toBe('2026-10-14T03:00:00.000Z');
    expect(fimExclusivo.toISOString()).toBe('2026-10-15T03:00:00.000Z');
  });

  it('uma demanda criada às 23:59 de Brasília do último dia entra; às 00:00 do dia seguinte não', () => {
    const { inicio, fimExclusivo } = intervaloBrasilia('2026-10-01', '2026-10-31');
    const ultimoMinuto = new Date('2026-10-31T23:59:00-03:00').getTime();
    const primeiroSegundoDoProximo = new Date('2026-11-01T00:00:00-03:00').getTime();
    const ultimoSegundoAntes = new Date('2026-09-30T23:59:59-03:00').getTime();

    expect(ultimoMinuto >= inicio.getTime() && ultimoMinuto < fimExclusivo.getTime()).toBe(true);
    expect(primeiroSegundoDoProximo < fimExclusivo.getTime()).toBe(false);
    expect(ultimoSegundoAntes >= inicio.getTime()).toBe(false);
  });

  it('atravessa virada de mês e de ano', () => {
    const { inicio, fimExclusivo } = intervaloBrasilia('2026-12-31', '2027-01-01');

    expect(inicio.toISOString()).toBe('2026-12-31T03:00:00.000Z');
    expect(fimExclusivo.toISOString()).toBe('2027-01-02T03:00:00.000Z');
  });

  it('lança erro para datas inválidas', () => {
    expect(() => intervaloBrasilia('2026-02-31', '2026-03-01')).toThrow();
  });
});
