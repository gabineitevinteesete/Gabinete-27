import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { buildTestApp } from '../helpers/build-test-app.js';
import { testPrisma, resetDb } from '../helpers/reset-db.js';

const app = buildTestApp();

beforeEach(async () => {
  await resetDb();
}, 30000); // Neon real via rede.

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function login(role: 'CHEFE' | 'ASSESSOR_RUA' | 'ASSESSOR_GABINETE', telefone: string, nome = 'Pessoa Teste') {
  const user = await testPrisma.user.create({
    data: { nome, telefone, role, ativo: true, pinDefinido: true, pinHash: await hash('482913') },
  });
  const res = await request(app).post('/auth/login').send({ telefone, pin: '482913' });
  return { user, token: res.body.data.accessToken as string };
}

let contador = 0;
async function criarDemanda(dados: {
  tipoId: string;
  responsavelId: string;
  criadaEm: string;
  status?: 'ENVIADA' | 'RECEBIDA' | 'CONCLUIDA';
  bairro?: string | null;
}) {
  contador += 1;
  return testPrisma.request.create({
    data: {
      codigoInterno: `GD-REL-${contador}-${Date.now()}`,
      tituloResumido: 'Título',
      solicitanteNome: 'Fulano',
      solicitanteTelefone: '+5534988880000',
      bairro: dados.bairro === undefined ? 'Centro' : dados.bairro,
      descricao: 'Descrição',
      requestTypeId: dados.tipoId,
      assessorResponsavelId: dados.responsavelId,
      criadoPorId: dados.responsavelId,
      autorizacaoDados: true,
      status: dados.status ?? 'ENVIADA',
      createdAt: new Date(dados.criadaEm),
    },
  });
}

