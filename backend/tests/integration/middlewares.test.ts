import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { authenticate } from '../../src/middlewares/authenticate.js';
import { requireRole } from '../../src/middlewares/require-role.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { signAccessToken } from '../../src/utils/jwt.js';
import { createFakeUserRepo } from '../helpers/fakes.js';

function buildApp(userRepo: ReturnType<typeof createFakeUserRepo>) {
  const app = express();
  app.get('/privado', authenticate({ userRepo }), (req, res) => {
    res.json({ success: true, data: { userId: req.user?.id } });
  });
  app.get('/so-chefe', authenticate({ userRepo }), requireRole('CHEFE'), (_req, res) => {
    res.json({ success: true, data: 'ok' });
  });
  app.use(errorHandler);
  return app;
}

describe('authenticate + requireRole', () => {
  it('401 sem token', async () => {
    const userRepo = createFakeUserRepo();
    const res = await request(buildApp(userRepo)).get('/privado');
    expect(res.status).toBe(401);
  });

  it('200 com token válido de usuário ativo', async () => {
    const userRepo = createFakeUserRepo();
    const user = await userRepo.create({ nome: 'Ana', telefone: '+5534999990099', role: 'ASSESSOR_RUA' });
    const token = signAccessToken({ sub: user.id, role: 'ASSESSOR_RUA' });

    const res = await request(buildApp(userRepo)).get('/privado').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.userId).toBe(user.id);
  });

  it('401 quando o usuário foi desativado após o token ser emitido', async () => {
    const userRepo = createFakeUserRepo();
    const user = await userRepo.create({ nome: 'Ana', telefone: '+5534999990098', role: 'ASSESSOR_RUA' });
    const token = signAccessToken({ sub: user.id, role: 'ASSESSOR_RUA' });
    await userRepo.setAtivo(user.id, false);

    const res = await request(buildApp(userRepo)).get('/privado').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('403 quando o papel não tem permissão', async () => {
    const userRepo = createFakeUserRepo();
    const user = await userRepo.create({ nome: 'Ana', telefone: '+5534999990097', role: 'ASSESSOR_RUA' });
    const token = signAccessToken({ sub: user.id, role: 'ASSESSOR_RUA' });

    const res = await request(buildApp(userRepo)).get('/so-chefe').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
