import { describe, it, expect } from 'vitest';
import { normalizePhone, isValidBrazilianPhone } from '../../src/utils/phone.js';

describe('normalizePhone', () => {
  it('normaliza número com máscara para E.164', () => {
    expect(normalizePhone('(34) 99999-8888')).toBe('+5534999998888');
  });

  it('normaliza número já com DDI', () => {
    expect(normalizePhone('+55 34 99999-8888')).toBe('+5534999998888');
  });

  it('normaliza número fixo (10 dígitos)', () => {
    expect(normalizePhone('(34) 3232-1122')).toBe('+553432321122');
  });
});

describe('isValidBrazilianPhone', () => {
  it('aceita celular válido com 11 dígitos', () => {
    expect(isValidBrazilianPhone('(34) 99999-8888')).toBe(true);
  });

  it('rejeita número com dígitos insuficientes', () => {
    expect(isValidBrazilianPhone('1234')).toBe(false);
  });

  it('rejeita número com letras', () => {
    expect(isValidBrazilianPhone('abc-defg')).toBe(false);
  });
});
