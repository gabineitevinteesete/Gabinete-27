import { describe, it, expect } from 'vitest';
import { gerarGradeCalendario, mesAnterior, mesSeguinte } from './calendario';

describe('gerarGradeCalendario', () => {
  it('gera os 30 dias de setembro de 2026, na ordem certa', () => {
    const grade = gerarGradeCalendario('2026-09');
    const diasReais = grade.filter((c) => c.data !== null);

    expect(diasReais).toHaveLength(30);
    expect(diasReais[0]?.data).toBe('2026-09-01');
    expect(diasReais[0]?.diaDoMes).toBe(1);
    expect(diasReais[29]?.data).toBe('2026-09-30');
    expect(diasReais[29]?.diaDoMes).toBe(30);
  });

  it('preenche células vazias antes do dia 1 conforme o dia da semana (2026-09-01 é terça-feira)', () => {
    const grade = gerarGradeCalendario('2026-09');
    const preenchimento = grade.filter((c) => c.data === null);

    expect(preenchimento).toHaveLength(2);
    expect(grade[2]?.data).toBe('2026-09-01');
  });
});

describe('mesAnterior / mesSeguinte', () => {
  it('navega entre meses dentro do mesmo ano', () => {
    expect(mesAnterior('2026-09')).toBe('2026-08');
    expect(mesSeguinte('2026-09')).toBe('2026-10');
  });

  it('navega corretamente na virada do ano', () => {
    expect(mesAnterior('2026-01')).toBe('2025-12');
    expect(mesSeguinte('2026-12')).toBe('2027-01');
  });
});
