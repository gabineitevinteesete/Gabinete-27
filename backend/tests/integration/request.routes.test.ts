import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { hash } from '@node-rs/argon2';
import { buildTestApp } from '../helpers/build-test-app.js';
import { testPrisma, resetDb } from '../helpers/reset-db.js';

const app = buildTestApp();

beforeEach(async () => {
  await resetDb();
  await testPrisma.requestPhoto.deleteMany();
  await testPrisma.request.deleteMany();
  await testPrisma.requestType.deleteMany();
}, 20000);

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function fotoValida(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 5, g: 5, b: 5 } } }).jpeg().toBuffer();
}

async function loginComoAssessor(role: 'ASSESSOR_RUA' | 'ASSESSOR_GABINETE' = 'ASSESSOR_RUA', telefone = '+5534999998000') {
  const assessor = await testPrisma.user.create({
    data: { nome: 'Assessor', telefone, role, ativo: true, pinDefinido: true, pinHash: await hash('482913') },
  });
  const login = await request(app).post('/auth/login').send({ telefone, pin: '482913' });
  return { assessor, accessToken: login.body.data.accessToken as string };
}

async function criarTipo(exigeDescricaoObrigatoria = false) {
  return testPrisma.requestType.create({
    data: { nome: exigeDescricaoObrigatoria ? 'Outros' : 'Tapa-buraco', ativo: true, exigeDescricaoObrigatoria },
  });
}

function camposBase(tipoId: string) {
  return {
    solicitanteNome: 'Maria Solicitante',
    solicitanteTelefone: '(34) 99999-0000',
    localExato: 'Em frente ao 100',
    tituloResumido: 'Buraco na rua',
    descricao: 'Buraco grande',
    requestTypeId: tipoId,
    autorizacaoDados: 'true',
  };
}

describe('POST /demandas', () => {
  it('cria a demanda com 2 fotos e retorna 201', async () => {
    const tipo = await criarTipo();
    const { accessToken } = await loginComoAssessor();
    const foto1 = await fotoValida();
    const foto2 = await fotoValida();

    const res = await request(app)
      .post('/demandas')
      .set('Authorization', `Bearer ${accessToken}`)
      .field(camposBase(tipo.id))
      .attach('fotos', foto1, 'foto1.jpg')
      .attach('fotos', foto2, 'foto2.jpg');

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('ENVIADA');
    expect(res.body.data.fotos).toHaveLength(2);
    expect(res.body.data.codigoInterno).toMatch(/^GD-\d{8}-[0-9A-F]{4}$/);
  }, 20000);

  it('rejeita com apenas 1 foto', async () => {
    const tipo = await criarTipo();
    const { accessToken } = await loginComoAssessor();
    const foto1 = await fotoValida();

    const res = await request(app)
      .post('/demandas')
      .set('Authorization', `Bearer ${accessToken}`)
      .field(camposBase(tipo.id))
      .attach('fotos', foto1, 'foto1.jpg');

    expect(res.status).toBe(400);
  }, 20000);

  it('rejeita quando o arquivo enviado não é uma imagem de verdade', async () => {
    const tipo = await criarTipo();
    const { accessToken } = await loginComoAssessor();
    const foto1 = await fotoValida();

    const res = await request(app)
      .post('/demandas')
      .set('Authorization', `Bearer ${accessToken}`)
      .field(camposBase(tipo.id))
      .attach('fotos', foto1, 'foto1.jpg')
      .attach('fotos', Buffer.from('nao e uma imagem'), 'arquivo.jpg');

    expect(res.status).toBe(400);

    const demandas = await testPrisma.request.count();
    expect(demandas).toBe(0);
  }, 20000);

  it('exige descrição do assunto quando o tipo é "Outros"', async () => {
    const tipo = await criarTipo(true);
    const { accessToken } = await loginComoAssessor();
    const foto1 = await fotoValida();
    const foto2 = await fotoValida();

    const res = await request(app)
      .post('/demandas')
      .set('Authorization', `Bearer ${accessToken}`)
      .field(camposBase(tipo.id))
      .attach('fotos', foto1, 'foto1.jpg')
      .attach('fotos', foto2, 'foto2.jpg');

    expect(res.status).toBe(400);
  }, 20000);

  it('exige autenticação', async () => {
    const res = await request(app).post('/demandas').field({ tituloResumido: 'x' });
    expect(res.status).toBe(401);
  });
});

