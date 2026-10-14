import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../helpers/build-test-app.js';

describe('CORS', () => {
  it('permite o cabeçalho Idempotency-Key na checagem prévia do navegador', async () => {
    const app = buildTestApp();
    const res = await request(app)
      .options('/demandas')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,idempotency-key');
    expect(res.status).toBe(204);
    expect(String(res.headers['access-control-allow-headers']).toLowerCase()).toContain('idempotency-key');
  });
});
