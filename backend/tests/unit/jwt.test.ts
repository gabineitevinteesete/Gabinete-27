import { describe, it, expect } from 'vitest';
import {
  signAccessToken,
  verifyAccessToken,
  generateRefreshTokenValue,
  hashRefreshTokenValue,
} from '../../src/utils/jwt.js';

describe('access token', () => {
  it('assina e verifica um payload válido', () => {
    const token = signAccessToken({ sub: 'user-1', role: 'ASSESSOR_RUA' });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.role).toBe('ASSESSOR_RUA');
  });

  it('lança erro para token inválido', () => {
    expect(() => verifyAccessToken('token-invalido')).toThrow();
  });
});

describe('refresh token opaco', () => {
  it('gera valores diferentes a cada chamada', () => {
    const a = generateRefreshTokenValue();
    const b = generateRefreshTokenValue();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  it('produz hash determinístico e estável', () => {
    const value = generateRefreshTokenValue();
    expect(hashRefreshTokenValue(value)).toBe(hashRefreshTokenValue(value));
  });
});
