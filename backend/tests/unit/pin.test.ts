import { describe, it, expect } from 'vitest';
import { isPinObvious, isPinFormatValid, hashPin, verifyPin } from '../../src/utils/pin.js';

describe('isPinFormatValid', () => {
  it('aceita 6 dígitos numéricos', () => {
    expect(isPinFormatValid('482913')).toBe(true);
  });

  it('rejeita menos de 6 dígitos', () => {
    expect(isPinFormatValid('4829')).toBe(false);
  });

  it('rejeita caracteres não numéricos', () => {
    expect(isPinFormatValid('48291a')).toBe(false);
  });
});

describe('isPinObvious', () => {
  it('rejeita todos os dígitos repetidos', () => {
    expect(isPinObvious('111111')).toBe(true);
    expect(isPinObvious('000000')).toBe(true);
  });

  it('rejeita sequência crescente', () => {
    expect(isPinObvious('123456')).toBe(true);
  });

  it('rejeita sequência decrescente', () => {
    expect(isPinObvious('987654')).toBe(true);
  });

  it('aceita PIN não óbvio', () => {
    expect(isPinObvious('482913')).toBe(false);
  });
});

describe('hashPin / verifyPin', () => {
  it('gera hash diferente do PIN original e verifica corretamente', async () => {
    const hash = await hashPin('482913');
    expect(hash).not.toBe('482913');
    expect(await verifyPin('482913', hash)).toBe(true);
    expect(await verifyPin('999999', hash)).toBe(false);
  });
});
