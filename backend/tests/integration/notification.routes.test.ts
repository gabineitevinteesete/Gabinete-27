import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { hash } from '@node-rs/argon2';
import { buildTestApp } from '../helpers/build-test-app.js';
import { testPrisma, resetDb } from '../helpers/reset-db.js';
import type { UserRoleValue } from '../../src/utils/jwt.js';

const app = buildTestApp();

beforeEach(async () => {
  await resetDb();
}, 30000); // Neon real via rede.

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function login(role: UserRoleValue, telefone: string) {
  const user = await testPrisma.user.create({
    data: { nome: `Pessoa ${telefone.slice(-4)}`, telefone, role, ativo: true, pinDefinido: true, pinHash: await hash('482913') },
  });
  const res = await request(app).post('/auth/login').send({ telefone, pin: '482913' });
  return { user, token: res.body.data.accessToken as string };
}

async function criarDemandaViaApi(token: string) {
  const tipo = await testPrisma.requestType.upsert({
    where: { nome: 'Tapa-buraco' },
    update: {},
    create: { nome: 'Tapa-buraco', ativo: true, exigeDescricaoObrigatoria: false },
  });
  const foto = await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 5, g: 5, b: 5 } } }).jpeg().toBuffer();
  const res = await request(app)
    .post('/demandas')
    .set('Authorization', `Bearer ${token}`)
    .field({
      solicitanteNome: 'Maria Solicitante',
      solicitanteTelefone: '(34) 99999-0000',
      bairro: 'Centro',
      localExato: 'Em frente ao 100',
      tituloResumido: 'Buraco na rua',
      descricao: 'Buraco grande',
      requestTypeId: tipo.id,
      autorizacaoDados: 'true',
    })
    .attach('fotos', foto, 'a.jpg')
    .attach('fotos', foto, 'b.jpg');
  return res.body.data as { id: string; codigoInterno: string };
}

describe('GET /notificacoes', () => {
  it('exige autenticação', async () => {
    const res = await request(app).get('/notificacoes');

    expect(res.status).toBe(401);
  }, 30000);

  it('fluxo real: criar, mudar status e reatribuir geram os avisos certos para cada pessoa', async () => {
    const chefe = await login('CHEFE', '+5534999997001');
    const rua1 = await login('ASSESSOR_RUA', '+5534999997002');
    const rua2 = await login('ASSESSOR_RUA', '+5534999997003');

    // rua1 cria: o chefe é avisado; rua1 não.
    const demanda = await criarDemandaViaApi(rua1.token);
    const doChefe = await request(app).get('/notificacoes').set('Authorization', `Bearer ${chefe.token}`);
    expect(doChefe.status).toBe(200);
    expect(doChefe.body.data.naoLidas).toBe(1);
    expect(doChefe.body.data.items[0]).toMatchObject({
      requestId: demanda.id,
      tipo: 'DEMANDA_NOVA',
      mensagem: `Nova demanda ${demanda.codigoInterno} registrada.`,
      lida: false,
    });
    const deRua1 = await request(app).get('/notificacoes').set('Authorization', `Bearer ${rua1.token}`);
    expect(deRua1.body.data.items).toHaveLength(0);

    // o chefe muda o status: rua1 (responsável) é avisado.
    const statusRes = await request(app)
      .patch(`/demandas/${demanda.id}/status`)
      .set('Authorization', `Bearer ${chefe.token}`)
      .send({ novoStatus: 'RECEBIDA' });
    expect(statusRes.status).toBe(200);
    const apos = await request(app).get('/notificacoes').set('Authorization', `Bearer ${rua1.token}`);
    expect(apos.body.data.items.map((i: { mensagem: string }) => i.mensagem)).toEqual([
      `A demanda ${demanda.codigoInterno} passou para "Recebida".`,
    ]);

    // o chefe reatribui para rua2: rua2 é avisado.
    const reatribuirRes = await request(app)
      .patch(`/demandas/${demanda.id}/reatribuir`)
      .set('Authorization', `Bearer ${chefe.token}`)
      .send({ novoAssessorId: rua2.user.id });
    expect(reatribuirRes.status).toBe(200);
    const deRua2 = await request(app).get('/notificacoes').set('Authorization', `Bearer ${rua2.token}`);
    expect(deRua2.body.data.items[0]).toMatchObject({
      tipo: 'DEMANDA_REATRIBUIDA',
      mensagem: `Você recebeu a demanda ${demanda.codigoInterno}.`,
    });
  }, 120000);
});

