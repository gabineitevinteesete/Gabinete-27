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

async function loginComoAssessor(role: 'ASSESSOR_RUA' | 'ASSESSOR_GABINETE' | 'CHEFE' = 'CHEFE', telefone = '+5534999995400') {
  const assessor = await testPrisma.user.create({
    data: { nome: 'Usuario Teste', telefone, role, ativo: true, pinDefinido: true, pinHash: await hash('482913') },
  });
  const login = await request(app).post('/auth/login').send({ telefone, pin: '482913' });
  return { assessor, accessToken: login.body.data.accessToken as string };
}

describe('GET /dashboard/resumo', () => {
  it('chefe recebe os 4 blocos', async () => {
    const { accessToken } = await loginComoAssessor('CHEFE');

    const res = await request(app).get('/dashboard/resumo').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.porStatus).toBeInstanceOf(Array);
    expect(res.body.data.porBairro).toBeInstanceOf(Array);
    expect(res.body.data.porAssessor).toBeInstanceOf(Array);
    expect(res.body.data.paradas).toBeInstanceOf(Array);
  }, 30000);

  it('bloqueia assessor de gabinete com 403', async () => {
    const { accessToken } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999995401');

    const res = await request(app).get('/dashboard/resumo').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(403);
  }, 30000);

  it('bloqueia assessor de rua com 403', async () => {
    const { accessToken } = await loginComoAssessor('ASSESSOR_RUA', '+5534999995402');

    const res = await request(app).get('/dashboard/resumo').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(403);
  }, 30000);
});

describe('GET /dashboard/produtividade-assessores', () => {
  it('chefe recebe a lista de assessores de rua com contagens', async () => {
    const { accessToken } = await loginComoAssessor('CHEFE', '+5534999995403');
    await testPrisma.user.create({
      data: { nome: 'Assessor Rua', telefone: '+5534999995404', role: 'ASSESSOR_RUA' },
    });

    const res = await request(app).get('/dashboard/produtividade-assessores').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.some((a: { assessorNome: string }) => a.assessorNome === 'Assessor Rua')).toBe(true);
  }, 30000);

  it('aceita o parâmetro mes no formato YYYY-MM', async () => {
    const { accessToken } = await loginComoAssessor('CHEFE', '+5534999995405');

    const res = await request(app)
      .get('/dashboard/produtividade-assessores?mes=2026-01')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
  }, 30000);

  it('rejeita um mes em formato inválido com 400', async () => {
    const { accessToken } = await loginComoAssessor('CHEFE', '+5534999995406');

    const res = await request(app)
      .get('/dashboard/produtividade-assessores?mes=janeiro')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
  }, 30000);

  it('bloqueia assessor de gabinete e de rua com 403', async () => {
    const { accessToken: tokenGabinete } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999995407');
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999995408');

    const resGabinete = await request(app).get('/dashboard/produtividade-assessores').set('Authorization', `Bearer ${tokenGabinete}`);
    const resRua = await request(app).get('/dashboard/produtividade-assessores').set('Authorization', `Bearer ${tokenRua}`);

    expect(resGabinete.status).toBe(403);
    expect(resRua.status).toBe(403);
  }, 30000);
});
