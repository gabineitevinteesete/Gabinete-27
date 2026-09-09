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

async function loginComoAssessor(
  role: 'ASSESSOR_RUA' | 'ASSESSOR_GABINETE' | 'CHEFE' = 'CHEFE',
  telefone = '+5534999995500',
) {
  const assessor = await testPrisma.user.create({
    data: { nome: 'Usuario Teste', telefone, role, ativo: true, pinDefinido: true, pinHash: await hash('482913') },
  });
  const login = await request(app).post('/auth/login').send({ telefone, pin: '482913' });
  return { assessor, accessToken: login.body.data.accessToken as string };
}

describe('GET /escala', () => {
  it('chefe consegue listar a escala do mês', async () => {
    const { accessToken } = await loginComoAssessor('CHEFE');

    const res = await request(app).get('/escala?mes=2026-09').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.dias).toEqual({});
  }, 30000);

  it('assessor de rua e de gabinete também conseguem listar', async () => {
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999995501');
    const { accessToken: tokenGabinete } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999995502');

    const resRua = await request(app).get('/escala').set('Authorization', `Bearer ${tokenRua}`);
    const resGabinete = await request(app).get('/escala').set('Authorization', `Bearer ${tokenGabinete}`);

    expect(resRua.status).toBe(200);
    expect(resGabinete.status).toBe(200);
  }, 30000);

  it('exige autenticação', async () => {
    const res = await request(app).get('/escala');
    expect(res.status).toBe(401);
  }, 30000);
});

describe('PUT /escala/:data', () => {
  it('chefe consegue substituir a escala de um dia', async () => {
    const { accessToken } = await loginComoAssessor('CHEFE', '+5534999995503');
    const assessor = await testPrisma.user.create({
      data: { nome: 'Ana Rua', telefone: '+5534999995504', role: 'ASSESSOR_RUA' },
    });

    const res = await request(app)
      .put('/escala/2026-09-15')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ atribuicoes: [{ userId: assessor.id, local: 'RUA' }] });

    expect(res.status).toBe(204);

    const listagem = await request(app).get('/escala?mes=2026-09').set('Authorization', `Bearer ${accessToken}`);
    expect(listagem.body.data.dias['2026-09-15']).toHaveLength(1);
    expect(listagem.body.data.dias['2026-09-15'][0].local).toBe('RUA');
  }, 30000);

  it('bloqueia assessor de rua e de gabinete com 403', async () => {
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999995505');
    const { accessToken: tokenGabinete } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999995506');

    const resRua = await request(app)
      .put('/escala/2026-09-15')
      .set('Authorization', `Bearer ${tokenRua}`)
      .send({ atribuicoes: [] });
    const resGabinete = await request(app)
      .put('/escala/2026-09-15')
      .set('Authorization', `Bearer ${tokenGabinete}`)
      .send({ atribuicoes: [] });

    expect(resRua.status).toBe(403);
    expect(resGabinete.status).toBe(403);
  }, 30000);

  it('rejeita userId de um chefe com 400', async () => {
    const { accessToken } = await loginComoAssessor('CHEFE', '+5534999995507');
    const outroChefe = await testPrisma.user.create({
      data: { nome: 'Outro Chefe', telefone: '+5534999995508', role: 'CHEFE' },
    });

    const res = await request(app)
      .put('/escala/2026-09-15')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ atribuicoes: [{ userId: outroChefe.id, local: 'GABINETE' }] });

    expect(res.status).toBe(400);
  }, 30000);

  it('rejeita um formato de data inválido com 400', async () => {
    const { accessToken } = await loginComoAssessor('CHEFE', '+5534999995509');

    const res = await request(app)
      .put('/escala/15-09-2026')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ atribuicoes: [] });

    expect(res.status).toBe(400);
  }, 30000);

  it('rejeita uma data inexistente no calendário com 400', async () => {
    const { accessToken } = await loginComoAssessor('CHEFE', '+5534999995510');

    const res = await request(app)
      .put('/escala/2026-02-30')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ atribuicoes: [] });

    expect(res.status).toBe(400);
  }, 30000);

  it('rejeita userId duplicado nas atribuições com 400', async () => {
    const { accessToken } = await loginComoAssessor('CHEFE', '+5534999995511');
    const assessor = await testPrisma.user.create({
      data: { nome: 'Carla Gabinete', telefone: '+5534999995512', role: 'ASSESSOR_GABINETE' },
    });

    const res = await request(app)
      .put('/escala/2026-09-16')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        atribuicoes: [
          { userId: assessor.id, local: 'GABINETE' },
          { userId: assessor.id, local: 'RUA' },
        ],
      });

    expect(res.status).toBe(400);
  }, 30000);
});
