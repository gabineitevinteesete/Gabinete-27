import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { hash } from '@node-rs/argon2';
import { buildTestApp } from '../helpers/build-test-app.js';
import { testPrisma, resetDb } from '../helpers/reset-db.js';
import type { UserRoleValue } from '../../src/utils/jwt.js';

const app = buildTestApp();

beforeEach(async () => {
  await resetDb();
  await testPrisma.requestPhoto.deleteMany();
  await testPrisma.request.deleteMany();
  await testPrisma.requestType.deleteMany();
}, 30000); // Neon real via rede: deleteMany em sequência passa de 20s sob variação de latência neste ambiente.

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function fotoValida(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 5, g: 5, b: 5 } } }).jpeg().toBuffer();
}

async function loginComoAssessor(role: UserRoleValue = 'ASSESSOR_RUA', telefone = '+5534999998000') {
  const assessor = await testPrisma.user.create({
    data: { nome: 'Assessor', telefone, role, ativo: true, pinDefinido: true, pinHash: await hash('482913') },
  });
  const login = await request(app).post('/auth/login').send({ telefone, pin: '482913' });
  return { assessor, accessToken: login.body.data.accessToken as string };
}

async function criarTipo(exigeDescricaoObrigatoria = false) {
  return testPrisma.requestType.create({
    data: { nome: exigeDescricaoObrigatoria ? 'Outros' : 'Tapa-buraco', ativo: true, exigeDescricaoObrigatoria },
  });
}

function camposBase(tipoId: string) {
  return {
    solicitanteNome: 'Maria Solicitante',
    solicitanteTelefone: '(34) 99999-0000',
    localExato: 'Em frente ao 100',
    tituloResumido: 'Buraco na rua',
    descricao: 'Buraco grande',
    requestTypeId: tipoId,
    autorizacaoDados: 'true',
  };
}

