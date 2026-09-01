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