describe('GET /dashboard/relatorio', () => {
  it('exige autenticação e papel de chefe', async () => {
    const semLogin = await request(app).get('/dashboard/relatorio').query({ de: '2026-10-01', ate: '2026-10-31' });
    const gabinete = await login('ASSESSOR_GABINETE', '+5534999996001');
    const rua = await login('ASSESSOR_RUA', '+5534999996002');

    const comoGabinete = await request(app)
      .get('/dashboard/relatorio')
      .query({ de: '2026-10-01', ate: '2026-10-31' })
      .set('Authorization', `Bearer ${gabinete.token}`);
    const comoRua = await request(app)
      .get('/dashboard/relatorio')
      .query({ de: '2026-10-01', ate: '2026-10-31' })
      .set('Authorization', `Bearer ${rua.token}`);

    expect(semLogin.status).toBe(401);
    expect(comoGabinete.status).toBe(403);
    expect(comoRua.status).toBe(403);
  }, 60000);

  it('conta só as demandas criadas no período (fronteiras em horário de Brasília) e agrupa por status, tipo, bairro e assessor', async () => {
    const chefe = await login('CHEFE', '+5534999996011', 'Chefe');
    const ana = await login('ASSESSOR_RUA', '+5534999996012', 'Ana Rua');
    const beto = await login('ASSESSOR_RUA', '+5534999996013', 'Beto Rua');
    const buraco = await testPrisma.requestType.create({ data: { nome: 'Tapa-buraco', ativo: true, exigeDescricaoObrigatoria: false } });
    const poda = await testPrisma.requestType.create({ data: { nome: 'Poda de árvore', ativo: true, exigeDescricaoObrigatoria: false } });

    // Dentro de 01/10 a 31/10 (Brasília):
    await criarDemanda({ tipoId: buraco.id, responsavelId: ana.user.id, criadaEm: '2026-10-01T00:00:00-03:00', bairro: 'Centro' });
    await criarDemanda({ tipoId: buraco.id, responsavelId: ana.user.id, criadaEm: '2026-10-15T12:00:00-03:00', bairro: 'Centro', status: 'CONCLUIDA' });
    await criarDemanda({ tipoId: poda.id, responsavelId: beto.user.id, criadaEm: '2026-10-31T23:59:00-03:00', bairro: null, status: 'RECEBIDA' });
    // Fora (um minuto antes e um minuto depois):
    await criarDemanda({ tipoId: buraco.id, responsavelId: ana.user.id, criadaEm: '2026-09-30T23:59:00-03:00' });
    await criarDemanda({ tipoId: buraco.id, responsavelId: beto.user.id, criadaEm: '2026-11-01T00:00:00-03:00' });

    const res = await request(app)
      .get('/dashboard/relatorio')
      .query({ de: '2026-10-01', ate: '2026-10-31' })
      .set('Authorization', `Bearer ${chefe.token}`);

    expect(res.status).toBe(200);
    const dados = res.body.data;
    expect(dados.de).toBe('2026-10-01');
    expect(dados.ate).toBe('2026-10-31');
    expect(dados.total).toBe(3);

    // todos os status, na ordem do fluxo, inclusive os zerados
    expect(dados.porStatus).toHaveLength(10);
    expect(dados.porStatus.map((s: { status: string }) => s.status).slice(0, 3)).toEqual(['RASCUNHO', 'ENVIADA', 'RECEBIDA']);
    const porStatus = Object.fromEntries(dados.porStatus.map((s: { status: string; quantidade: number }) => [s.status, s.quantidade]));
    expect(porStatus).toMatchObject({ ENVIADA: 1, RECEBIDA: 1, CONCLUIDA: 1, RASCUNHO: 0 });

    expect(dados.porTipo).toEqual([
      { tipo: 'Tapa-buraco', quantidade: 2 },
      { tipo: 'Poda de árvore', quantidade: 1 },
    ]);
    expect(dados.porBairro).toEqual([
      { bairro: 'Centro', quantidade: 2 },
      { bairro: 'Sem bairro', quantidade: 1 },
    ]);
    expect(dados.porAssessor.map((a: { assessorNome: string; quantidade: number }) => [a.assessorNome, a.quantidade])).toEqual([
      ['Ana Rua', 2],
      ['Beto Rua', 1],
    ]);
  }, 120000);

  it('não vaza dados de cidadãos: só números e nomes de tipo, bairro e assessor', async () => {
    const chefe = await login('CHEFE', '+5534999996021', 'Chefe');
    const ana = await login('ASSESSOR_RUA', '+5534999996022', 'Ana Rua');
    const tipo = await testPrisma.requestType.create({ data: { nome: 'Tapa-buraco', ativo: true, exigeDescricaoObrigatoria: false } });
    await criarDemanda({ tipoId: tipo.id, responsavelId: ana.user.id, criadaEm: '2026-10-10T10:00:00-03:00' });

    const res = await request(app)
      .get('/dashboard/relatorio')
      .query({ de: '2026-10-01', ate: '2026-10-31' })
      .set('Authorization', `Bearer ${chefe.token}`);

    expect(JSON.stringify(res.body)).not.toMatch(/Fulano|5534988880000|Descrição/);
  }, 120000);

  it('período sem demandas devolve zeros e listas vazias', async () => {
    const chefe = await login('CHEFE', '+5534999996031');

    const res = await request(app)
      .get('/dashboard/relatorio')
      .query({ de: '2026-10-01', ate: '2026-10-31' })
      .set('Authorization', `Bearer ${chefe.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
    expect(res.body.data.porTipo).toEqual([]);
    expect(res.body.data.porBairro).toEqual([]);
    expect(res.body.data.porAssessor).toEqual([]);
    expect(res.body.data.porStatus.every((s: { quantidade: number }) => s.quantidade === 0)).toBe(true);
  }, 60000);

  it.each([
    [{ de: '2026-10-01' }, 400],
    [{ de: '2026-10-31', ate: '2026-10-01' }, 400],
    [{ de: '2026-02-31', ate: '2026-03-05' }, 400],
    [{ de: '2026-01-01', ate: '2027-01-02' }, 400],
  ])('parâmetros inválidos %j respondem %i', async (query, status) => {
    const chefe = await login('CHEFE', '+5534999996041');

    const res = await request(app).get('/dashboard/relatorio').query(query).set('Authorization', `Bearer ${chefe.token}`);

    expect(res.status).toBe(status);
  }, 60000);
});
