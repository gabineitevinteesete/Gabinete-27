import { describe, it, expect } from 'vitest';
import { maskPhone } from './phone-mask';

describe('maskPhone', () => {
  it('aplica máscara para celular (11 dígitos)', () => {
    expect(maskPhone('34999998888')).toBe('(34) 99999-8888');
  });

  it('aplica máscara parcial enquanto o usuário digita', () => {
    expect(maskPhone('349999')).toBe('(34) 9999');
  });

  it('ignora caracteres não numéricos na entrada', () => {
    expect(maskPhone('(34) 99999-8888')).toBe('(34) 99999-8888');
  });

  it('trunca em 11 dígitos', () => {
    expect(maskPhone('349999988889999')).toBe('(34) 99999-8888');
  });

  it('remove o prefixo 55 quando o valor já vem no formato internacional', () => {
    expect(maskPhone('+5534999991234')).toBe('(34) 99999-1234');
  });
});
