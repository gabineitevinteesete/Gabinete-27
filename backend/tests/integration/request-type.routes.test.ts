import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { buildTestApp } from '../helpers/build-test-app.js';
import { testPrisma, resetDb } from '../helpers/reset-db.js';

const app = buildTestApp();

beforeEach(async () => {
  await resetDb();
  await testPrisma.requestType.deleteMany();
}, 30000); // Neon real via rede: deleteMany em sequência passa de 20s sob variação de latência neste ambiente.

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function loginComoAssessor() {
  const assessor = await testPrisma.user.create({
    data: { nome: 'Assessor', telefone: '+5534999997000', role: 'ASSESSOR_RUA', ativo: true, pinDefinido: true, pinHash: await hash('482913') },
  });
  const login = await request(app).post('/auth/login').send({ telefone: assessor.telefone, pin: '482913' });
  return login.body.data.accessToken as string;
}

describe('GET /tipos-demanda', () => {
  it('exige autenticação', async () => {
    const res = await request(app).get('/tipos-demanda');
    expect(res.status).toBe(401);
  }, 30000); // Neon real via rede: variação de latência ocasional neste ambiente.

  it('lista apenas os tipos ativos, ordenados por nome', async () => {
    await testPrisma.requestType.createMany({
      data: [
        { nome: 'Tapa-buraco', ativo: true, exigeDescricaoObrigatoria: false },
        { nome: 'Outros', ativo: true, exigeDescricaoObrigatoria: true },
        { nome: 'Assunto desativado', ativo: false, exigeDescricaoObrigatoria: false },
      ],
    });

    const accessToken = await loginComoAssessor();
    const res = await request(app).get('/tipos-demanda').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.map((t: { nome: string }) => t.nome)).toEqual(['Outros', 'Tapa-buraco']);
    expect(res.body.data.find((t: { nome: string }) => t.nome === 'Outros').exigeDescricaoObrigatoria).toBe(true);
  }, 30000); // Neon real via rede: createMany + login passa de 20s sob variação de latência neste ambiente.
});

async function loginComoChefe() {
  const chefe = await testPrisma.user.create({
    data: { nome: 'Chefe', telefone: '+5534999998000', role: 'CHEFE', ativo: true, pinDefinido: true, pinHash: await hash('482913') },
  });
  const login = await request(app).post('/auth/login').send({ telefone: chefe.telefone, pin: '482913' });
  return login.body.data.accessToken as string;
}

describe('GET /tipos-demanda/todos', () => {
  it('bloqueia quem não é chefe com 403', async () => {
    const accessToken = await loginComoAssessor();
    const res = await request(app).get('/tipos-demanda/todos').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  }, 30000);

  it('lista tipos ativos e inativos para o chefe', async () => {
    await testPrisma.requestType.createMany({
      data: [
        { nome: 'Tapa-buraco', ativo: true, exigeDescricaoObrigatoria: false },
        { nome: 'Assunto desativado', ativo: false, exigeDescricaoObrigatoria: false },
      ],
    });
    const accessToken = await loginComoChefe();
    const res = await request(app).get('/tipos-demanda/todos').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.map((t: { nome: string }) => t.nome)).toEqual(['Assunto desativado', 'Tapa-buraco']);
  }, 30000);
});

describe('POST /tipos-demanda', () => {
  it('bloqueia quem não é chefe com 403', async () => {
    const accessToken = await loginComoAssessor();
    const res = await request(app)
      .post('/tipos-demanda')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Novo tipo', exigeDescricaoObrigatoria: false });
    expect(res.status).toBe(403);
  }, 30000);

  it('cria um tipo de demanda', async () => {
    const accessToken = await loginComoChefe();
    const res = await request(app)
      .post('/tipos-demanda')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Iluminação pública', exigeDescricaoObrigatoria: true });

    expect(res.status).toBe(201);
    expect(res.body.data.nome).toBe('Iluminação pública');
    expect(res.body.data.ativo).toBe(true);
  }, 30000);

  it('rejeita nome duplicado com 409', async () => {
    const accessToken = await loginComoChefe();
    await request(app)
      .post('/tipos-demanda')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Poda de árvore', exigeDescricaoObrigatoria: false });
    const res = await request(app)
      .post('/tipos-demanda')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Poda de árvore', exigeDescricaoObrigatoria: true });

    expect(res.status).toBe(409);
  }, 30000);
});

describe('PATCH /tipos-demanda/:id', () => {
  it('bloqueia quem não é chefe com 403', async () => {
    const tipo = await testPrisma.requestType.create({ data: { nome: 'Tipo X', ativo: true, exigeDescricaoObrigatoria: false } });
    const accessToken = await loginComoAssessor();
    const res = await request(app)
      .patch(`/tipos-demanda/${tipo.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Tipo Y' });
    expect(res.status).toBe(403);
  }, 30000);

  it('edita nome e exigência de descrição', async () => {
    const tipo = await testPrisma.requestType.create({ data: { nome: 'Tipo Original', ativo: true, exigeDescricaoObrigatoria: false } });
    const accessToken = await loginComoChefe();
    const res = await request(app)
      .patch(`/tipos-demanda/${tipo.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Tipo Corrigido', exigeDescricaoObrigatoria: true });

    expect(res.status).toBe(200);
    expect(res.body.data.nome).toBe('Tipo Corrigido');
    expect(res.body.data.exigeDescricaoObrigatoria).toBe(true);
  }, 30000);
});

describe('PATCH /tipos-demanda/:id/ativo', () => {
  it('bloqueia quem não é chefe com 403', async () => {
    const tipo = await testPrisma.requestType.create({ data: { nome: 'Tipo Z', ativo: true, exigeDescricaoObrigatoria: false } });
    const accessToken = await loginComoAssessor();
    const res = await request(app)
      .patch(`/tipos-demanda/${tipo.id}/ativo`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ativo: false });
    expect(res.status).toBe(403);
  }, 30000);

  it('desativa e reativa um tipo de demanda', async () => {
    const tipo = await testPrisma.requestType.create({ data: { nome: 'Tipo W', ativo: true, exigeDescricaoObrigatoria: false } });
    const accessToken = await loginComoChefe();

    const desativado = await request(app)
      .patch(`/tipos-demanda/${tipo.id}/ativo`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ativo: false });
    expect(desativado.status).toBe(200);
    expect(desativado.body.data.ativo).toBe(false);

    const reativado = await request(app)
      .patch(`/tipos-demanda/${tipo.id}/ativo`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ativo: true });
    expect(reativado.status).toBe(200);
    expect(reativado.body.data.ativo).toBe(true);
  }, 30000);
});