describe('PATCH /notificacoes', () => {
  async function prepararAvisos() {
    const chefe = await login('CHEFE', '+5534999997011');
    const rua = await login('ASSESSOR_RUA', '+5534999997012');
    await criarDemandaViaApi(rua.token);
    await criarDemandaViaApi(rua.token);
    const lista = await request(app).get('/notificacoes').set('Authorization', `Bearer ${chefe.token}`);
    return { chefe, rua, itens: lista.body.data.items as { id: string }[] };
  }

  it('marca um aviso como lido e o contador cai', async () => {
    const { chefe, itens } = await prepararAvisos();
    expect(itens).toHaveLength(2);

    const res = await request(app).patch(`/notificacoes/${itens[0]!.id}/lida`).set('Authorization', `Bearer ${chefe.token}`);

    expect(res.status).toBe(200);
    const depois = await request(app).get('/notificacoes').set('Authorization', `Bearer ${chefe.token}`);
    expect(depois.body.data.naoLidas).toBe(1);
  }, 120000);

  it('ninguém marca o aviso de outra pessoa (404) e o aviso continua não lido', async () => {
    const { chefe, rua, itens } = await prepararAvisos();

    const res = await request(app).patch(`/notificacoes/${itens[0]!.id}/lida`).set('Authorization', `Bearer ${rua.token}`);

    expect(res.status).toBe(404);
    const doChefe = await request(app).get('/notificacoes').set('Authorization', `Bearer ${chefe.token}`);
    expect(doChefe.body.data.naoLidas).toBe(2);
  }, 120000);

  it('as rotas de marcar como lido exigem autenticação', async () => {
    const todas = await request(app).patch('/notificacoes/lidas');
    const uma = await request(app).patch('/notificacoes/11111111-1111-1111-1111-111111111111/lida');

    expect(todas.status).toBe(401);
    expect(uma.status).toBe(401);
  }, 30000);

  it('um id que não existe responde 404', async () => {
    const { chefe } = await prepararAvisos();

    const res = await request(app)
      .patch('/notificacoes/11111111-1111-1111-1111-111111111111/lida')
      .set('Authorization', `Bearer ${chefe.token}`);

    expect(res.status).toBe(404);
  }, 120000);

  it('id que não é UUID responde 400', async () => {
    const { chefe } = await prepararAvisos();

    const res = await request(app).patch('/notificacoes/abc/lida').set('Authorization', `Bearer ${chefe.token}`);

    expect(res.status).toBe(400);
  }, 120000);

  it('marcar todas como lidas zera o contador só de quem pediu', async () => {
    const { chefe, rua } = await prepararAvisos();
    await testPrisma.notification.create({ data: { userId: rua.user.id, tipo: 'STATUS_ALTERADO', mensagem: 'Aviso da rua' } });

    const res = await request(app).patch('/notificacoes/lidas').set('Authorization', `Bearer ${chefe.token}`);

    expect(res.status).toBe(200);
    const doChefe = await request(app).get('/notificacoes').set('Authorization', `Bearer ${chefe.token}`);
    expect(doChefe.body.data.naoLidas).toBe(0);
    const daRua = await request(app).get('/notificacoes').set('Authorization', `Bearer ${rua.token}`);
    expect(daRua.body.data.naoLidas).toBe(1);
  }, 120000);

  it('a lista traz no máximo 30 avisos, mas o contador conta todos os não lidos', async () => {
    const chefe = await login('CHEFE', '+5534999997021');
    await testPrisma.notification.createMany({
      data: Array.from({ length: 35 }, (_, i) => ({ userId: chefe.user.id, tipo: 'DEMANDA_NOVA', mensagem: `Aviso ${i}` })),
    });

    const res = await request(app).get('/notificacoes').set('Authorization', `Bearer ${chefe.token}`);

    expect(res.body.data.items).toHaveLength(30);
    expect(res.body.data.naoLidas).toBe(35);
  }, 60000);
});
