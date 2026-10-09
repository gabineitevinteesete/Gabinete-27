import { describe, it, expect, vi, afterEach } from 'vitest';
import { ehUuid, gerarUuid } from './uuid';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uuid', () => {
  it('gera UUIDs v4 válidos e diferentes entre si', () => {
    const a = gerarUuid();
    const b = gerarUuid();

    expect(ehUuid(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it('sem crypto.randomUUID ainda gera um UUID v4 válido', () => {
    vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => bytes.fill(171) });

    const id = gerarUuid();

    expect(ehUuid(id)).toBe(true);
    expect(id[14]).toBe('4');
    expect('89ab').toContain(id[19]!);
  });

  it('sem nenhum crypto, usa Math.random e ainda gera um UUID válido', () => {
    vi.stubGlobal('crypto', undefined);

    expect(ehUuid(gerarUuid())).toBe(true);
  });

  it('ehUuid recusa o que não é UUID', () => {
    expect(ehUuid('1728000000000-abc123')).toBe(false);
    expect(ehUuid('')).toBe(false);
  });
});
