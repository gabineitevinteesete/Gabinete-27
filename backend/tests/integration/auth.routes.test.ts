import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { buildTestApp } from '../helpers/build-test-app.js';
import { testPrisma, resetDb } from '../helpers/reset-db.js';

const app = buildTestApp();

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function criarUsuarioAtivo(overrides: Partial<{ pinDefinido: boolean; ativo: boolean; role: 'CHEFE' | 'ASSESSOR_RUA' | 'ASSESSOR_GABINETE' }> = {}) {
  const pinHash = overrides.pinDefinido === false ? null : await hash('482913');
  return testPrisma.user.create({
    data: {
      nome: 'Usuário Teste',
      telefone: '+5534999995000',
      role: overrides.role ?? 'ASSESSOR_RUA',
      ativo: overrides.ativo ?? true,
      pinDefinido: overrides.pinDefinido ?? true,
      pinHash,
    },
  });
}

// Estes testes dependem de um Postgres real (via testPrisma) — agrupados sob um único
// beforeEach que zera as tabelas. O describe de rate limiting abaixo fica FORA deste grupo
// de propósito: o rate limiter roda antes de qualquer acesso ao banco, então aquele teste
// não deve depender de resetDb()/DB disponível.
describe('fluxos que dependem do banco de dados', () => {
  beforeEach(async () => {
    await resetDb();
  });

  describe('POST /auth/login', () => {
    it('retorna accessToken e cookie de refresh no sucesso', async () => {
      await criarUsuarioAtivo();
      const res = await request(app).post('/auth/login').send({ telefone: '+5534999995000', pin: '482913' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ok');
      expect(res.body.data.accessToken).toBeTruthy();
      expect(res.headers['set-cookie']?.[0]).toContain('refreshToken=');
    });

    it('retorna 401 com PIN errado', async () => {
      await criarUsuarioAtivo();
      const res = await request(app).post('/auth/login').send({ telefone: '+5534999995000', pin: '000001' });
      expect(res.status).toBe(401);
    });

    it('retorna primeiro_acesso quando o PIN ainda não foi definido', async () => {
      await criarUsuarioAtivo({ pinDefinido: false });
      const res = await request(app).post('/auth/login').send({ telefone: '+5534999995000', pin: '000000' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('primeiro_acesso');
    });
  });

  describe('fluxo completo: login -> refresh -> logout', () => {
    it('gira o refresh token e depois revoga no logout', async () => {
      await criarUsuarioAtivo();
      const login = await request(app).post('/auth/login').send({ telefone: '+5534999995000', pin: '482913' });
      const cookie = login.headers['set-cookie'];

      const refreshed = await request(app).post('/auth/refresh').set('Cookie', cookie);
      expect(refreshed.status).toBe(200);
      expect(refreshed.body.data.accessToken).toBeTruthy();

      const novoCookie = refreshed.headers['set-cookie'];
      const logout = await request(app).post('/auth/logout').set('Cookie', novoCookie);
      expect(logout.status).toBe(204);

      const apósLogout = await request(app).post('/auth/refresh').set('Cookie', novoCookie);
      expect(apósLogout.status).toBe(401);
    });
  });

  describe('POST /auth/trocar-pin', () => {
    it('exige autenticação', async () => {
      const res = await request(app).post('/auth/trocar-pin').send({ pinAtual: '482913', novoPin: '739284' });
      expect(res.status).toBe(401);
    });

    it('troca o PIN quando autenticado e o PIN atual está correto', async () => {
      await criarUsuarioAtivo();
      const login = await request(app).post('/auth/login').send({ telefone: '+5534999995000', pin: '482913' });
      const accessToken = login.body.data.accessToken;

      const res = await request(app)
        .post('/auth/trocar-pin')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ pinAtual: '482913', novoPin: '739284' });

      expect(res.status).toBe(200);
    });
  });

  describe('POST /auth/usuarios/:id/resetar-acesso', () => {
    it('só o chefe pode resetar o acesso de outro usuário', async () => {
      const assessor = await criarUsuarioAtivo();
      const chefe = await testPrisma.user.create({
        data: { nome: 'Chefe', telefone: '+5534999995001', role: 'CHEFE', ativo: true, pinDefinido: true, pinHash: await hash('482913') },
      });

      const loginAssessor = await request(app).post('/auth/login').send({ telefone: assessor.telefone, pin: '482913' });
      const negado = await request(app)
        .post(`/auth/usuarios/${assessor.id}/resetar-acesso`)
        .set('Authorization', `Bearer ${loginAssessor.body.data.accessToken}`);
      expect(negado.status).toBe(403);

      const loginChefe = await request(app).post('/auth/login').send({ telefone: chefe.telefone, pin: '482913' });
      const permitido = await request(app)
        .post(`/auth/usuarios/${assessor.id}/resetar-acesso`)
        .set('Authorization', `Bearer ${loginChefe.body.data.accessToken}`);
      expect(permitido.status).toBe(200);

      const usuarioAtualizado = await testPrisma.user.findUniqueOrThrow({ where: { id: assessor.id } });
      expect(usuarioAtualizado.pinDefinido).toBe(false);
    });

    it('retorna 400 quando o :id não é um uuid válido', async () => {
      const chefe = await testPrisma.user.create({
        data: { nome: 'Chefe', telefone: '+5534999995002', role: 'CHEFE', ativo: true, pinDefinido: true, pinHash: await hash('482913') },
      });
      const loginChefe = await request(app).post('/auth/login').send({ telefone: chefe.telefone, pin: '482913' });

      const res = await request(app)
        .post('/auth/usuarios/not-a-uuid/resetar-acesso')
        .set('Authorization', `Bearer ${loginChefe.body.data.accessToken}`);

      expect(res.status).toBe(400);
    });
  });
});

describe('rate limiting em POST /auth/login', () => {
  it(
    'retorna 429 com o envelope padrão (JSON) ao exceder o limite de tentativas',
    async () => {
      // O loginLimiter (limit: 10 por minuto, chaveado por IP) roda ANTES de qualquer acesso
      // ao banco, então este teste não precisa de Postgres disponível — mas as requisições
      // que NÃO são bloqueadas ainda chegam ao controller e tentam falar com o banco (que
      // está indisponível neste ambiente), o que pode demorar até expirar o timeout de conexão.
      // Por isso disparamos as requisições em paralelo (o wall-clock fica limitado pela mais
      // lenta, não pela soma de todas) em vez de sequencialmente aguardando uma de cada vez.
      // Como o limiter é um singleton no nível do módulo de rotas, o contador pode já carregar
      // requisições de outros testes deste arquivo — por isso procuramos QUALQUER resposta 429
      // no lote, em vez de assumir que é sempre a 11ª chamada.
      const respostas = await Promise.all(
        Array.from({ length: 15 }, () =>
          request(app).post('/auth/login').send({ telefone: '+5534999995000', pin: '482913' }),
        ),
      );

      const bloqueada = respostas.find((res) => res.status === 429);
      expect(bloqueada).toBeDefined();
      expect(bloqueada!.body).toEqual({ success: false, error: expect.any(String) });
    },
    20000,
  );
});
