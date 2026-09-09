import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { buildTestApp } from '../helpers/build-test-app.js';
import { testPrisma, resetDb } from '../helpers/reset-db.js';

const app = buildTestApp();

beforeEach(async () => {
  await resetDb();
}, 30000); // Neon real via rede: resetDb() passa de 20s sob variação de latência neste ambiente.

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
  }, 30000); // Neon real via rede: criação de usuário + login (argon2) + POST passa de 20s neste ambiente.

  it('assessor não pode criar outro usuário', async () => {
    const { accessToken } = await loginComoAssessor();
    const res = await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Novo Assessor', telefone: '(34) 99999-7777', role: 'ASSESSOR_RUA' });

    expect(res.status).toBe(403);
  }, 30000); // Neon real via rede: criação de usuário + login (argon2) passa de 20s neste ambiente.

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
  }, 30000); // Neon real via rede: login + 2 criações de usuário (argon2) passa de 20s neste ambiente.
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
  }, 30000); // Neon real via rede: login + criação + 3 chamadas encadeadas passa de 20s neste ambiente.

  // I5: sem validação, um :id malformado chegava ao Prisma e virava um 500 cru.
  it('retorna 400 quando o :id não é um uuid válido', async () => {
    const { accessToken } = await loginComoChefe();

    const role = await request(app)
      .patch('/usuarios/not-a-uuid/role')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ role: 'ASSESSOR_GABINETE' });
    expect(role.status).toBe(400);

    const ativo = await request(app)
      .patch('/usuarios/not-a-uuid/ativo')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ativo: false });
    expect(ativo.status).toBe(400);
  }, 30000); // Neon real via rede: criação de usuário + login (argon2) passa de 20s neste ambiente.
});

// I7: sem esta proteção o gabinete pode ficar sem nenhum chefe ativo e sem recuperação.
describe('proteção do último chefe ativo', () => {
  it('retorna 409 ao tentar desativar ou rebaixar o único chefe', async () => {
    const { chefe, accessToken } = await loginComoChefe();

    const desativar = await request(app)
      .patch(`/usuarios/${chefe.id}/ativo`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ativo: false });
    expect(desativar.status).toBe(409);

    const rebaixar = await request(app)
      .patch(`/usuarios/${chefe.id}/role`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ role: 'ASSESSOR_GABINETE' });
    expect(rebaixar.status).toBe(409);

    const aindaChefe = await testPrisma.user.findUniqueOrThrow({ where: { id: chefe.id } });
    expect(aindaChefe.ativo).toBe(true);
    expect(aindaChefe.role).toBe('CHEFE');
  }, 30000); // Neon real via rede: login + 2 PATCH + leitura de verificação passa de 20s neste ambiente.

  it('permite desativar um chefe quando há outro chefe ativo', async () => {
    const { accessToken } = await loginComoChefe();
    const outroChefe = await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Segundo Chefe', telefone: '(34) 99999-6002', role: 'CHEFE' });

    const res = await request(app)
      .patch(`/usuarios/${outroChefe.body.data.id}/ativo`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ativo: false });

    expect(res.status).toBe(200);
    expect(res.body.data.ativo).toBe(false);
  }, 30000); // Neon real via rede: login + criação de chefe + PATCH passa de 20s neste ambiente.
});

describe('PATCH /usuarios/:id', () => {
  it('chefe corrige nome e telefone de um assessor de rua', async () => {
    const { accessToken } = await loginComoChefe();
    const criado = await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Nome Errado', telefone: '(34) 99999-8888', role: 'ASSESSOR_RUA' });

    const editado = await request(app)
      .patch(`/usuarios/${criado.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Nome Certo', telefone: '(34) 98888-7777' });

    expect(editado.status).toBe(200);
    expect(editado.body.data.nome).toBe('Nome Certo');
    expect(editado.body.data.telefone).toBe('+5534988887777');
  }, 30000);

  it('permite editar mantendo o mesmo telefone', async () => {
    const { accessToken } = await loginComoChefe();
    const criado = await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Nome Errado', telefone: '(34) 99999-8888', role: 'ASSESSOR_RUA' });

    const editado = await request(app)
      .patch(`/usuarios/${criado.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Nome Certo', telefone: '(34) 99999-8888' });

    expect(editado.status).toBe(200);
    expect(editado.body.data.nome).toBe('Nome Certo');
  }, 30000);

  it('rejeita telefone já usado por outro usuário com 409', async () => {
    const { accessToken } = await loginComoChefe();
    await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Assessor A', telefone: '(34) 99999-1111', role: 'ASSESSOR_RUA' });
    const criadoB = await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Assessor B', telefone: '(34) 99999-2222', role: 'ASSESSOR_GABINETE' });

    const res = await request(app)
      .patch(`/usuarios/${criadoB.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ telefone: '(34) 99999-1111' });

    expect(res.status).toBe(409);
  }, 30000);

  it('assessor não pode editar outro usuário', async () => {
    const { accessToken: tokenChefe } = await loginComoChefe();
    const criado = await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${tokenChefe}`)
      .send({ nome: 'Assessor C', telefone: '(34) 99999-3333', role: 'ASSESSOR_RUA' });
    const { accessToken: tokenAssessor } = await loginComoAssessor();

    const res = await request(app)
      .patch(`/usuarios/${criado.body.data.id}`)
      .set('Authorization', `Bearer ${tokenAssessor}`)
      .send({ nome: 'Tentativa' });

    expect(res.status).toBe(403);
  }, 30000);

  it('permite editar um chefe', async () => {
    const { chefe, accessToken } = await loginComoChefe();

    const res = await request(app)
      .patch(`/usuarios/${chefe.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Chefe Renomeado' });

    expect(res.status).toBe(200);
    expect(res.body.data.nome).toBe('Chefe Renomeado');
  }, 30000);
});

describe('GET /usuarios?role=', () => {
  it('filtra por papel', async () => {
    const { accessToken } = await loginComoChefe();
    await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Rua', telefone: '(34) 99999-4444', role: 'ASSESSOR_RUA' });
    await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Gabinete', telefone: '(34) 99999-5555', role: 'ASSESSOR_GABINETE' });

    const res = await request(app).get('/usuarios?role=ASSESSOR_RUA').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.every((u: { role: string }) => u.role === 'ASSESSOR_RUA')).toBe(true);
    expect(res.body.data.some((u: { nome: string }) => u.nome === 'Rua')).toBe(true);
    expect(res.body.data.some((u: { nome: string }) => u.nome === 'Gabinete')).toBe(false);
  }, 30000);

  it('combina filtro de papel e ativo', async () => {
    const { accessToken } = await loginComoChefe();
    const criado = await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Rua Inativo', telefone: '(34) 99999-6666', role: 'ASSESSOR_RUA' });
    await request(app)
      .patch(`/usuarios/${criado.body.data.id}/ativo`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ativo: false });
    await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Rua Ativo', telefone: '(34) 99999-7777', role: 'ASSESSOR_RUA' });

    const res = await request(app)
      .get('/usuarios?role=ASSESSOR_RUA&ativo=true')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.body.data.some((u: { nome: string }) => u.nome === 'Rua Ativo')).toBe(true);
    expect(res.body.data.some((u: { nome: string }) => u.nome === 'Rua Inativo')).toBe(false);
  }, 30000);
});