describe('POST /demandas', () => {
  it('cria a demanda com 2 fotos e retorna 201', async () => {
    const tipo = await criarTipo();
    const { accessToken } = await loginComoAssessor();
    const foto1 = await fotoValida();
    const foto2 = await fotoValida();

    const res = await request(app)
      .post('/demandas')
      .set('Authorization', `Bearer ${accessToken}`)
      .field(camposBase(tipo.id))
      .attach('fotos', foto1, 'foto1.jpg')
      .attach('fotos', foto2, 'foto2.jpg');

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('ENVIADA');
    expect(res.body.data.fotos).toHaveLength(2);
    expect(res.body.data.codigoInterno).toMatch(/^GD-\d{8}-[0-9A-F]{8}$/);
  }, 30000); // Neon real via rede: login + upload/processamento de 2 fotos passa de 20s neste ambiente.

  it('rejeita com apenas 1 foto', async () => {
    const tipo = await criarTipo();
    const { accessToken } = await loginComoAssessor();
    const foto1 = await fotoValida();

    const res = await request(app)
      .post('/demandas')
      .set('Authorization', `Bearer ${accessToken}`)
      .field(camposBase(tipo.id))
      .attach('fotos', foto1, 'foto1.jpg');

    expect(res.status).toBe(400);
  }, 30000); // Neon real via rede: login + upload/processamento de foto passa de 20s neste ambiente.

  it('rejeita quando o arquivo enviado não é uma imagem de verdade', async () => {
    const tipo = await criarTipo();
    const { accessToken } = await loginComoAssessor();
    const foto1 = await fotoValida();

    const res = await request(app)
      .post('/demandas')
      .set('Authorization', `Bearer ${accessToken}`)
      .field(camposBase(tipo.id))
      .attach('fotos', foto1, 'foto1.jpg')
      .attach('fotos', Buffer.from('nao e uma imagem'), 'arquivo.jpg');

    expect(res.status).toBe(400);

    const demandas = await testPrisma.request.count();
    expect(demandas).toBe(0);
  }, 30000); // Neon real via rede: login + upload/processamento de foto passa de 20s neste ambiente.

  it('rejeita mais de 4 fotos (limite do multer) com 400', async () => {
    const tipo = await criarTipo();
    const { accessToken } = await loginComoAssessor();
    const fotos = await Promise.all([fotoValida(), fotoValida(), fotoValida(), fotoValida(), fotoValida()]);

    let req = request(app).post('/demandas').set('Authorization', `Bearer ${accessToken}`).field(camposBase(tipo.id));
    fotos.forEach((foto, i) => {
      req = req.attach('fotos', foto, `foto${i}.jpg`);
    });
    const res = await req;

    expect(res.status).toBe(400);

    const demandas = await testPrisma.request.count();
    expect(demandas).toBe(0);
  }, 30000); // Neon real via rede: login + processamento de 5 fotos passa de 20s neste ambiente.

  it('rejeita quando o campo de arquivo tem nome diferente de "fotos"', async () => {
    const tipo = await criarTipo();
    const { accessToken } = await loginComoAssessor();
    const foto1 = await fotoValida();
    const foto2 = await fotoValida();

    const res = await request(app)
      .post('/demandas')
      .set('Authorization', `Bearer ${accessToken}`)
      .field(camposBase(tipo.id))
      .attach('arquivoErrado', foto1, 'foto1.jpg')
      .attach('arquivoErrado', foto2, 'foto2.jpg');

    expect(res.status).toBe(400);
  }, 30000); // Neon real via rede: login passa de 20s neste ambiente.

  it('exige descrição do assunto quando o tipo é "Outros"', async () => {
    const tipo = await criarTipo(true);
    const { accessToken } = await loginComoAssessor();
    const foto1 = await fotoValida();
    const foto2 = await fotoValida();

    const res = await request(app)
      .post('/demandas')
      .set('Authorization', `Bearer ${accessToken}`)
      .field(camposBase(tipo.id))
      .attach('fotos', foto1, 'foto1.jpg')
      .attach('fotos', foto2, 'foto2.jpg');

    expect(res.status).toBe(400);
  }, 30000); // Neon real via rede: login + upload/processamento de 2 fotos passa de 20s neste ambiente.

  it('normaliza o telefone do solicitante para E.164', async () => {
    const tipo = await criarTipo();
    const { accessToken } = await loginComoAssessor('ASSESSOR_RUA', '+5534999998010');
    const foto1 = await fotoValida();
    const foto2 = await fotoValida();

    const res = await request(app)
      .post('/demandas')
      .set('Authorization', `Bearer ${accessToken}`)
      .field(camposBase(tipo.id))
      .attach('fotos', foto1, 'foto1.jpg')
      .attach('fotos', foto2, 'foto2.jpg');

    expect(res.status).toBe(201);
    expect(res.body.data.solicitanteTelefone).toBe('+5534999990000');
  }, 30000); // Neon real via rede: login + upload/processamento de 2 fotos passa de 20s neste ambiente.

  it('rejeita com 400 um telefone de solicitante inválido', async () => {
    const tipo = await criarTipo();
    const { accessToken } = await loginComoAssessor('ASSESSOR_RUA', '+5534999998011');
    const foto1 = await fotoValida();
    const foto2 = await fotoValida();

    const res = await request(app)
      .post('/demandas')
      .set('Authorization', `Bearer ${accessToken}`)
      .field({ ...camposBase(tipo.id), solicitanteTelefone: '0000000000000000' })
      .attach('fotos', foto1, 'foto1.jpg')
      .attach('fotos', foto2, 'foto2.jpg');

    expect(res.status).toBe(400);
    expect(await testPrisma.request.count()).toBe(0);
  }, 30000); // Neon real via rede: login + upload/processamento de 2 fotos passa de 20s neste ambiente.

  it('rejeita com 400 (e não 500) uma imagem acima do limite de pixels', async () => {
    const tipo = await criarTipo();
    const { accessToken } = await loginComoAssessor('ASSESSOR_RUA', '+5534999998012');
    const foto1 = await fotoValida();
    // ~52 MP em poucas centenas de KB: acima do teto de 50 MP do processamento de fotos.
    const bomba = await sharp({
      create: { width: 8000, height: 6500, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg({ quality: 40 })
      .toBuffer();

    const res = await request(app)
      .post('/demandas')
      .set('Authorization', `Bearer ${accessToken}`)
      .field(camposBase(tipo.id))
      .attach('fotos', foto1, 'foto1.jpg')
      .attach('fotos', bomba, 'bomba.jpg');

    expect(res.status).toBe(400);
    expect(await testPrisma.request.count()).toBe(0);
  }, 30000); // Neon real via rede: login + geração/processamento de imagem grande passa de 20s neste ambiente.

  it('exige autenticação', async () => {
    const res = await request(app).post('/demandas').field({ tituloResumido: 'x' });
    expect(res.status).toBe(401);
  }, 30000); // Neon real via rede: variação de latência ocasional neste ambiente.
});

describe('GET /demandas e GET /demandas/:id', () => {
  it('assessor de rua só lista e acessa as próprias demandas', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenEu } = await loginComoAssessor('ASSESSOR_RUA', '+5534999998001');
    const { accessToken: tokenOutro } = await loginComoAssessor('ASSESSOR_RUA', '+5534999998002');
    const foto1 = await fotoValida();
    const foto2 = await fotoValida();

    const minha = await request(app)
      .post('/demandas')
      .set('Authorization', `Bearer ${tokenEu}`)
      .field(camposBase(tipo.id))
      .attach('fotos', foto1, 'a.jpg')
      .attach('fotos', foto2, 'b.jpg');

    await request(app)
      .post('/demandas')
      .set('Authorization', `Bearer ${tokenOutro}`)
      .field(camposBase(tipo.id))
      .attach('fotos', foto1, 'a.jpg')
      .attach('fotos', foto2, 'b.jpg');

    const lista = await request(app).get('/demandas').set('Authorization', `Bearer ${tokenEu}`);
    expect(lista.body.data.items).toHaveLength(1);
    expect(lista.body.data.total).toBe(1);

    const detalheProprio = await request(app).get(`/demandas/${minha.body.data.id}`).set('Authorization', `Bearer ${tokenEu}`);
    expect(detalheProprio.status).toBe(200);

    const detalheDeOutro = await request(app).get(`/demandas/${minha.body.data.id}`).set('Authorization', `Bearer ${tokenOutro}`);
    expect(detalheDeOutro.status).toBe(403);
  }, 30000); // Neon real via rede: 2 logins + 2 uploads/processamentos de foto passa de 20s neste ambiente.

  it('gabinete lista e acessa qualquer demanda', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999998003');
    const { accessToken: tokenGabinete } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999998004');
    const foto1 = await fotoValida();
    const foto2 = await fotoValida();

    const criada = await request(app)
      .post('/demandas')
      .set('Authorization', `Bearer ${tokenRua}`)
      .field(camposBase(tipo.id))
      .attach('fotos', foto1, 'a.jpg')
      .attach('fotos', foto2, 'b.jpg');

    const lista = await request(app).get('/demandas').set('Authorization', `Bearer ${tokenGabinete}`);
    expect(lista.body.data.items).toHaveLength(1);

    const detalhe = await request(app).get(`/demandas/${criada.body.data.id}`).set('Authorization', `Bearer ${tokenGabinete}`);
    expect(detalhe.status).toBe(200);
  }, 30000); // Neon real via rede: 2 logins + upload/processamento de foto passa de 20s neste ambiente.
});

