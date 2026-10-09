import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { apagarLista, guardarLista, lerLista } from './lista-demandas-offline';
import type { DemandaResumo } from '@/types/request';

function item(id: string): DemandaResumo {
  return {
    id,
    codigoInterno: `GD-${id}`,
    tituloResumido: 'Buraco na rua',
    solicitanteNome: 'Maria',
    bairro: 'Centro',
    status: 'ENVIADA',
    assessorResponsavelId: 'a1',
    assessorResponsavelNome: 'Assessor',
    requestTypeId: 't1',
    requestTypeNome: 'Tapa-buraco',
    numeroProtocolo: null,
    createdAt: '2026-10-01T10:00:00.000Z',
  } as DemandaResumo;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('lista-demandas-offline', () => {
  it('guarda e devolve a lista do mesmo usuário, com a hora em que foi salva', () => {
    const antes = Date.now();
    guardarLista('u1', { items: [item('1'), item('2')], total: 37 });

    const lida = lerLista('u1');

    expect(lida?.items.map((i) => i.id)).toEqual(['1', '2']);
    expect(lida?.total).toBe(37);
    expect(lida!.salvaEm).toBeGreaterThanOrEqual(antes);
  });

  it('outro usuário no mesmo aparelho não enxerga a cópia', () => {
    guardarLista('u1', { items: [item('1')], total: 1 });

    expect(lerLista('u2')).toBeNull();
  });

  it('sem cópia devolve null', () => {
    expect(lerLista('u1')).toBeNull();
  });

  it('JSON corrompido ou sem a lista devolve null em vez de quebrar', () => {
    localStorage.setItem('gd:lista-demandas', '{nao é json');
    expect(lerLista('u1')).toBeNull();

    localStorage.setItem('gd:lista-demandas', JSON.stringify({ usuarioId: 'u1', salvaEm: 1 }));
    expect(lerLista('u1')).toBeNull();
  });

  it('cópia com mais de 7 dias não é usada e é apagada', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T10:00:00'));
    guardarLista('u1', { items: [item('1')], total: 1 });

    vi.setSystemTime(new Date('2026-10-07T10:00:00'));
    expect(lerLista('u1')).not.toBeNull();

    vi.setSystemTime(new Date('2026-10-09T10:00:00'));
    expect(lerLista('u1')).toBeNull();
    expect(localStorage.getItem('gd:lista-demandas')).toBeNull();
  });

  it('cópia com data ou total malformados é ignorada (nada de "Invalid Date" na tela)', () => {
    localStorage.setItem('gd:lista-demandas', JSON.stringify({ usuarioId: 'u1', salvaEm: 'ontem', items: [], total: 0 }));
    expect(lerLista('u1')).toBeNull();

    localStorage.setItem('gd:lista-demandas', JSON.stringify({ usuarioId: 'u1', salvaEm: Date.now(), items: [], total: 'x' }));
    expect(lerLista('u1')).toBeNull();
  });

  it('apagarLista remove a cópia', () => {
    guardarLista('u1', { items: [item('1')], total: 1 });

    apagarLista();

    expect(lerLista('u1')).toBeNull();
    expect(localStorage.getItem('gd:lista-demandas')).toBeNull();
  });

  it('só guarda os campos da lista: telefone, endereço e descrição nunca entram, mesmo que venham na resposta', () => {
    const comExtras = {
      ...item('1'),
      solicitanteTelefone: '+5534999990000',
      descricao: 'texto sigiloso',
      cep: '38400000',
      rua: 'Rua Secreta',
    } as unknown as DemandaResumo;

    guardarLista('u1', { items: [comExtras], total: 1 });

    const bruto = localStorage.getItem('gd:lista-demandas')!;
    expect(bruto).not.toMatch(/5534999990000|sigiloso|38400000|Rua Secreta/);
    expect(Object.keys(lerLista('u1')!.items[0]!).sort()).toEqual(
      [
        'assessorResponsavelId',
        'assessorResponsavelNome',
        'bairro',
        'codigoInterno',
        'createdAt',
        'id',
        'numeroProtocolo',
        'requestTypeId',
        'requestTypeNome',
        'solicitanteNome',
        'status',
        'tituloResumido',
      ].sort(),
    );
  });
});
