import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { hash } from '@node-rs/argon2';
import { buildTestApp } from '../helpers/build-test-app.js';
import { testPrisma, resetDb } from '../helpers/reset-db.js';

const app = buildTestApp();

beforeEach(async () => {
  await resetDb();
  await testPrisma.internalNote.deleteMany();
  await testPrisma.requestPhoto.deleteMany();
  await testPrisma.request.deleteMany();
  await testPrisma.requestType.deleteMany();
}, 30000); // Neon real via rede.

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function fotoValida(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 5, g: 5, b: 5 } } }).jpeg().toBuffer();
}

async function loginComoAssessor(role: 'ASSESSOR_RUA' | 'ASSESSOR_GABINETE' | 'CHEFE' = 'ASSESSOR_RUA', telefone = '+5534999997000') {
  const assessor = await testPrisma.user.create({
    data: { nome: 'Assessor', telefone, role, ativo: true, pinDefinido: true, pinHash: await hash('482913') },
  });
  const login = await request(app).post('/auth/login').send({ telefone, pin: '482913' });
  return { assessor, accessToken: login.body.data.accessToken as string };
}

async function criarTipo() {
  return testPrisma.requestType.create({ data: { nome: 'Tapa-buraco', ativo: true, exigeDescricaoObrigatoria: false } });
}

async function criarDemandaViaApi(tipoId: string, accessToken: string) {
  const foto1 = await fotoValida();
  const foto2 = await fotoValida();
  const res = await request(app)
    .post('/demandas')
    .set('Authorization', `Bearer ${accessToken}`)
    .field({
      solicitanteNome: 'Maria Solicitante',
      solicitanteTelefone: '(34) 99999-0000',
      localExato: 'Em frente ao 100',
      tituloResumido: 'Buraco na rua',
      descricao: 'Buraco grande',
      requestTypeId: tipoId,
      autorizacaoDados: 'true',
    })
    .attach('fotos', foto1, 'foto1.jpg')
    .attach('fotos', foto2, 'foto2.jpg');
  return res.body.data as { id: string };
}

describe('POST /demandas/:id/observacoes', () => {
  it('gabinete cria uma observação', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999997001');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);
    const { accessToken: tokenGabinete } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999997002');

    const res = await request(app)
      .post(`/demandas/${demanda.id}/observacoes`)
      .set('Authorization', `Bearer ${tokenGabinete}`)
      .send({ texto: 'Liguei pra prefeitura' });

    expect(res.status).toBe(201);
    expect(res.body.data.texto).toBe('Liguei pra prefeitura');
    expect(res.body.data.updatedAt).toBeNull();
  }, 30000); // Neon real via rede.

  it('bloqueia assessor de rua com 403', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999997003');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);

    const res = await request(app)
      .post(`/demandas/${demanda.id}/observacoes`)
      .set('Authorization', `Bearer ${tokenRua}`)
      .send({ texto: 'Tentativa' });

    expect(res.status).toBe(403);
  }, 30000); // Neon real via rede.

  it('rejeita texto vazio com 400', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999997004');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);
    const { accessToken: tokenGabinete } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999997005');

    const res = await request(app)
      .post(`/demandas/${demanda.id}/observacoes`)
      .set('Authorization', `Bearer ${tokenGabinete}`)
      .send({ texto: '' });

    expect(res.status).toBe(400);
  }, 30000); // Neon real via rede.
});

describe('GET /demandas/:id/observacoes', () => {
  it('gabinete lista as observações, mais recente primeiro', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999997006');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);
    const { accessToken: tokenGabinete } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999997007');
    await request(app).post(`/demandas/${demanda.id}/observacoes`).set('Authorization', `Bearer ${tokenGabinete}`).send({ texto: 'Primeira' });
    await request(app).post(`/demandas/${demanda.id}/observacoes`).set('Authorization', `Bearer ${tokenGabinete}`).send({ texto: 'Segunda' });

    const res = await request(app).get(`/demandas/${demanda.id}/observacoes`).set('Authorization', `Bearer ${tokenGabinete}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].texto).toBe('Segunda');
  }, 30000); // Neon real via rede.

  it('bloqueia assessor de rua com 403, mesmo na própria demanda', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999997008');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);

    const res = await request(app).get(`/demandas/${demanda.id}/observacoes`).set('Authorization', `Bearer ${tokenRua}`);

    expect(res.status).toBe(403);
  }, 30000); // Neon real via rede.
});

describe('PATCH /demandas/:id/observacoes/:notaId', () => {
  it('autor edita a própria observação', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999997009');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);
    const { accessToken: tokenGabinete } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999997010');
    const criada = await request(app).post(`/demandas/${demanda.id}/observacoes`).set('Authorization', `Bearer ${tokenGabinete}`).send({ texto: 'Original' });

    const res = await request(app)
      .patch(`/demandas/${demanda.id}/observacoes/${criada.body.data.id}`)
      .set('Authorization', `Bearer ${tokenGabinete}`)
      .send({ texto: 'Corrigida' });

    expect(res.status).toBe(200);
    expect(res.body.data.texto).toBe('Corrigida');
    expect(res.body.data.updatedAt).not.toBeNull();
  }, 30000); // Neon real via rede.

  it('bloqueia quem não é o autor, mesmo sendo chefe, com 403', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999997011');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);
    const { accessToken: tokenGabinete } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999997012');
    const { accessToken: tokenChefe } = await loginComoAssessor('CHEFE', '+5534999997013');
    const criada = await request(app).post(`/demandas/${demanda.id}/observacoes`).set('Authorization', `Bearer ${tokenGabinete}`).send({ texto: 'Original' });

    const res = await request(app)
      .patch(`/demandas/${demanda.id}/observacoes/${criada.body.data.id}`)
      .set('Authorization', `Bearer ${tokenChefe}`)
      .send({ texto: 'Tentativa do chefe' });

    expect(res.status).toBe(403);
  }, 30000); // Neon real via rede.
});

describe('DELETE /demandas/:id/observacoes/:notaId', () => {
  it('autor apaga a própria observação', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999997014');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);
    const { accessToken: tokenGabinete } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999997015');
    const criada = await request(app).post(`/demandas/${demanda.id}/observacoes`).set('Authorization', `Bearer ${tokenGabinete}`).send({ texto: 'A apagar' });

    const res = await request(app)
      .delete(`/demandas/${demanda.id}/observacoes/${criada.body.data.id}`)
      .set('Authorization', `Bearer ${tokenGabinete}`);

    expect(res.status).toBe(204);
    const lista = await request(app).get(`/demandas/${demanda.id}/observacoes`).set('Authorization', `Bearer ${tokenGabinete}`);
    expect(lista.body.data).toHaveLength(0);
  }, 30000); // Neon real via rede.

  it('bloqueia quem não é o autor com 403', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999997016');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);
    const { accessToken: tokenGabineteA } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999997017');
    const { accessToken: tokenGabineteB } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999997018');
    const criada = await request(app).post(`/demandas/${demanda.id}/observacoes`).set('Authorization', `Bearer ${tokenGabineteA}`).send({ texto: 'Nota' });

    const res = await request(app)
      .delete(`/demandas/${demanda.id}/observacoes/${criada.body.data.id}`)
      .set('Authorization', `Bearer ${tokenGabineteB}`);

    expect(res.status).toBe(403);
  }, 30000); // Neon real via rede.
});