describe('PATCH /demandas/:id', () => {
  it('assessor de rua edita a própria demanda antes de protocolada', async () => {
    const tipo = await criarTipo();
    const { accessToken } = await loginComoAssessor();
    const foto1 = await fotoValida();
    const foto2 = await fotoValida();

    const criada = await request(app)
      .post('/demandas')
      .set('Authorization', `Bearer ${accessToken}`)
      .field(camposBase(tipo.id))
      .attach('fotos', foto1, 'a.jpg')
      .attach('fotos', foto2, 'b.jpg');

    const editada = await request(app)
      .patch(`/demandas/${criada.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ tituloResumido: 'Título corrigido' });

    expect(editada.status).toBe(200);
    expect(editada.body.data.tituloResumido).toBe('Título corrigido');
  }, 30000); // Neon real via rede: login + upload/processamento de 2 fotos passa de 20s neste ambiente.

  it('retorna 400 quando o id não é um uuid válido', async () => {
    const { accessToken } = await loginComoAssessor();
    const res = await request(app)
      .patch('/demandas/not-a-uuid')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ tituloResumido: 'x' });
    expect(res.status).toBe(400);
  }, 30000); // Neon real via rede: login passa de 20s neste ambiente.

  it('retorna 400 ao editar para um requestTypeId inexistente', async () => {
    const tipo = await criarTipo();
    const { accessToken } = await loginComoAssessor();
    const foto1 = await fotoValida();
    const foto2 = await fotoValida();

    const criada = await request(app)
      .post('/demandas')
      .set('Authorization', `Bearer ${accessToken}`)
      .field(camposBase(tipo.id))
      .attach('fotos', foto1, 'a.jpg')
      .attach('fotos', foto2, 'b.jpg');

    const editada = await request(app)
      .patch(`/demandas/${criada.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ requestTypeId: '00000000-0000-0000-0000-000000000000' });

    expect(editada.status).toBe(400);
  }, 30000); // Neon real via rede: login + upload/processamento de 2 fotos passa de 20s neste ambiente.
});

async function criarDemandaViaApi(tipoId: string, accessToken: string) {
  const foto1 = await fotoValida();
  const foto2 = await fotoValida();
  const res = await request(app)
    .post('/demandas')
    .set('Authorization', `Bearer ${accessToken}`)
    .field(camposBase(tipoId))
    .attach('fotos', foto1, 'foto1.jpg')
    .attach('fotos', foto2, 'foto2.jpg');
  return res.body.data as { id: string };
}