describe('GET /demandas e GET /demandas/:id', () => {
  it('assessor de rua só lista e acessa as próprias demandas', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenEu } = await loginComoAssessor('ASSESSOR_RUA', '+5534999998001');
    const { accessToken: tokenOutro } = await loginComoAssessor('ASSESSOR_RUA', '+5534999998002');
    const foto1 = await fotoValida();
    const foto2 = await fotoValida();

    const minha = await request(app)
      .post('/demandas')
      .set('Authorization', `Bearer ${tokenEu}`)
      .field(camposBase(tipo.id))
      .attach('fotos', foto1, 'a.jpg')
      .attach('fotos', foto2, 'b.jpg');

    await request(app)
      .post('/demandas')
      .set('Authorization', `Bearer ${tokenOutro}`)
      .field(camposBase(tipo.id))
      .attach('fotos', foto1, 'a.jpg')
      .attach('fotos', foto2, 'b.jpg');

    const lista = await request(app).get('/demandas').set('Authorization', `Bearer ${tokenEu}`);
    expect(lista.body.data.items).toHaveLength(1);
    expect(lista.body.data.total).toBe(1);

    const detalheProprio = await request(app).get(`/demandas/${minha.body.data.id}`).set('Authorization', `Bearer ${tokenEu}`);
    expect(detalheProprio.status).toBe(200);

    const detalheDeOutro = await request(app).get(`/demandas/${minha.body.data.id}`).set('Authorization', `Bearer ${tokenOutro}`);
    expect(detalheDeOutro.status).toBe(403);
  }, 20000);

  it('gabinete lista e acessa qualquer demanda', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999998003');
    const { accessToken: tokenGabinete } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999998004');
    const foto1 = await fotoValida();
    const foto2 = await fotoValida();

    const criada = await request(app)
      .post('/demandas')
      .set('Authorization', `Bearer ${tokenRua}`)
      .field(camposBase(tipo.id))
      .attach('fotos', foto1, 'a.jpg')
      .attach('fotos', foto2, 'b.jpg');

    const lista = await request(app).get('/demandas').set('Authorization', `Bearer ${tokenGabinete}`);
    expect(lista.body.data.items).toHaveLength(1);

    const detalhe = await request(app).get(`/demandas/${criada.body.data.id}`).set('Authorization', `Bearer ${tokenGabinete}`);
    expect(detalhe.status).toBe(200);
  }, 20000);
});

describe('PATCH /demandas/:id', () => {
  it('assessor de rua edita a própria demanda antes de protocolada', async () => {
    const tipo = await criarTipo();
    const { accessToken } = await loginComoAssessor();
    const foto1 = await fotoValida();
    const foto2 = await fotoValida();

    const criada = await request(app)
      .post('/demandas')
      .set('Authorization', `Bearer ${accessToken}`)
      .field(camposBase(tipo.id))
      .attach('fotos', foto1, 'a.jpg')
      .attach('fotos', foto2, 'b.jpg');

    const editada = await request(app)
      .patch(`/demandas/${criada.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ tituloResumido: 'Título corrigido' });

    expect(editada.status).toBe(200);
    expect(editada.body.data.tituloResumido).toBe('Título corrigido');
  }, 20000);

  it('retorna 400 quando o id não é um uuid válido', async () => {
    const { accessToken } = await loginComoAssessor();
    const res = await request(app)
      .patch('/demandas/not-a-uuid')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ tituloResumido: 'x' });
    expect(res.status).toBe(400);
  }, 20000);
});
