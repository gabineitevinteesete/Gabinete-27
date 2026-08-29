import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../helpers/build-test-app.js';

describe('GET /health', () => {
  it('retorna status ok', async () => {
    const app = buildTestApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { status: 'ok' } });
  });
});