describe('PATCH /demandas/:id/status', () => {
  it('avança o status quando gabinete faz uma transição válida', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999998001');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);
    const { accessToken: tokenGabinete } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999998002');

    const res = await request(app)
      .patch(`/demandas/${demanda.id}/status`)
      .set('Authorization', `Bearer ${tokenGabinete}`)
      .send({ novoStatus: 'RECEBIDA' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('RECEBIDA');
  }, 30000); // Neon real via rede.

  it('rejeita uma transição inválida com 400', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999998003');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);
    const { accessToken: tokenGabinete } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999998004');

    const res = await request(app)
      .patch(`/demandas/${demanda.id}/status`)
      .set('Authorization', `Bearer ${tokenGabinete}`)
      .send({ novoStatus: 'PROTOCOLADA' });

    expect(res.status).toBe(400);
  }, 30000); // Neon real via rede.

  it('rejeita PENDENTE_INFORMACAO sem motivo com 400', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999998005');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);
    const { accessToken: tokenGabinete } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999998006');
    await request(app).patch(`/demandas/${demanda.id}/status`).set('Authorization', `Bearer ${tokenGabinete}`).send({ novoStatus: 'RECEBIDA' });
    await request(app).patch(`/demandas/${demanda.id}/status`).set('Authorization', `Bearer ${tokenGabinete}`).send({ novoStatus: 'EM_CONFERENCIA' });

    const res = await request(app)
      .patch(`/demandas/${demanda.id}/status`)
      .set('Authorization', `Bearer ${tokenGabinete}`)
      .send({ novoStatus: 'PENDENTE_INFORMACAO' });

    expect(res.status).toBe(400);
  }, 30000); // Neon real via rede.

  it('bloqueia assessor de rua com 403', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999998007');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);

    const res = await request(app)
      .patch(`/demandas/${demanda.id}/status`)
      .set('Authorization', `Bearer ${tokenRua}`)
      .send({ novoStatus: 'RECEBIDA' });

    expect(res.status).toBe(403);
  }, 30000); // Neon real via rede.
});

describe('GET /demandas/:id/historico-status', () => {
  it('assessor de rua vê o histórico da própria demanda', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999998008');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);
    const { accessToken: tokenGabinete } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999998009');
    await request(app).patch(`/demandas/${demanda.id}/status`).set('Authorization', `Bearer ${tokenGabinete}`).send({ novoStatus: 'RECEBIDA' });

    const res = await request(app).get(`/demandas/${demanda.id}/historico-status`).set('Authorization', `Bearer ${tokenRua}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  }, 30000); // Neon real via rede.

  it('bloqueia assessor de rua vendo histórico de demanda de outro com 403', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenDono } = await loginComoAssessor('ASSESSOR_RUA', '+5534999998010');
    const demanda = await criarDemandaViaApi(tipo.id, tokenDono);
    const { accessToken: tokenOutro } = await loginComoAssessor('ASSESSOR_RUA', '+5534999998011');

    const res = await request(app).get(`/demandas/${demanda.id}/historico-status`).set('Authorization', `Bearer ${tokenOutro}`);

    expect(res.status).toBe(403);
  }, 30000); // Neon real via rede.
});

describe('PATCH /demandas/:id/reatribuir', () => {
  it('chefe reatribui a demanda para outro assessor', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999998012');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);
    const { accessToken: tokenChefe } = await loginComoAssessor('CHEFE', '+5534999998013');
    const { assessor: novoAssessor } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999998014');

    const res = await request(app)
      .patch(`/demandas/${demanda.id}/reatribuir`)
      .set('Authorization', `Bearer ${tokenChefe}`)
      .send({ novoAssessorId: novoAssessor.id });

    expect(res.status).toBe(200);
    expect(res.body.data.assessorResponsavelId).toBe(novoAssessor.id);
  }, 30000); // Neon real via rede.

  it('bloqueia assessor de gabinete tentando reatribuir com 403', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999998015');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);
    const { accessToken: tokenGabinete, assessor } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999998016');

    const res = await request(app)
      .patch(`/demandas/${demanda.id}/reatribuir`)
      .set('Authorization', `Bearer ${tokenGabinete}`)
      .send({ novoAssessorId: assessor.id });

    expect(res.status).toBe(403);
  }, 30000); // Neon real via rede.

  it('rejeita reatribuir para um id inexistente com 400', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999998017');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);
    const { accessToken: tokenChefe } = await loginComoAssessor('CHEFE', '+5534999998018');

    const res = await request(app)
      .patch(`/demandas/${demanda.id}/reatribuir`)
      .set('Authorization', `Bearer ${tokenChefe}`)
      .send({ novoAssessorId: '11111111-1111-1111-1111-111111111111' });

    expect(res.status).toBe(400);
  }, 30000); // Neon real via rede.
});
