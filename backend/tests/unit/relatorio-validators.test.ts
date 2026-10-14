import { describe, it, expect } from 'vitest';
import { relatorioQuerySchema } from '../../src/validators/dashboard.validators.js';

function mensagem(entrada: unknown): string | null {
  const resultado = relatorioQuerySchema.safeParse(entrada);
  return resultado.success ? null : resultado.error.issues[0]!.message;
}

describe('relatorioQuerySchema', () => {
  it('aceita um período válido, inclusive de um único dia e de 366 dias', () => {
    expect(mensagem({ de: '2026-10-01', ate: '2026-10-31' })).toBeNull();
    expect(mensagem({ de: '2026-10-14', ate: '2026-10-14' })).toBeNull();
    expect(mensagem({ de: '2028-01-01', ate: '2028-12-31' })).toBeNull();
  });

  it('exige as duas datas', () => {
    expect(mensagem({ ate: '2026-10-31' })).toMatch(/data inicial/);
    expect(mensagem({ de: '2026-10-01' })).toMatch(/data final/);
    expect(mensagem({})).not.toBeNull();
  });

  it('recusa formato errado e datas que não existem', () => {
    expect(mensagem({ de: '01/10/2026', ate: '2026-10-31' })).toBe('Datas inválidas. Use o formato AAAA-MM-DD.');
    expect(mensagem({ de: '2026-02-31', ate: '2026-03-01' })).toBe('Datas inválidas. Use o formato AAAA-MM-DD.');
    expect(mensagem({ de: '2026-10-01', ate: 'amanhã' })).toBe('Datas inválidas. Use o formato AAAA-MM-DD.');
  });

  it('recusa data final antes da inicial', () => {
    expect(mensagem({ de: '2026-10-14', ate: '2026-10-13' })).toBe('A data final não pode ser anterior à inicial.');
  });

  it('recusa período de mais de 366 dias', () => {
    expect(mensagem({ de: '2026-01-01', ate: '2027-01-02' })).toBe('O período pode ter no máximo 366 dias.');
    // 01/01/2026 a 01/01/2027 são exatamente 366 dias contando os dois extremos: ainda vale.
    expect(mensagem({ de: '2026-01-01', ate: '2027-01-01' })).toBeNull();
  });
});
