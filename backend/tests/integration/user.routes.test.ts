import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { buildTestApp } from '../helpers/build-test-app.js';
import { testPrisma, resetDb } from '../helpers/reset-db.js';

const app = buildTestApp();

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function loginComoChefe() {
  const chefe = await testPrisma.user.create({
    data: { nome: 'Chefe', telefone: '+5534999996000', role: 'CHEFE', ativo: true, pinDefinido: true, pinHash: await hash('482913') },
  });
  const login = await request(app).post('/auth/login').send({ telefone: chefe.telefone, pin: '482913' });
  return { chefe, accessToken: login.body.data.accessToken as string };
}

async function loginComoAssessor() {
  const assessor = await testPrisma.user.create({
    data: { nome: 'Assessor', telefone: '+5534999996001', role: 'ASSESSOR_RUA', ativo: true, pinDefinido: true, pinHash: await hash('482913') },
  });
  const login = await request(app).post('/auth/login').send({ telefone: assessor.telefone, pin: '482913' });
  return { assessor, accessToken: login.body.data.accessToken as string };
}

describe('POST /usuarios', () => {
  it('chefe cria um novo assessor', async () => {
    const { accessToken } = await loginComoChefe();
    const res = await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Novo Assessor', telefone: '(34) 99999-7777', role: 'ASSESSOR_RUA' });

    expect(res.status).toBe(201);
    expect(res.body.data.telefone).toBe('+5534999997777');
  });

  it('assessor não pode criar outro usuário', async () => {
    const { accessToken } = await loginComoAssessor();
    const res = await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Novo Assessor', telefone: '(34) 99999-7777', role: 'ASSESSOR_RUA' });

    expect(res.status).toBe(403);
  });

  it('rejeita telefone duplicado com 409', async () => {
    const { accessToken } = await loginComoChefe();
    await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Assessor A', telefone: '(34) 99999-7777', role: 'ASSESSOR_RUA' });

    const res = await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Assessor B', telefone: '(34) 99999-7777', role: 'ASSESSOR_GABINETE' });

    expect(res.status).toBe(409);
  });
});

describe('GET /usuarios, PATCH /usuarios/:id/role e /ativo', () => {
  it('lista, atualiza papel e desativa', async () => {
    const { accessToken } = await loginComoChefe();
    const criado = await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Assessor C', telefone: '(34) 99999-8888', role: 'ASSESSOR_RUA' });

    const lista = await request(app).get('/usuarios').set('Authorization', `Bearer ${accessToken}`);
    expect(lista.body.data).toHaveLength(2); // o chefe + o assessor criado

    const atualizado = await request(app)
      .patch(`/usuarios/${criado.body.data.id}/role`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ role: 'ASSESSOR_GABINETE' });
    expect(atualizado.body.data.role).toBe('ASSESSOR_GABINETE');

    const desativado = await request(app)
      .patch(`/usuarios/${criado.body.data.id}/ativo`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ativo: false });
    expect(desativado.body.data.ativo).toBe(false);
  });
});
