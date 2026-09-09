# Fase 2 — Demandas + Fotos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assessores cadastram demandas (com 2–4 fotos) pelo celular ou computador; ficam salvas no Postgres com as fotos no Cloudinary; a lista, o detalhe e a edição (antes de protocolada) já funcionam com permissão por papel.

**Architecture:** Mesmo padrão da Fase 1 — repository → service → controller → route no backend, com repositórios injetáveis (fakes nos testes unitários) e integração real contra o Neon nos testes de integração. Upload de fotos é mediado pelo backend: valida o arquivo de verdade (decodificando com `sharp`, não só checando extensão), remove EXIF ao reprocessar, e só então envia ao Cloudinary via um `PhotoUploader` injetável (fake nos testes, real via SDK do Cloudinary). CEP é resolvido direto no navegador contra o ViaCEP.

**Tech Stack:** Express, TypeScript, Prisma, `sharp` (validação/reprocessamento de imagem), `cloudinary` (SDK oficial), `multer` (multipart no Express); Next.js, React, Tailwind (mesmos componentes/tokens da Fase 1).

## Global Constraints

- `ASSESSOR_RUA`, `ASSESSOR_GABINETE` e `CHEFE` podem criar demandas.
- `ASSESSOR_RUA` só lista/visualiza/edita as demandas que ele mesmo criou.
- `ASSESSOR_GABINETE` e `CHEFE` listam/visualizam/editam todas as demandas, em qualquer status.
- `ASSESSOR_RUA` só edita enquanto a demanda ainda não foi protocolada; depois disso, 403.
- Nenhum papel exclui demandas nesta fase.
- Toda demanda nasce com status `ENVIADA` (não existe rascunho manual nesta fase).
- De 2 a 4 fotos são obrigatórias e fazem parte da MESMA chamada atômica de criação — não existe um segundo passo de "anexar fotos depois".
- Fotos: só JPG/PNG/WebP (validado decodificando o arquivo, não pela extensão), sem limite artificial de tamanho de entrada além do payload HTTP, redimensionadas para no máximo 2000px no maior lado, metadados EXIF removidos antes do envio ao Cloudinary.
- Postgres armazena apenas `url`, `publicId` e metadados da foto — nunca a imagem em si, nunca base64.
- Quando o tipo de demanda selecionado for "Outros" (`exigeDescricaoObrigatoria = true`), a descrição do assunto é obrigatória.
- Listagem sempre paginada no servidor — nunca carregar tudo de uma vez.
- Interface 100% em português do Brasil; sem Bootstrap. Rosa (`secondary`) é a cor de ação principal nas telas de demanda; azul (`primary`) fica para elementos informativos — tokens já existentes no `tailwind.config.ts` da Fase 1, nenhuma cor nova.
- Front-end não acessa o banco diretamente — só fala com a API REST via `NEXT_PUBLIC_API_URL`. Consulta de CEP é exceção: vai direto do navegador ao ViaCEP.

---

## Task 1: Utilitário de código interno

**Files:**
- Create: `backend/src/utils/codigo-interno.ts`
- Test: `backend/tests/unit/codigo-interno.test.ts`

**Interfaces:**
- Produces: `gerarCodigoInterno(): string` — formato `GD-YYYYMMDD-XXXX` (data UTC do servidor, `XXXX` = 4 caracteres hexadecimais maiúsculos aleatórios).

- [ ] **Step 1: Escrever o teste**

```ts
import { describe, it, expect } from 'vitest';
import { gerarCodigoInterno } from '../../src/utils/codigo-interno.js';

describe('gerarCodigoInterno', () => {
  it('segue o formato GD-YYYYMMDD-XXXX', () => {
    const codigo = gerarCodigoInterno();
    expect(codigo).toMatch(/^GD-\d{8}-[0-9A-F]{4}$/);
  });

  it('gera códigos diferentes em chamadas sucessivas', () => {
    const codigos = new Set(Array.from({ length: 20 }, () => gerarCodigoInterno()));
    expect(codigos.size).toBe(20);
  });

  it('usa a data atual no formato YYYYMMDD', () => {
    const codigo = gerarCodigoInterno();
    const hoje = new Date();
    const esperado = `${hoje.getUTCFullYear()}${String(hoje.getUTCMonth() + 1).padStart(2, '0')}${String(hoje.getUTCDate()).padStart(2, '0')}`;
    expect(codigo).toContain(`GD-${esperado}-`);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/unit/codigo-interno.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `backend/src/utils/codigo-interno.ts`**

```ts
import { randomBytes } from 'node:crypto';

export function gerarCodigoInterno(): string {
  const agora = new Date();
  const ano = agora.getUTCFullYear();
  const mes = String(agora.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(agora.getUTCDate()).padStart(2, '0');
  const sufixo = randomBytes(4).toString('hex').slice(0, 4).toUpperCase();
  return `GD-${ano}${mes}${dia}-${sufixo}`;
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/unit/codigo-interno.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/codigo-interno.ts backend/tests/unit/codigo-interno.test.ts
git commit -m "feat(backend): gerador de codigo interno da demanda"
```

---

## Task 2: Status da demanda — constantes compartilhadas

**Files:**
- Create: `backend/src/utils/request-status.ts`
- Test: `backend/tests/unit/request-status.test.ts`

**Interfaces:**
- Produces: `type RequestStatusValue = 'RASCUNHO'|'ENVIADA'|'RECEBIDA'|'EM_CONFERENCIA'|'PENDENTE_INFORMACAO'|'PROTOCOLADA'|'EM_ANDAMENTO'|'CONCLUIDA'|'ARQUIVADA'|'RECUSADA'`; `STATUS_ANTES_DE_PROTOCOLAR: readonly RequestStatusValue[]`; `podeEditarComoAssessorDeRua(status: RequestStatusValue): boolean`.

- [ ] **Step 1: Escrever o teste**

```ts
import { describe, it, expect } from 'vitest';
import { STATUS_ANTES_DE_PROTOCOLAR, podeEditarComoAssessorDeRua } from '../../src/utils/request-status.js';

describe('podeEditarComoAssessorDeRua', () => {
  it('permite editar quando o status ainda está antes de protocolada', () => {
    for (const status of STATUS_ANTES_DE_PROTOCOLAR) {
      expect(podeEditarComoAssessorDeRua(status)).toBe(true);
    }
  });

  it('bloqueia a partir de PROTOCOLADA', () => {
    expect(podeEditarComoAssessorDeRua('PROTOCOLADA')).toBe(false);
    expect(podeEditarComoAssessorDeRua('EM_ANDAMENTO')).toBe(false);
    expect(podeEditarComoAssessorDeRua('CONCLUIDA')).toBe(false);
    expect(podeEditarComoAssessorDeRua('ARQUIVADA')).toBe(false);
    expect(podeEditarComoAssessorDeRua('RECUSADA')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/unit/request-status.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `backend/src/utils/request-status.ts`**

```ts
export type RequestStatusValue =
  | 'RASCUNHO'
  | 'ENVIADA'
  | 'RECEBIDA'
  | 'EM_CONFERENCIA'
  | 'PENDENTE_INFORMACAO'
  | 'PROTOCOLADA'
  | 'EM_ANDAMENTO'
  | 'CONCLUIDA'
  | 'ARQUIVADA'
  | 'RECUSADA';

export const STATUS_ANTES_DE_PROTOCOLAR: readonly RequestStatusValue[] = [
  'RASCUNHO',
  'ENVIADA',
  'RECEBIDA',
  'EM_CONFERENCIA',
  'PENDENTE_INFORMACAO',
];

export function podeEditarComoAssessorDeRua(status: RequestStatusValue): boolean {
  return (STATUS_ANTES_DE_PROTOCOLAR as RequestStatusValue[]).includes(status);
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/unit/request-status.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/request-status.ts backend/tests/unit/request-status.test.ts
git commit -m "feat(backend): status da demanda e regra de edicao do assessor de rua"
```

---

## Task 3: Processamento de fotos — validação real + remoção de EXIF

**Files:**
- Create: `backend/src/services/photo-processing.service.ts`
- Test: `backend/tests/unit/photo-processing.test.ts`

**Interfaces:**
- Produces:
```ts
export interface FotoProcessada {
  buffer: Buffer;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  larguraPx: number;
  alturaPx: number;
  bytes: number;
}

export type ProcessarFotoResultado =
  | { status: 'ok'; foto: FotoProcessada }
  | { status: 'tipo_invalido' };

export async function processarFoto(buffer: Buffer): Promise<ProcessarFotoResultado>;
```

- [ ] **Step 1: Instalar o `sharp`**

Run: `cd backend && npm install sharp`

- [ ] **Step 2: Escrever o teste**

```ts
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { processarFoto } from '../../src/services/photo-processing.service.js';

async function criarJpegDeTeste(largura: number, altura: number): Promise<Buffer> {
  return sharp({
    create: { width: largura, height: altura, channels: 3, background: { r: 200, g: 50, b: 50 } },
  })
    .jpeg()
    .withExif({ IFD0: { Make: 'TesteCamera' } })
    .toBuffer();
}

describe('processarFoto', () => {
  it('aceita um JPEG válido e remove metadados EXIF', async () => {
    const original = await criarJpegDeTeste(100, 80);
    const originalMeta = await sharp(original).metadata();
    expect(originalMeta.exif).toBeDefined();

    const resultado = await processarFoto(original);
    expect(resultado.status).toBe('ok');
    if (resultado.status === 'ok') {
      expect(resultado.foto.contentType).toBe('image/jpeg');
      expect(resultado.foto.larguraPx).toBe(100);
      expect(resultado.foto.alturaPx).toBe(80);

      const metaProcessada = await sharp(resultado.foto.buffer).metadata();
      expect(metaProcessada.exif).toBeUndefined();
    }
  });

  it('aceita PNG e detecta o content-type correto', async () => {
    const pngBuffer = await sharp({
      create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();

    const resultado = await processarFoto(pngBuffer);
    expect(resultado.status).toBe('ok');
    if (resultado.status === 'ok') {
      expect(resultado.foto.contentType).toBe('image/png');
    }
  });

  it('redimensiona uma imagem maior que 2000px no maior lado', async () => {
    const grande = await criarJpegDeTeste(3000, 1500);
    const resultado = await processarFoto(grande);
    expect(resultado.status).toBe('ok');
    if (resultado.status === 'ok') {
      expect(resultado.foto.larguraPx).toBeLessThanOrEqual(2000);
      expect(resultado.foto.alturaPx).toBeLessThanOrEqual(2000);
    }
  });

  it('não amplia uma imagem menor que 2000px', async () => {
    const pequena = await criarJpegDeTeste(100, 80);
    const resultado = await processarFoto(pequena);
    expect(resultado.status).toBe('ok');
    if (resultado.status === 'ok') {
      expect(resultado.foto.larguraPx).toBe(100);
      expect(resultado.foto.alturaPx).toBe(80);
    }
  });

  it('rejeita um arquivo que não é uma imagem', async () => {
    const naoImagem = Buffer.from('isto nao e uma imagem, e so texto mesmo');
    const resultado = await processarFoto(naoImagem);
    expect(resultado.status).toBe('tipo_invalido');
  });

  it('rejeita formatos de imagem não autorizados (ex: GIF)', async () => {
    const gifBuffer = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 1, g: 1, b: 1 } },
    })
      .gif()
      .toBuffer();

    const resultado = await processarFoto(gifBuffer);
    expect(resultado.status).toBe('tipo_invalido');
  });
});
```

- [ ] **Step 3: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/unit/photo-processing.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 4: Implementar `backend/src/services/photo-processing.service.ts`**

```ts
import sharp from 'sharp';

export interface FotoProcessada {
  buffer: Buffer;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  larguraPx: number;
  alturaPx: number;
  bytes: number;
}

export type ProcessarFotoResultado =
  | { status: 'ok'; foto: FotoProcessada }
  | { status: 'tipo_invalido' };

const TAMANHO_MAXIMO_PX = 2000;
const FORMATOS_AUTORIZADOS = new Set(['jpeg', 'png', 'webp']);

export async function processarFoto(buffer: Buffer): Promise<ProcessarFotoResultado> {
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    return { status: 'tipo_invalido' };
  }

  if (!metadata.format || !FORMATOS_AUTORIZADOS.has(metadata.format)) {
    return { status: 'tipo_invalido' };
  }

  const redimensionada = sharp(buffer).rotate().resize({
    width: TAMANHO_MAXIMO_PX,
    height: TAMANHO_MAXIMO_PX,
    fit: 'inside',
    withoutEnlargement: true,
  });

  let contentType: FotoProcessada['contentType'];
  let bufferFinal: Buffer;

  if (metadata.format === 'jpeg') {
    contentType = 'image/jpeg';
    bufferFinal = await redimensionada.jpeg({ quality: 85 }).toBuffer();
  } else if (metadata.format === 'png') {
    contentType = 'image/png';
    bufferFinal = await redimensionada.png().toBuffer();
  } else {
    contentType = 'image/webp';
    bufferFinal = await redimensionada.webp({ quality: 85 }).toBuffer();
  }

  const metadataFinal = await sharp(bufferFinal).metadata();

  return {
    status: 'ok',
    foto: {
      buffer: bufferFinal,
      contentType,
      larguraPx: metadataFinal.width ?? 0,
      alturaPx: metadataFinal.height ?? 0,
      bytes: bufferFinal.length,
    },
  };
}
```

Nota: `.rotate()` sem argumentos aplica a orientação EXIF (se houver) fisicamente na imagem antes de descartar os metadados — assim uma foto tirada com o celular de lado continua aparecendo na orientação certa mesmo depois do EXIF ser removido. Nenhum dos três métodos de saída (`.jpeg()/.png()/.webp()`) chama `.withMetadata()`, então o `sharp` não copia EXIF/ICC para o arquivo final — é assim que a remoção acontece.

- [ ] **Step 5: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/unit/photo-processing.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/services/photo-processing.service.ts backend/tests/unit/photo-processing.test.ts
git commit -m "feat(backend): validacao real de foto e remocao de EXIF com sharp"
```

---

## Task 4: Uploader de fotos (Cloudinary) — interface injetável

**Files:**
- Create: `backend/src/services/cloudinary-uploader.service.ts`
- Test: `backend/tests/unit/cloudinary-uploader.test.ts`
- Modify: `backend/tests/helpers/fakes.ts`

**Interfaces:**
- Produces:
```ts
export interface FotoEnviada { url: string; publicId: string }

export interface PhotoUploader {
  upload(input: { buffer: Buffer; contentType: string; folder: string }): Promise<FotoEnviada>;
}

export function createCloudinaryUploader(config: {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}): PhotoUploader;
```
- Adds to `backend/tests/helpers/fakes.ts`: `createFakePhotoUploader(): PhotoUploader & { uploads: { buffer: Buffer; contentType: string; folder: string }[] }`.

**Nota sobre credenciais:** este projeto ainda não tem uma conta Cloudinary configurada
(`CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET` vazias no `.env`
atual). A implementação real (`createCloudinaryUploader`) é escrita e type-checada
normalmente, mas só pode ser exercitada de fato (upload real) quando essas credenciais
existirem — isso não bloqueia nenhuma tarefa desta fase, porque toda a aplicação (rotas,
serviços, testes de integração) usa a interface `PhotoUploader` injetada, e os testes
usam `createFakePhotoUploader()`, nunca o Cloudinary real.

- [ ] **Step 1: Instalar o SDK do Cloudinary**

Run: `cd backend && npm install cloudinary`

- [ ] **Step 2: Escrever o teste unitário (com um servidor HTTP falso, sem bater no Cloudinary real)**

```ts
import { describe, it, expect, vi } from 'vitest';
import { createCloudinaryUploader } from '../../src/services/cloudinary-uploader.service.js';

vi.mock('cloudinary', () => {
  const uploadStream = vi.fn((_options: unknown, callback: (error: unknown, result: unknown) => void) => {
    const { PassThrough } = require('node:stream');
    const stream = new PassThrough();
    stream.on('end', () => {
      callback(null, { secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/pasta/abc123.jpg', public_id: 'pasta/abc123' });
    });
    stream.resume();
    return stream;
  });

  return {
    v2: {
      config: vi.fn(),
      uploader: { upload_stream: uploadStream },
    },
  };
});

describe('createCloudinaryUploader', () => {
  it('resolve com a url segura e o publicId retornados pelo Cloudinary', async () => {
    const uploader = createCloudinaryUploader({ cloudName: 'demo', apiKey: 'key', apiSecret: 'secret' });
    const resultado = await uploader.upload({
      buffer: Buffer.from('conteudo-fake-da-imagem'),
      contentType: 'image/jpeg',
      folder: 'demandas',
    });

    expect(resultado.url).toBe('https://res.cloudinary.com/demo/image/upload/v1/pasta/abc123.jpg');
    expect(resultado.publicId).toBe('pasta/abc123');
  });
});
```

- [ ] **Step 3: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/unit/cloudinary-uploader.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 4: Implementar `backend/src/services/cloudinary-uploader.service.ts`**

```ts
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'node:stream';

export interface FotoEnviada {
  url: string;
  publicId: string;
}

export interface PhotoUploader {
  upload(input: { buffer: Buffer; contentType: string; folder: string }): Promise<FotoEnviada>;
}

export function createCloudinaryUploader(config: {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}): PhotoUploader {
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
    secure: true,
  });

  return {
    upload({ buffer, folder }) {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder, resource_type: 'image' },
          (error, result) => {
            if (error || !result) {
              reject(error ?? new Error('Falha ao enviar imagem ao Cloudinary'));
              return;
            }
            resolve({ url: result.secure_url, publicId: result.public_id });
          },
        );
        Readable.from(buffer).pipe(stream);
      });
    },
  };
}
```

- [ ] **Step 5: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/unit/cloudinary-uploader.test.ts`
Expected: PASS (1 teste).

- [ ] **Step 6: Adicionar `createFakePhotoUploader` em `backend/tests/helpers/fakes.ts`**

Adicionar ao final do arquivo (não remover nada que já existe):

```ts
import type { PhotoUploader, FotoEnviada } from '../../src/services/cloudinary-uploader.service.js';

export function createFakePhotoUploader(): PhotoUploader & {
  uploads: { buffer: Buffer; contentType: string; folder: string }[];
} {
  const uploads: { buffer: Buffer; contentType: string; folder: string }[] = [];
  let contador = 0;
  return {
    uploads,
    async upload(input) {
      uploads.push(input);
      contador += 1;
      const resultado: FotoEnviada = {
        url: `https://res.cloudinary.com/fake/image/upload/v1/${input.folder}/fake-${contador}.jpg`,
        publicId: `${input.folder}/fake-${contador}`,
      };
      return resultado;
    },
  };
}
```

- [ ] **Step 7: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/services/cloudinary-uploader.service.ts backend/tests/unit/cloudinary-uploader.test.ts backend/tests/helpers/fakes.ts
git commit -m "feat(backend): uploader de fotos injetavel com implementacao Cloudinary"
```

---

## Task 5: RequestType — repositório e rota de listagem

**Files:**
- Create: `backend/src/repositories/request-type.repository.ts`
- Create: `backend/src/controllers/request-type.controller.ts`
- Create: `backend/src/routes/request-type.routes.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/integration/request-type.routes.test.ts`

**Interfaces:**
- Produces:
```ts
export interface RequestTypeSummary {
  id: string;
  nome: string;
  exigeDescricaoObrigatoria: boolean;
}

export interface RequestTypeRepository {
  listActive(): Promise<RequestTypeSummary[]>;
  findById(id: string): Promise<(RequestTypeSummary & { ativo: boolean }) | null>;
}

export function createRequestTypeRepository(prisma: PrismaClient): RequestTypeRepository;
```
- Rota: `GET /tipos-demanda` (autenticada, qualquer papel) → `200 { success: true, data: RequestTypeSummary[] }`, ordenado por nome.

- [ ] **Step 1: Implementar `backend/src/repositories/request-type.repository.ts`**

```ts
import type { PrismaClient } from '@prisma/client';

export interface RequestTypeSummary {
  id: string;
  nome: string;
  exigeDescricaoObrigatoria: boolean;
}

export interface RequestTypeRepository {
  listActive(): Promise<RequestTypeSummary[]>;
  findById(id: string): Promise<(RequestTypeSummary & { ativo: boolean }) | null>;
}

export function createRequestTypeRepository(prisma: PrismaClient): RequestTypeRepository {
  return {
    async listActive() {
      const tipos = await prisma.requestType.findMany({
        where: { ativo: true },
        orderBy: { nome: 'asc' },
        select: { id: true, nome: true, exigeDescricaoObrigatoria: true },
      });
      return tipos;
    },
    async findById(id) {
      const tipo = await prisma.requestType.findUnique({
        where: { id },
        select: { id: true, nome: true, exigeDescricaoObrigatoria: true, ativo: true },
      });
      return tipo;
    },
  };
}
```

- [ ] **Step 2: Implementar `backend/src/controllers/request-type.controller.ts`**

```ts
import type { Request, Response } from 'express';
import type { RequestTypeRepository } from '../repositories/request-type.repository.js';

export function createRequestTypeController(repo: RequestTypeRepository) {
  return {
    async listar(_req: Request, res: Response) {
      const tipos = await repo.listActive();
      res.json({ success: true, data: tipos });
    },
  };
}
```

- [ ] **Step 3: Implementar `backend/src/routes/request-type.routes.ts`**

```ts
import { Router } from 'express';
import type { RequestTypeRepository } from '../repositories/request-type.repository.js';
import type { UserRepository } from '../repositories/user.repository.js';
import { createRequestTypeController } from '../controllers/request-type.controller.js';
import { authenticate } from '../middlewares/authenticate.js';

function asyncHandler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next);
}

export function createRequestTypeRouter(deps: {
  requestTypeRepo: RequestTypeRepository;
  userRepo: UserRepository;
}): Router {
  const router = Router();
  const controller = createRequestTypeController(deps.requestTypeRepo);
  const auth = authenticate({ userRepo: deps.userRepo });

  router.get('/', auth, asyncHandler(controller.listar));

  return router;
}
```

- [ ] **Step 4: Atualizar `backend/src/app.ts`**

Adicionar o import junto aos outros:

```ts
import { createRequestTypeRepository } from './repositories/request-type.repository.js';
import { createRequestTypeRouter } from './routes/request-type.routes.js';
```

Adicionar, junto às outras criações de repositório (perto de `createAuditLogRepository(prisma)`):

```ts
  const requestTypeRepo = createRequestTypeRepository(prisma);
```

Adicionar, junto às outras montagens de rota (perto de `app.use('/usuarios', ...)`):

```ts
  app.use('/tipos-demanda', createRequestTypeRouter({ requestTypeRepo, userRepo }));
```

- [ ] **Step 5: Escrever `backend/tests/integration/request-type.routes.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { buildTestApp } from '../helpers/build-test-app.js';
import { testPrisma, resetDb } from '../helpers/reset-db.js';

const app = buildTestApp();

beforeEach(async () => {
  await resetDb();
  await testPrisma.requestType.deleteMany();
});

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
  });

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
  });
});
```

- [ ] **Step 6: Rodar os testes**

Run: `cd backend && npx vitest run tests/integration/request-type.routes.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 7: Commit**

```bash
git add backend/src/repositories/request-type.repository.ts backend/src/controllers/request-type.controller.ts backend/src/routes/request-type.routes.ts backend/src/app.ts backend/tests/integration/request-type.routes.test.ts
git commit -m "feat(backend): rota GET /tipos-demanda"
```

---

## Task 6: Repositório de demandas (criação transacional, busca, listagem paginada, edição)

**Files:**
- Create: `backend/src/repositories/request.repository.ts`
- Test: `backend/tests/integration/request.repository.test.ts`

**Interfaces:**
- Consumes: `RequestStatusValue` (Task 2).
- Produces:
```ts
export interface CriarRequestInput {
  codigoInterno: string;
  solicitanteNome: string;
  solicitanteTelefone: string;
  solicitanteNascimento?: Date;
  cep?: string;
  rua?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  pontoReferencia?: string;
  localExato?: string;
  tituloResumido: string;
  descricao: string;
  descricaoOutroAssunto?: string;
  requestTypeId: string;
  assessorResponsavelId: string;
  autorizacaoDados: boolean;
}

export interface FotoParaSalvar {
  url: string;
  publicId: string;
  larguraPx: number;
  alturaPx: number;
  bytes: number;
}

export interface RequestSummary {
  id: string;
  codigoInterno: string;
  tituloResumido: string;
  solicitanteNome: string;
  bairro: string | null;
  status: RequestStatusValue;
  assessorResponsavelId: string;
  assessorResponsavelNome: string;
  requestTypeId: string;
  requestTypeNome: string;
  numeroProtocolo: string | null;
  createdAt: Date;
}

export interface RequestDetail extends RequestSummary {
  solicitanteTelefone: string;
  solicitanteNascimento: Date | null;
  cep: string | null;
  rua: string | null;
  numero: string | null;
  complemento: string | null;
  cidade: string | null;
  estado: string | null;
  pontoReferencia: string | null;
  localExato: string | null;
  descricao: string;
  descricaoOutroAssunto: string | null;
  autorizacaoDados: boolean;
  updatedAt: Date;
  fotos: { id: string; url: string; larguraPx: number | null; alturaPx: number | null }[];
}

export interface ListarFiltro {
  codigoInterno?: string;
  solicitanteNome?: string;
  solicitanteTelefone?: string;
  requestTypeId?: string;
  bairro?: string;
  assessorResponsavelId?: string;
  status?: RequestStatusValue;
  dataInicial?: Date;
  dataFinal?: Date;
  numeroProtocolo?: string;
}

export interface Paginacao {
  pagina: number;
  tamanhoPagina: number;
}

export type EditarRequestInput = Partial<Omit<CriarRequestInput, 'codigoInterno' | 'assessorResponsavelId' | 'autorizacaoDados'>>;

export interface RequestRepository {
  create(input: CriarRequestInput, fotos: FotoParaSalvar[]): Promise<RequestDetail>;
  findById(id: string): Promise<RequestDetail | null>;
  list(filtro: ListarFiltro, paginacao: Paginacao): Promise<{ items: RequestSummary[]; total: number }>;
  update(id: string, input: EditarRequestInput): Promise<RequestDetail>;
}

export function createRequestRepository(prisma: PrismaClient): RequestRepository;
```

- [ ] **Step 1: Implementar `backend/src/repositories/request.repository.ts`**

```ts
import type { Prisma, PrismaClient } from '@prisma/client';
import type { RequestStatusValue } from '../utils/request-status.js';

export interface CriarRequestInput {
  codigoInterno: string;
  solicitanteNome: string;
  solicitanteTelefone: string;
  solicitanteNascimento?: Date;
  cep?: string;
  rua?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  pontoReferencia?: string;
  localExato?: string;
  tituloResumido: string;
  descricao: string;
  descricaoOutroAssunto?: string;
  requestTypeId: string;
  assessorResponsavelId: string;
  autorizacaoDados: boolean;
}

export interface FotoParaSalvar {
  url: string;
  publicId: string;
  larguraPx: number;
  alturaPx: number;
  bytes: number;
}

export interface RequestSummary {
  id: string;
  codigoInterno: string;
  tituloResumido: string;
  solicitanteNome: string;
  bairro: string | null;
  status: RequestStatusValue;
  assessorResponsavelId: string;
  assessorResponsavelNome: string;
  requestTypeId: string;
  requestTypeNome: string;
  numeroProtocolo: string | null;
  createdAt: Date;
}

export interface RequestDetail extends RequestSummary {
  solicitanteTelefone: string;
  solicitanteNascimento: Date | null;
  cep: string | null;
  rua: string | null;
  numero: string | null;
  complemento: string | null;
  cidade: string | null;
  estado: string | null;
  pontoReferencia: string | null;
  localExato: string | null;
  descricao: string;
  descricaoOutroAssunto: string | null;
  autorizacaoDados: boolean;
  updatedAt: Date;
  fotos: { id: string; url: string; larguraPx: number | null; alturaPx: number | null }[];
}

export interface ListarFiltro {
  codigoInterno?: string;
  solicitanteNome?: string;
  solicitanteTelefone?: string;
  requestTypeId?: string;
  bairro?: string;
  assessorResponsavelId?: string;
  status?: RequestStatusValue;
  dataInicial?: Date;
  dataFinal?: Date;
  numeroProtocolo?: string;
}

export interface Paginacao {
  pagina: number;
  tamanhoPagina: number;
}

export type EditarRequestInput = Partial<
  Omit<CriarRequestInput, 'codigoInterno' | 'assessorResponsavelId' | 'autorizacaoDados'>
>;

export interface RequestRepository {
  create(input: CriarRequestInput, fotos: FotoParaSalvar[]): Promise<RequestDetail>;
  findById(id: string): Promise<RequestDetail | null>;
  list(filtro: ListarFiltro, paginacao: Paginacao): Promise<{ items: RequestSummary[]; total: number }>;
  update(id: string, input: EditarRequestInput): Promise<RequestDetail>;
}

const INCLUDE_DETALHE = {
  fotos: { select: { id: true, url: true, larguraPx: true, alturaPx: true } },
  requestType: { select: { nome: true } },
  assessorResponsavel: { select: { nome: true } },
} satisfies Prisma.RequestInclude;

type RequestComRelacoes = Prisma.RequestGetPayload<{ include: typeof INCLUDE_DETALHE }>;

function toDetail(row: RequestComRelacoes): RequestDetail {
  return {
    id: row.id,
    codigoInterno: row.codigoInterno,
    tituloResumido: row.tituloResumido,
    solicitanteNome: row.solicitanteNome,
    bairro: row.bairro,
    status: row.status as RequestStatusValue,
    assessorResponsavelId: row.assessorResponsavelId,
    assessorResponsavelNome: row.assessorResponsavel.nome,
    requestTypeId: row.requestTypeId,
    requestTypeNome: row.requestType.nome,
    numeroProtocolo: row.numeroProtocolo,
    createdAt: row.createdAt,
    solicitanteTelefone: row.solicitanteTelefone,
    solicitanteNascimento: row.solicitanteNascimento,
    cep: row.cep,
    rua: row.rua,
    numero: row.numero,
    complemento: row.complemento,
    cidade: row.cidade,
    estado: row.estado,
    pontoReferencia: row.pontoReferencia,
    localExato: row.localExato,
    descricao: row.descricao,
    descricaoOutroAssunto: row.descricaoOutroAssunto,
    autorizacaoDados: row.autorizacaoDados,
    updatedAt: row.updatedAt,
    fotos: row.fotos,
  };
}

export function createRequestRepository(prisma: PrismaClient): RequestRepository {
  return {
    async create(input, fotos) {
      const criado = await prisma.request.create({
        data: {
          codigoInterno: input.codigoInterno,
          solicitanteNome: input.solicitanteNome,
          solicitanteTelefone: input.solicitanteTelefone,
          solicitanteNascimento: input.solicitanteNascimento,
          cep: input.cep,
          rua: input.rua,
          numero: input.numero,
          complemento: input.complemento,
          bairro: input.bairro,
          cidade: input.cidade,
          estado: input.estado,
          pontoReferencia: input.pontoReferencia,
          localExato: input.localExato,
          tituloResumido: input.tituloResumido,
          descricao: input.descricao,
          descricaoOutroAssunto: input.descricaoOutroAssunto,
          requestTypeId: input.requestTypeId,
          assessorResponsavelId: input.assessorResponsavelId,
          autorizacaoDados: input.autorizacaoDados,
          status: 'ENVIADA',
          fotos: {
            create: fotos.map((f) => ({
              url: f.url,
              publicId: f.publicId,
              larguraPx: f.larguraPx,
              alturaPx: f.alturaPx,
              bytes: f.bytes,
            })),
          },
        },
        include: INCLUDE_DETALHE,
      });
      return toDetail(criado);
    },

    async findById(id) {
      const encontrado = await prisma.request.findUnique({
        where: { id },
        include: INCLUDE_DETALHE,
      });
      return encontrado ? toDetail(encontrado) : null;
    },

    async list(filtro, paginacao) {
      const where: Prisma.RequestWhereInput = {
        ...(filtro.codigoInterno ? { codigoInterno: { contains: filtro.codigoInterno, mode: 'insensitive' } } : {}),
        ...(filtro.solicitanteNome ? { solicitanteNome: { contains: filtro.solicitanteNome, mode: 'insensitive' } } : {}),
        ...(filtro.solicitanteTelefone ? { solicitanteTelefone: filtro.solicitanteTelefone } : {}),
        ...(filtro.requestTypeId ? { requestTypeId: filtro.requestTypeId } : {}),
        ...(filtro.bairro ? { bairro: { contains: filtro.bairro, mode: 'insensitive' } } : {}),
        ...(filtro.assessorResponsavelId ? { assessorResponsavelId: filtro.assessorResponsavelId } : {}),
        ...(filtro.status ? { status: filtro.status } : {}),
        ...(filtro.numeroProtocolo ? { numeroProtocolo: filtro.numeroProtocolo } : {}),
        ...(filtro.dataInicial || filtro.dataFinal
          ? {
              createdAt: {
                ...(filtro.dataInicial ? { gte: filtro.dataInicial } : {}),
                ...(filtro.dataFinal ? { lte: filtro.dataFinal } : {}),
              },
            }
          : {}),
      };

      const [rows, total] = await Promise.all([
        prisma.request.findMany({
          where,
          include: INCLUDE_DETALHE,
          orderBy: { createdAt: 'desc' },
          skip: (paginacao.pagina - 1) * paginacao.tamanhoPagina,
          take: paginacao.tamanhoPagina,
        }),
        prisma.request.count({ where }),
      ]);

      const items: RequestSummary[] = rows.map((row) => {
        const detalhe = toDetail(row);
        const {
          solicitanteTelefone: _t,
          solicitanteNascimento: _n,
          cep: _c,
          rua: _r,
          numero: _nu,
          complemento: _co,
          cidade: _ci,
          estado: _e,
          pontoReferencia: _p,
          localExato: _l,
          descricao: _d,
          descricaoOutroAssunto: _do,
          autorizacaoDados: _a,
          updatedAt: _u,
          fotos: _f,
          ...resumo
        } = detalhe;
        return resumo;
      });

      return { items, total };
    },

    async update(id, input) {
      const atualizado = await prisma.request.update({
        where: { id },
        data: {
          ...(input.solicitanteNome !== undefined ? { solicitanteNome: input.solicitanteNome } : {}),
          ...(input.solicitanteTelefone !== undefined ? { solicitanteTelefone: input.solicitanteTelefone } : {}),
          ...(input.solicitanteNascimento !== undefined ? { solicitanteNascimento: input.solicitanteNascimento } : {}),
          ...(input.cep !== undefined ? { cep: input.cep } : {}),
          ...(input.rua !== undefined ? { rua: input.rua } : {}),
          ...(input.numero !== undefined ? { numero: input.numero } : {}),
          ...(input.complemento !== undefined ? { complemento: input.complemento } : {}),
          ...(input.bairro !== undefined ? { bairro: input.bairro } : {}),
          ...(input.cidade !== undefined ? { cidade: input.cidade } : {}),
          ...(input.estado !== undefined ? { estado: input.estado } : {}),
          ...(input.pontoReferencia !== undefined ? { pontoReferencia: input.pontoReferencia } : {}),
          ...(input.localExato !== undefined ? { localExato: input.localExato } : {}),
          ...(input.tituloResumido !== undefined ? { tituloResumido: input.tituloResumido } : {}),
          ...(input.descricao !== undefined ? { descricao: input.descricao } : {}),
          ...(input.descricaoOutroAssunto !== undefined ? { descricaoOutroAssunto: input.descricaoOutroAssunto } : {}),
          ...(input.requestTypeId !== undefined ? { requestTypeId: input.requestTypeId } : {}),
        },
        include: INCLUDE_DETALHE,
      });
      return toDetail(atualizado);
    },
  };
}
```

Nota: `create` não usa `prisma.$transaction` explícito porque o `data.fotos.create` aninhado já
faz o Prisma gerar o `Request` e os `RequestPhoto` dentro de uma única transação implícita —
se a inserção de qualquer foto falhar, o `Request` também não é criado.

- [ ] **Step 2: Escrever `backend/tests/integration/request.repository.test.ts`**

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createRequestRepository, type CriarRequestInput } from '../../src/repositories/request.repository.js';

const prisma = new PrismaClient();
const requestRepo = createRequestRepository(prisma);

let tipoId: string;
let assessorId: string;

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await prisma.requestPhoto.deleteMany();
  await prisma.request.deleteMany();
  await prisma.requestType.deleteMany();
  await prisma.user.deleteMany();

  const tipo = await prisma.requestType.create({
    data: { nome: 'Tapa-buraco', ativo: true, exigeDescricaoObrigatoria: false },
  });
  tipoId = tipo.id;

  const assessor = await prisma.user.create({
    data: { nome: 'Assessor Teste', telefone: '+5534999996100', role: 'ASSESSOR_RUA' },
  });
  assessorId = assessor.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

function inputBase(overrides: Partial<CriarRequestInput> = {}): CriarRequestInput {
  return {
    codigoInterno: 'GD-20260830-0001',
    solicitanteNome: 'Maria Solicitante',
    solicitanteTelefone: '+5534999990000',
    tituloResumido: 'Buraco na rua',
    descricao: 'Buraco grande em frente ao número 100',
    requestTypeId: tipoId,
    assessorResponsavelId: assessorId,
    autorizacaoDados: true,
    bairro: 'Centro',
    ...overrides,
  };
}

const fotoBase = { url: 'https://cdn.example/a.jpg', publicId: 'a', larguraPx: 800, alturaPx: 600, bytes: 12345 };

describe('RequestRepository.create', () => {
  it('cria a demanda com status ENVIADA e as fotos vinculadas', async () => {
    const criado = await requestRepo.create(inputBase(), [fotoBase, { ...fotoBase, publicId: 'b', url: 'https://cdn.example/b.jpg' }]);

    expect(criado.status).toBe('ENVIADA');
    expect(criado.fotos).toHaveLength(2);
    expect(criado.assessorResponsavelNome).toBe('Assessor Teste');
    expect(criado.requestTypeNome).toBe('Tapa-buraco');
  });
});

describe('RequestRepository.findById', () => {
  it('retorna null quando não existe', async () => {
    const encontrado = await requestRepo.findById('00000000-0000-0000-0000-000000000000');
    expect(encontrado).toBeNull();
  });

  it('retorna o detalhe completo quando existe', async () => {
    const criado = await requestRepo.create(inputBase(), [fotoBase]);
    const encontrado = await requestRepo.findById(criado.id);
    expect(encontrado?.solicitanteNome).toBe('Maria Solicitante');
    expect(encontrado?.fotos).toHaveLength(1);
  });
});

describe('RequestRepository.list', () => {
  it('filtra por bairro e pagina os resultados', async () => {
    await requestRepo.create(inputBase({ codigoInterno: 'GD-1', bairro: 'Centro' }), [fotoBase]);
    await requestRepo.create(inputBase({ codigoInterno: 'GD-2', bairro: 'Centro' }), [fotoBase]);
    await requestRepo.create(inputBase({ codigoInterno: 'GD-3', bairro: 'Vila Nova' }), [fotoBase]);

    const resultado = await requestRepo.list({ bairro: 'Centro' }, { pagina: 1, tamanhoPagina: 10 });
    expect(resultado.total).toBe(2);
    expect(resultado.items).toHaveLength(2);
  });

  it('respeita o tamanho de página', async () => {
    for (let i = 0; i < 5; i++) {
      await requestRepo.create(inputBase({ codigoInterno: `GD-pag-${i}` }), [fotoBase]);
    }

    const pagina1 = await requestRepo.list({}, { pagina: 1, tamanhoPagina: 2 });
    expect(pagina1.items).toHaveLength(2);
    expect(pagina1.total).toBe(5);

    const pagina3 = await requestRepo.list({}, { pagina: 3, tamanhoPagina: 2 });
    expect(pagina3.items).toHaveLength(1);
  });

  it('filtra por assessor responsável', async () => {
    const outroAssessor = await prisma.user.create({
      data: { nome: 'Outro Assessor', telefone: '+5534999996200', role: 'ASSESSOR_RUA' },
    });
    await requestRepo.create(inputBase({ codigoInterno: 'GD-meu' }), [fotoBase]);
    await requestRepo.create(inputBase({ codigoInterno: 'GD-outro', assessorResponsavelId: outroAssessor.id }), [fotoBase]);

    const resultado = await requestRepo.list({ assessorResponsavelId: assessorId }, { pagina: 1, tamanhoPagina: 10 });
    expect(resultado.total).toBe(1);
    expect(resultado.items[0]?.codigoInterno).toBe('GD-meu');
  });
});

describe('RequestRepository.update', () => {
  it('atualiza os campos informados e mantém os demais', async () => {
    const criado = await requestRepo.create(inputBase(), [fotoBase]);
    const atualizado = await requestRepo.update(criado.id, { tituloResumido: 'Buraco corrigido', bairro: 'Novo Bairro' });

    expect(atualizado.tituloResumido).toBe('Buraco corrigido');
    expect(atualizado.bairro).toBe('Novo Bairro');
    expect(atualizado.solicitanteNome).toBe('Maria Solicitante');
  });
});
```

- [ ] **Step 3: Rodar os testes**

Run: `cd backend && npx vitest run tests/integration/request.repository.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 4: Commit**

```bash
git add backend/src/repositories/request.repository.ts backend/tests/integration/request.repository.test.ts
git commit -m "feat(backend): repositorio de demandas com criacao, busca, listagem paginada e edicao"
```

---

## Task 7: RequestService.criar — orquestra tipo, fotos e upload

**Files:**
- Create: `backend/src/services/request.service.ts`
- Test: `backend/tests/unit/request-service-criar.test.ts`
- Modify: `backend/tests/helpers/fakes.ts`

**Interfaces:**
- Consumes: `RequestRepository`, `CriarRequestInput`, `FotoParaSalvar`, `RequestDetail` (Task 6); `RequestTypeRepository` (Task 5); `PhotoUploader` (Task 4); `processarFoto` (Task 3); `gerarCodigoInterno` (Task 1).
- Produces:
```ts
export interface CriarDemandaInput {
  solicitanteNome: string;
  solicitanteTelefone: string;
  solicitanteNascimento?: Date;
  cep?: string;
  rua?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  pontoReferencia?: string;
  localExato: string;
  tituloResumido: string;
  descricao: string;
  descricaoOutroAssunto?: string;
  requestTypeId: string;
  autorizacaoDados: boolean;
  assessorResponsavelId: string;
  fotos: Buffer[];
}

export type CriarDemandaResultado =
  | { status: 'ok'; demanda: RequestDetail }
  | { status: 'tipo_invalido' }
  | { status: 'descricao_outro_obrigatoria' }
  | { status: 'quantidade_fotos_invalida' }
  | { status: 'foto_invalida'; indice: number }
  | { status: 'autorizacao_obrigatoria' };

export class RequestService {
  constructor(deps: { requestRepo: RequestRepository; requestTypeRepo: RequestTypeRepository; photoUploader: PhotoUploader });
  criar(input: CriarDemandaInput): Promise<CriarDemandaResultado>;
}
```
(Task 8 adiciona `listar`, `buscarPorId` e `editar` à mesma classe.)

- [ ] **Step 1: Adicionar fakes de `RequestTypeRepository` e `RequestRepository` em `backend/tests/helpers/fakes.ts`**

Adicionar ao final do arquivo (não remover nada existente):

```ts
import type { RequestTypeRepository, RequestTypeSummary } from '../../src/repositories/request-type.repository.js';
import type {
  RequestRepository,
  RequestDetail,
  CriarRequestInput,
  FotoParaSalvar,
  ListarFiltro,
  Paginacao,
} from '../../src/repositories/request.repository.js';

export function createFakeRequestTypeRepo(
  seed: (RequestTypeSummary & { ativo: boolean })[] = [],
): RequestTypeRepository {
  const tipos = [...seed];
  return {
    async listActive() {
      return tipos
        .filter((t) => t.ativo)
        .map(({ id, nome, exigeDescricaoObrigatoria }) => ({ id, nome, exigeDescricaoObrigatoria }));
    },
    async findById(id) {
      return tipos.find((t) => t.id === id) ?? null;
    },
  };
}

export function createFakeRequestRepo(): RequestRepository & {
  created: { input: CriarRequestInput; fotos: FotoParaSalvar[] }[];
} {
  const created: { input: CriarRequestInput; fotos: FotoParaSalvar[] }[] = [];
  const store: RequestDetail[] = [];
  let contador = 0;

  return {
    created,
    async create(input, fotos) {
      created.push({ input, fotos });
      contador += 1;
      const detalhe: RequestDetail = {
        id: `fake-request-${contador}`,
        codigoInterno: input.codigoInterno,
        tituloResumido: input.tituloResumido,
        solicitanteNome: input.solicitanteNome,
        bairro: input.bairro ?? null,
        status: 'ENVIADA',
        assessorResponsavelId: input.assessorResponsavelId,
        assessorResponsavelNome: 'Assessor Fake',
        requestTypeId: input.requestTypeId,
        requestTypeNome: 'Tipo Fake',
        numeroProtocolo: null,
        createdAt: new Date(),
        solicitanteTelefone: input.solicitanteTelefone,
        solicitanteNascimento: input.solicitanteNascimento ?? null,
        cep: input.cep ?? null,
        rua: input.rua ?? null,
        numero: input.numero ?? null,
        complemento: input.complemento ?? null,
        cidade: input.cidade ?? null,
        estado: input.estado ?? null,
        pontoReferencia: input.pontoReferencia ?? null,
        localExato: input.localExato ?? null,
        descricao: input.descricao,
        descricaoOutroAssunto: input.descricaoOutroAssunto ?? null,
        autorizacaoDados: input.autorizacaoDados,
        updatedAt: new Date(),
        fotos: fotos.map((f, i) => ({ id: `foto-${contador}-${i}`, url: f.url, larguraPx: f.larguraPx, alturaPx: f.alturaPx })),
      };
      store.push(detalhe);
      return detalhe;
    },
    async findById(id) {
      return store.find((r) => r.id === id) ?? null;
    },
    async list(filtro: ListarFiltro, paginacao: Paginacao) {
      let filtrados = store;
      if (filtro.assessorResponsavelId) {
        filtrados = filtrados.filter((r) => r.assessorResponsavelId === filtro.assessorResponsavelId);
      }
      if (filtro.bairro) {
        filtrados = filtrados.filter((r) => r.bairro === filtro.bairro);
      }
      if (filtro.status) {
        filtrados = filtrados.filter((r) => r.status === filtro.status);
      }
      const total = filtrados.length;
      const inicio = (paginacao.pagina - 1) * paginacao.tamanhoPagina;
      const pagina = filtrados.slice(inicio, inicio + paginacao.tamanhoPagina);
      return { items: pagina.map(({ fotos: _fotos, ...resumo }) => resumo), total };
    },
    async update(id, input) {
      const existente = store.find((r) => r.id === id);
      if (!existente) throw new Error('Request não encontrada (fake)');
      Object.assign(existente, input);
      return existente;
    },
  };
}
```

- [ ] **Step 2: Escrever `backend/tests/unit/request-service-criar.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { RequestService } from '../../src/services/request.service.js';
import { createFakeRequestTypeRepo, createFakeRequestRepo, createFakePhotoUploader } from '../helpers/fakes.js';

async function fotoValida(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 10, g: 20, b: 30 } } }).jpeg().toBuffer();
}

function buildService(tipos: Parameters<typeof createFakeRequestTypeRepo>[0]) {
  const requestTypeRepo = createFakeRequestTypeRepo(tipos);
  const requestRepo = createFakeRequestRepo();
  const photoUploader = createFakePhotoUploader();
  const service = new RequestService({ requestRepo, requestTypeRepo, photoUploader });
  return { service, requestRepo, photoUploader };
}

function inputBase(overrides: Record<string, unknown> = {}) {
  return {
    solicitanteNome: 'Maria Solicitante',
    solicitanteTelefone: '+5534999990000',
    localExato: 'Em frente ao número 100',
    tituloResumido: 'Buraco na rua',
    descricao: 'Buraco grande',
    requestTypeId: 'tipo-1',
    autorizacaoDados: true,
    assessorResponsavelId: 'user-1',
    fotos: [],
    ...overrides,
  };
}

describe('RequestService.criar', () => {
  it('cria a demanda quando tudo é válido', async () => {
    const { service, requestRepo, photoUploader } = buildService([
      { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true },
    ]);
    const fotos = [await fotoValida(), await fotoValida()];

    const resultado = await service.criar(inputBase({ fotos }));

    expect(resultado.status).toBe('ok');
    expect(requestRepo.created).toHaveLength(1);
    expect(photoUploader.uploads).toHaveLength(2);
  });

  it('rejeita quando o tipo não existe', async () => {
    const { service } = buildService([]);
    const fotos = [await fotoValida(), await fotoValida()];
    const resultado = await service.criar(inputBase({ fotos, requestTypeId: 'nao-existe' }));
    expect(resultado.status).toBe('tipo_invalido');
  });

  it('rejeita quando o tipo está desativado', async () => {
    const { service } = buildService([
      { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: false },
    ]);
    const fotos = [await fotoValida(), await fotoValida()];
    const resultado = await service.criar(inputBase({ fotos }));
    expect(resultado.status).toBe('tipo_invalido');
  });

  it('exige descrição do assunto quando o tipo é "Outros"', async () => {
    const { service } = buildService([
      { id: 'tipo-outros', nome: 'Outros', exigeDescricaoObrigatoria: true, ativo: true },
    ]);
    const fotos = [await fotoValida(), await fotoValida()];
    const resultado = await service.criar(inputBase({ fotos, requestTypeId: 'tipo-outros' }));
    expect(resultado.status).toBe('descricao_outro_obrigatoria');
  });

  it('aceita "Outros" quando a descrição do assunto vem preenchida', async () => {
    const { service } = buildService([
      { id: 'tipo-outros', nome: 'Outros', exigeDescricaoObrigatoria: true, ativo: true },
    ]);
    const fotos = [await fotoValida(), await fotoValida()];
    const resultado = await service.criar(
      inputBase({ fotos, requestTypeId: 'tipo-outros', descricaoOutroAssunto: 'Poste caído' }),
    );
    expect(resultado.status).toBe('ok');
  });

  it('rejeita menos de 2 fotos', async () => {
    const { service } = buildService([
      { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true },
    ]);
    const resultado = await service.criar(inputBase({ fotos: [await fotoValida()] }));
    expect(resultado.status).toBe('quantidade_fotos_invalida');
  });

  it('rejeita mais de 4 fotos', async () => {
    const { service } = buildService([
      { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true },
    ]);
    const fotos = [await fotoValida(), await fotoValida(), await fotoValida(), await fotoValida(), await fotoValida()];
    const resultado = await service.criar(inputBase({ fotos }));
    expect(resultado.status).toBe('quantidade_fotos_invalida');
  });

  it('rejeita quando autorizacaoDados é falso', async () => {
    const { service } = buildService([
      { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true },
    ]);
    const fotos = [await fotoValida(), await fotoValida()];
    const resultado = await service.criar(inputBase({ fotos, autorizacaoDados: false }));
    expect(resultado.status).toBe('autorizacao_obrigatoria');
  });

  it('rejeita uma foto que não é uma imagem de verdade, sem chegar a fazer upload de nada', async () => {
    const { service, photoUploader } = buildService([
      { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true },
    ]);
    const fotos = [await fotoValida(), Buffer.from('isto nao e uma imagem')];

    const resultado = await service.criar(inputBase({ fotos }));

    expect(resultado).toEqual({ status: 'foto_invalida', indice: 1 });
    expect(photoUploader.uploads).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/unit/request-service-criar.test.ts`
Expected: FAIL — `src/services/request.service.ts` não existe.

- [ ] **Step 4: Implementar `backend/src/services/request.service.ts`**

```ts
import type { RequestRepository, RequestDetail } from '../repositories/request.repository.js';
import type { RequestTypeRepository } from '../repositories/request-type.repository.js';
import type { PhotoUploader } from './cloudinary-uploader.service.js';
import { processarFoto } from './photo-processing.service.js';
import { gerarCodigoInterno } from '../utils/codigo-interno.js';

export interface CriarDemandaInput {
  solicitanteNome: string;
  solicitanteTelefone: string;
  solicitanteNascimento?: Date;
  cep?: string;
  rua?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  pontoReferencia?: string;
  localExato: string;
  tituloResumido: string;
  descricao: string;
  descricaoOutroAssunto?: string;
  requestTypeId: string;
  autorizacaoDados: boolean;
  assessorResponsavelId: string;
  fotos: Buffer[];
}

export type CriarDemandaResultado =
  | { status: 'ok'; demanda: RequestDetail }
  | { status: 'tipo_invalido' }
  | { status: 'descricao_outro_obrigatoria' }
  | { status: 'quantidade_fotos_invalida' }
  | { status: 'foto_invalida'; indice: number }
  | { status: 'autorizacao_obrigatoria' };

export class RequestService {
  private requestRepo: RequestRepository;
  private requestTypeRepo: RequestTypeRepository;
  private photoUploader: PhotoUploader;

  constructor(deps: { requestRepo: RequestRepository; requestTypeRepo: RequestTypeRepository; photoUploader: PhotoUploader }) {
    this.requestRepo = deps.requestRepo;
    this.requestTypeRepo = deps.requestTypeRepo;
    this.photoUploader = deps.photoUploader;
  }

  async criar(input: CriarDemandaInput): Promise<CriarDemandaResultado> {
    if (input.fotos.length < 2 || input.fotos.length > 4) {
      return { status: 'quantidade_fotos_invalida' };
    }
    if (!input.autorizacaoDados) {
      return { status: 'autorizacao_obrigatoria' };
    }

    const tipo = await this.requestTypeRepo.findById(input.requestTypeId);
    if (!tipo || !tipo.ativo) {
      return { status: 'tipo_invalido' };
    }
    if (tipo.exigeDescricaoObrigatoria && !input.descricaoOutroAssunto?.trim()) {
      return { status: 'descricao_outro_obrigatoria' };
    }

    const fotosProcessadas: { buffer: Buffer; contentType: string; larguraPx: number; alturaPx: number; bytes: number }[] = [];
    for (let indice = 0; indice < input.fotos.length; indice++) {
      const buffer = input.fotos[indice]!;
      const resultado = await processarFoto(buffer);
      if (resultado.status === 'tipo_invalido') {
        return { status: 'foto_invalida', indice };
      }
      fotosProcessadas.push(resultado.foto);
    }

    const fotosEnviadas: { url: string; publicId: string; larguraPx: number; alturaPx: number; bytes: number }[] = [];
    for (const foto of fotosProcessadas) {
      const enviada = await this.photoUploader.upload({
        buffer: foto.buffer,
        contentType: foto.contentType,
        folder: 'demandas',
      });
      fotosEnviadas.push({
        url: enviada.url,
        publicId: enviada.publicId,
        larguraPx: foto.larguraPx,
        alturaPx: foto.alturaPx,
        bytes: foto.bytes,
      });
    }

    const demanda = await this.requestRepo.create(
      {
        codigoInterno: gerarCodigoInterno(),
        solicitanteNome: input.solicitanteNome,
        solicitanteTelefone: input.solicitanteTelefone,
        solicitanteNascimento: input.solicitanteNascimento,
        cep: input.cep,
        rua: input.rua,
        numero: input.numero,
        complemento: input.complemento,
        bairro: input.bairro,
        cidade: input.cidade,
        estado: input.estado,
        pontoReferencia: input.pontoReferencia,
        localExato: input.localExato,
        tituloResumido: input.tituloResumido,
        descricao: input.descricao,
        descricaoOutroAssunto: input.descricaoOutroAssunto,
        requestTypeId: input.requestTypeId,
        assessorResponsavelId: input.assessorResponsavelId,
        autorizacaoDados: input.autorizacaoDados,
      },
      fotosEnviadas,
    );

    return { status: 'ok', demanda };
  }
}
```

- [ ] **Step 5: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/unit/request-service-criar.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/request.service.ts backend/tests/unit/request-service-criar.test.ts backend/tests/helpers/fakes.ts
git commit -m "feat(backend): RequestService.criar com validacao de tipo, fotos e upload"
```

---

## Task 8: RequestService.listar, buscarPorId e editar — permissão por papel

**Files:**
- Modify: `backend/src/services/request.service.ts`
- Test: `backend/tests/unit/request-service-consultas.test.ts`

**Interfaces:**
- Consumes: `UserRoleValue` (de `backend/src/utils/jwt.ts`, Fase 1); `STATUS_ANTES_DE_PROTOCOLAR`/`podeEditarComoAssessorDeRua` (Task 2); `ListarFiltro`, `Paginacao`, `EditarRequestInput` (Task 6).
- Produces (adiciona à classe `RequestService`):
```ts
export interface UsuarioAutenticado {
  id: string;
  role: UserRoleValue;
}

export type BuscarDemandaResultado =
  | { status: 'ok'; demanda: RequestDetail }
  | { status: 'nao_encontrada' }
  | { status: 'sem_permissao' };

export type EditarDemandaResultado =
  | { status: 'ok'; demanda: RequestDetail }
  | { status: 'nao_encontrada' }
  | { status: 'sem_permissao' };

listar(filtro: ListarFiltro, paginacao: Paginacao, usuario: UsuarioAutenticado): Promise<{ items: RequestSummary[]; total: number }>;
buscarPorId(id: string, usuario: UsuarioAutenticado): Promise<BuscarDemandaResultado>;
editar(id: string, input: EditarRequestInput, usuario: UsuarioAutenticado): Promise<EditarDemandaResultado>;
```

- [ ] **Step 1: Escrever `backend/tests/unit/request-service-consultas.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { RequestService } from '../../src/services/request.service.js';
import { createFakeRequestTypeRepo, createFakeRequestRepo, createFakePhotoUploader } from '../helpers/fakes.js';

function buildService() {
  const requestTypeRepo = createFakeRequestTypeRepo([
    { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true },
  ]);
  const requestRepo = createFakeRequestRepo();
  const photoUploader = createFakePhotoUploader();
  const service = new RequestService({ requestRepo, requestTypeRepo, photoUploader });
  return { service, requestRepo };
}

async function criarDemandaFake(requestRepo: ReturnType<typeof createFakeRequestRepo>, assessorId: string, status = 'ENVIADA') {
  const demanda = await requestRepo.create(
    {
      codigoInterno: `GD-${Math.random()}`,
      solicitanteNome: 'Solicitante',
      solicitanteTelefone: '+5534999990000',
      tituloResumido: 'Título',
      descricao: 'Descrição',
      requestTypeId: 'tipo-1',
      assessorResponsavelId: assessorId,
      autorizacaoDados: true,
    },
    [{ url: 'https://cdn/a.jpg', publicId: 'a', larguraPx: 10, alturaPx: 10, bytes: 100 }],
  );
  if (status !== 'ENVIADA') {
    await requestRepo.update(demanda.id, {});
    // força o status diretamente no fake para simular uma demanda já protocolada
    (demanda as { status: string }).status = status;
  }
  return demanda;
}

describe('RequestService.listar', () => {
  it('assessor de rua só vê as próprias demandas, mesmo tentando filtrar por outro assessor', async () => {
    const { service, requestRepo } = buildService();
    await criarDemandaFake(requestRepo, 'user-eu');
    await criarDemandaFake(requestRepo, 'user-outro');

    const resultado = await service.listar(
      { assessorResponsavelId: 'user-outro' },
      { pagina: 1, tamanhoPagina: 10 },
      { id: 'user-eu', role: 'ASSESSOR_RUA' },
    );

    expect(resultado.total).toBe(1);
    expect(resultado.items[0]?.assessorResponsavelId).toBe('user-eu');
  });

  it('gabinete vê todas e pode filtrar por um assessor específico', async () => {
    const { service, requestRepo } = buildService();
    await criarDemandaFake(requestRepo, 'user-a');
    await criarDemandaFake(requestRepo, 'user-b');

    const todas = await service.listar({}, { pagina: 1, tamanhoPagina: 10 }, { id: 'gabinete-1', role: 'ASSESSOR_GABINETE' });
    expect(todas.total).toBe(2);

    const filtradas = await service.listar(
      { assessorResponsavelId: 'user-a' },
      { pagina: 1, tamanhoPagina: 10 },
      { id: 'gabinete-1', role: 'ASSESSOR_GABINETE' },
    );
    expect(filtradas.total).toBe(1);
  });
});

describe('RequestService.buscarPorId', () => {
  it('assessor de rua acessa a própria demanda', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-eu');
    const resultado = await service.buscarPorId(demanda.id, { id: 'user-eu', role: 'ASSESSOR_RUA' });
    expect(resultado.status).toBe('ok');
  });

  it('assessor de rua não acessa demanda de outro assessor de rua', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-outro');
    const resultado = await service.buscarPorId(demanda.id, { id: 'user-eu', role: 'ASSESSOR_RUA' });
    expect(resultado.status).toBe('sem_permissao');
  });

  it('retorna nao_encontrada para um id inexistente', async () => {
    const { service } = buildService();
    const resultado = await service.buscarPorId('id-que-nao-existe', { id: 'user-eu', role: 'ASSESSOR_RUA' });
    expect(resultado.status).toBe('nao_encontrada');
  });

  it('gabinete acessa qualquer demanda', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-qualquer');
    const resultado = await service.buscarPorId(demanda.id, { id: 'gabinete-1', role: 'ASSESSOR_GABINETE' });
    expect(resultado.status).toBe('ok');
  });
});

describe('RequestService.editar', () => {
  it('assessor de rua edita a própria demanda antes de protocolada', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-eu');
    const resultado = await service.editar(demanda.id, { tituloResumido: 'Novo título' }, { id: 'user-eu', role: 'ASSESSOR_RUA' });
    expect(resultado.status).toBe('ok');
    if (resultado.status === 'ok') {
      expect(resultado.demanda.tituloResumido).toBe('Novo título');
    }
  });

  it('assessor de rua não edita depois de protocolada', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-eu', 'PROTOCOLADA');
    const resultado = await service.editar(demanda.id, { tituloResumido: 'Novo título' }, { id: 'user-eu', role: 'ASSESSOR_RUA' });
    expect(resultado.status).toBe('sem_permissao');
  });

  it('assessor de rua não edita demanda de outro assessor de rua', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-outro');
    const resultado = await service.editar(demanda.id, { tituloResumido: 'Novo título' }, { id: 'user-eu', role: 'ASSESSOR_RUA' });
    expect(resultado.status).toBe('sem_permissao');
  });

  it('gabinete edita qualquer demanda em qualquer status', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-qualquer', 'PROTOCOLADA');
    const resultado = await service.editar(demanda.id, { tituloResumido: 'Corrigido pelo gabinete' }, { id: 'gabinete-1', role: 'ASSESSOR_GABINETE' });
    expect(resultado.status).toBe('ok');
  });

  it('retorna nao_encontrada para um id inexistente', async () => {
    const { service } = buildService();
    const resultado = await service.editar('id-que-nao-existe', {}, { id: 'gabinete-1', role: 'ASSESSOR_GABINETE' });
    expect(resultado.status).toBe('nao_encontrada');
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/unit/request-service-consultas.test.ts`
Expected: FAIL — `listar`/`buscarPorId`/`editar` não existem em `RequestService`.

- [ ] **Step 3: Adicionar os tipos e métodos em `backend/src/services/request.service.ts`**

Adicionar aos imports do topo do arquivo:

```ts
import type { RequestSummary, ListarFiltro, Paginacao, EditarRequestInput } from '../repositories/request.repository.js';
import type { UserRoleValue } from '../utils/jwt.js';
import { podeEditarComoAssessorDeRua } from '../utils/request-status.js';
```

Adicionar os tipos, junto aos outros already definidos no arquivo:

```ts
export interface UsuarioAutenticado {
  id: string;
  role: UserRoleValue;
}

export type BuscarDemandaResultado =
  | { status: 'ok'; demanda: RequestDetail }
  | { status: 'nao_encontrada' }
  | { status: 'sem_permissao' };

export type EditarDemandaResultado =
  | { status: 'ok'; demanda: RequestDetail }
  | { status: 'nao_encontrada' }
  | { status: 'sem_permissao' };
```

Adicionar os métodos dentro da classe `RequestService`, depois de `criar`:

```ts
  async listar(
    filtro: ListarFiltro,
    paginacao: Paginacao,
    usuario: UsuarioAutenticado,
  ): Promise<{ items: RequestSummary[]; total: number }> {
    const filtroEfetivo: ListarFiltro =
      usuario.role === 'ASSESSOR_RUA' ? { ...filtro, assessorResponsavelId: usuario.id } : filtro;
    return this.requestRepo.list(filtroEfetivo, paginacao);
  }

  async buscarPorId(id: string, usuario: UsuarioAutenticado): Promise<BuscarDemandaResultado> {
    const demanda = await this.requestRepo.findById(id);
    if (!demanda) return { status: 'nao_encontrada' };
    if (usuario.role === 'ASSESSOR_RUA' && demanda.assessorResponsavelId !== usuario.id) {
      return { status: 'sem_permissao' };
    }
    return { status: 'ok', demanda };
  }

  async editar(id: string, input: EditarRequestInput, usuario: UsuarioAutenticado): Promise<EditarDemandaResultado> {
    const demanda = await this.requestRepo.findById(id);
    if (!demanda) return { status: 'nao_encontrada' };

    if (usuario.role === 'ASSESSOR_RUA') {
      const dono = demanda.assessorResponsavelId === usuario.id;
      const aindaEditavel = podeEditarComoAssessorDeRua(demanda.status);
      if (!dono || !aindaEditavel) {
        return { status: 'sem_permissao' };
      }
    }

    const atualizado = await this.requestRepo.update(id, input);
    return { status: 'ok', demanda: atualizado };
  }
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/unit/request-service-consultas.test.ts`
Expected: PASS (11 testes).

- [ ] **Step 5: Rodar toda a suíte unitária de novo**

Run: `cd backend && npx vitest run tests/unit`
Expected: PASS (todos os testes desta fase e da Fase 1).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/request.service.ts backend/tests/unit/request-service-consultas.test.ts
git commit -m "feat(backend): RequestService.listar, buscarPorId e editar com permissao por papel"
```

---

## Task 9: Validators Zod para demandas

**Files:**
- Create: `backend/src/validators/request.validators.ts`
- Test: `backend/tests/unit/request-validators.test.ts`

**Interfaces:**
- Produces: `criarDemandaSchema`, `editarDemandaSchema`, `listarDemandasQuerySchema`, `demandaIdParamsSchema` (todos schemas Zod).

**Nota importante:** os dados de criação/edição chegam via `multipart/form-data` (por causa
das fotos), então TODOS os campos de texto chegam em `req.body` como **strings**, mesmo
quando representam número, data ou booleano — os schemas abaixo fazem essa conversão
explicitamente. Em especial, `z.coerce.boolean()` sozinho NÃO funciona para
`autorizacaoDados`: `Boolean("false")` é `true` em JavaScript (qualquer string não vazia é
truthy), então usar `coerce.boolean()` aceitaria "false" como verdadeiro — daí o
`z.preprocess` customizado abaixo.

- [ ] **Step 1: Escrever o teste**

```ts
import { describe, it, expect } from 'vitest';
import { criarDemandaSchema, editarDemandaSchema, listarDemandasQuerySchema, demandaIdParamsSchema } from '../../src/validators/request.validators.js';

function corpoBase(overrides: Record<string, string> = {}) {
  return {
    solicitanteNome: 'Maria Solicitante',
    solicitanteTelefone: '(34) 99999-0000',
    localExato: 'Em frente ao 100',
    tituloResumido: 'Buraco na rua',
    descricao: 'Buraco grande',
    requestTypeId: '11111111-1111-1111-1111-111111111111',
    autorizacaoDados: 'true',
    ...overrides,
  };
}

describe('criarDemandaSchema', () => {
  it('aceita o corpo mínimo válido vindo como strings de multipart', () => {
    const resultado = criarDemandaSchema.parse(corpoBase());
    expect(resultado.autorizacaoDados).toBe(true);
  });

  it('converte autorizacaoDados="false" para false (não para true)', () => {
    const resultado = criarDemandaSchema.parse(corpoBase({ autorizacaoDados: 'false' }));
    expect(resultado.autorizacaoDados).toBe(false);
  });

  it('converte solicitanteNascimento em Date quando presente', () => {
    const resultado = criarDemandaSchema.parse(corpoBase({ solicitanteNascimento: '1990-05-20' }));
    expect(resultado.solicitanteNascimento).toBeInstanceOf(Date);
  });

  it('rejeita quando falta um campo obrigatório', () => {
    const { tituloResumido: _t, ...semTitulo } = corpoBase();
    expect(() => criarDemandaSchema.parse(semTitulo)).toThrow();
  });

  it('rejeita requestTypeId que não é um uuid', () => {
    expect(() => criarDemandaSchema.parse(corpoBase({ requestTypeId: 'nao-e-uuid' }))).toThrow();
  });
});

describe('editarDemandaSchema', () => {
  it('aceita um objeto parcial, com só um campo', () => {
    const resultado = editarDemandaSchema.parse({ tituloResumido: 'Novo título' });
    expect(resultado).toEqual({ tituloResumido: 'Novo título' });
  });

  it('aceita objeto vazio (nenhum campo alterado)', () => {
    expect(() => editarDemandaSchema.parse({})).not.toThrow();
  });
});

describe('listarDemandasQuerySchema', () => {
  it('aplica os valores padrão de paginação quando ausentes', () => {
    const resultado = listarDemandasQuerySchema.parse({});
    expect(resultado.pagina).toBe(1);
    expect(resultado.tamanhoPagina).toBe(20);
  });

  it('converte pagina e tamanhoPagina de string para número', () => {
    const resultado = listarDemandasQuerySchema.parse({ pagina: '3', tamanhoPagina: '50' });
    expect(resultado.pagina).toBe(3);
    expect(resultado.tamanhoPagina).toBe(50);
  });

  it('rejeita tamanhoPagina acima de 100', () => {
    expect(() => listarDemandasQuerySchema.parse({ tamanhoPagina: '500' })).toThrow();
  });

  it('aceita um status válido do enum', () => {
    const resultado = listarDemandasQuerySchema.parse({ status: 'ENVIADA' });
    expect(resultado.status).toBe('ENVIADA');
  });

  it('rejeita um status que não existe no enum', () => {
    expect(() => listarDemandasQuerySchema.parse({ status: 'NAO_EXISTE' })).toThrow();
  });
});

describe('demandaIdParamsSchema', () => {
  it('aceita um uuid válido', () => {
    expect(() => demandaIdParamsSchema.parse({ id: '11111111-1111-1111-1111-111111111111' })).not.toThrow();
  });

  it('rejeita um id malformado', () => {
    expect(() => demandaIdParamsSchema.parse({ id: 'nao-e-uuid' })).toThrow();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/unit/request-validators.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `backend/src/validators/request.validators.ts`**

```ts
import { z } from 'zod';

const booleanDeString = z.preprocess((valor) => valor === 'true' || valor === true, z.boolean());

const statusEnum = z.enum([
  'RASCUNHO',
  'ENVIADA',
  'RECEBIDA',
  'EM_CONFERENCIA',
  'PENDENTE_INFORMACAO',
  'PROTOCOLADA',
  'EM_ANDAMENTO',
  'CONCLUIDA',
  'ARQUIVADA',
  'RECUSADA',
]);

export const criarDemandaSchema = z.object({
  solicitanteNome: z.string().min(2),
  solicitanteTelefone: z.string().min(10),
  solicitanteNascimento: z.coerce.date().optional(),
  cep: z.string().optional(),
  rua: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  pontoReferencia: z.string().optional(),
  localExato: z.string().min(2),
  tituloResumido: z.string().min(2),
  descricao: z.string().min(2),
  descricaoOutroAssunto: z.string().optional(),
  requestTypeId: z.string().uuid(),
  autorizacaoDados: booleanDeString,
});

export const editarDemandaSchema = criarDemandaSchema.omit({ autorizacaoDados: true }).partial();

export const listarDemandasQuerySchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  tamanhoPagina: z.coerce.number().int().min(1).max(100).default(20),
  codigoInterno: z.string().optional(),
  solicitanteNome: z.string().optional(),
  solicitanteTelefone: z.string().optional(),
  requestTypeId: z.string().uuid().optional(),
  bairro: z.string().optional(),
  assessorResponsavelId: z.string().uuid().optional(),
  status: statusEnum.optional(),
  dataInicial: z.coerce.date().optional(),
  dataFinal: z.coerce.date().optional(),
  numeroProtocolo: z.string().optional(),
});

export const demandaIdParamsSchema = z.object({ id: z.string().uuid() });
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/unit/request-validators.test.ts`
Expected: PASS (13 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/validators/request.validators.ts backend/tests/unit/request-validators.test.ts
git commit -m "feat(backend): validators Zod para criar/editar/listar demandas"
```

---

## Task 10: Rota `POST /demandas` — criação com upload de fotos

**Files:**
- Create: `backend/src/controllers/request.controller.ts`
- Create: `backend/src/routes/request.routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/tests/helpers/build-test-app.ts`
- Test: `backend/tests/integration/request.routes.test.ts`

**Interfaces:**
- Consumes: `RequestService`, `criarDemandaSchema` (Tasks 7–9); `createCloudinaryUploader`, `PhotoUploader` (Task 4).
- Produces: `POST /demandas` (autenticado, qualquer papel) — `multipart/form-data`, campo de arquivo `fotos` (2 a 4), demais campos como no `criarDemandaSchema` → `201 { success: true, data: RequestDetail }` | `400` para cada tipo de erro de validação/negócio.
- Modifica a assinatura de `createApp`: passa a aceitar um `PhotoUploader` opcional para testes.

- [ ] **Step 1: Instalar o `multer`**

Run: `cd backend && npm install multer && npm install -D @types/multer`

- [ ] **Step 2: Implementar `backend/src/controllers/request.controller.ts`**

```ts
import type { Request, Response } from 'express';
import type { RequestService } from '../services/request.service.js';
import { criarDemandaSchema, editarDemandaSchema, listarDemandasQuerySchema, demandaIdParamsSchema } from '../validators/request.validators.js';
import { HttpError } from '../middlewares/error-handler.js';

export function createRequestController(requestService: RequestService) {
  return {
    async criar(req: Request, res: Response) {
      const dados = criarDemandaSchema.parse(req.body);
      const arquivos = (req.files as Express.Multer.File[] | undefined) ?? [];

      const resultado = await requestService.criar({
        ...dados,
        assessorResponsavelId: req.user!.id,
        fotos: arquivos.map((arquivo) => arquivo.buffer),
      });

      if (resultado.status === 'ok') {
        res.status(201).json({ success: true, data: resultado.demanda });
        return;
      }
      if (resultado.status === 'tipo_invalido') {
        throw new HttpError(400, 'Tipo de demanda inválido ou desativado');
      }
      if (resultado.status === 'descricao_outro_obrigatoria') {
        throw new HttpError(400, 'Descrição do assunto é obrigatória quando o tipo é "Outros"');
      }
      if (resultado.status === 'quantidade_fotos_invalida') {
        throw new HttpError(400, 'Envie de 2 a 4 fotos');
      }
      if (resultado.status === 'autorizacao_obrigatoria') {
        throw new HttpError(400, 'É necessário autorizar o uso e armazenamento dos dados');
      }
      throw new HttpError(400, `Foto inválida (posição ${resultado.indice + 1}). Envie apenas JPG, PNG ou WebP.`);
    },

    async listar(req: Request, res: Response) {
      const query = listarDemandasQuerySchema.parse(req.query);
      const { pagina, tamanhoPagina, ...filtro } = query;
      const resultado = await requestService.listar(filtro, { pagina, tamanhoPagina }, req.user!);
      res.json({
        success: true,
        data: { items: resultado.items, total: resultado.total, pagina, tamanhoPagina },
      });
    },

    async buscarPorId(req: Request, res: Response) {
      const { id } = demandaIdParamsSchema.parse(req.params);
      const resultado = await requestService.buscarPorId(id, req.user!);
      if (resultado.status === 'nao_encontrada') throw new HttpError(404, 'Demanda não encontrada');
      if (resultado.status === 'sem_permissao') throw new HttpError(403, 'Você não tem acesso a esta demanda');
      res.json({ success: true, data: resultado.demanda });
    },

    async editar(req: Request, res: Response) {
      const { id } = demandaIdParamsSchema.parse(req.params);
      const dados = editarDemandaSchema.parse(req.body);
      const resultado = await requestService.editar(id, dados, req.user!);
      if (resultado.status === 'nao_encontrada') throw new HttpError(404, 'Demanda não encontrada');
      if (resultado.status === 'sem_permissao') throw new HttpError(403, 'Você não tem permissão para editar esta demanda');
      res.json({ success: true, data: resultado.demanda });
    },
  };
}
```

- [ ] **Step 3: Implementar `backend/src/routes/request.routes.ts`**

```ts
import { Router } from 'express';
import multer from 'multer';
import type { RequestService } from '../services/request.service.js';
import type { UserRepository } from '../repositories/user.repository.js';
import { createRequestController } from '../controllers/request.controller.js';
import { authenticate } from '../middlewares/authenticate.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 4 },
});

function asyncHandler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next);
}

export function createRequestRouter(deps: { requestService: RequestService; userRepo: UserRepository }): Router {
  const router = Router();
  const controller = createRequestController(deps.requestService);
  const auth = authenticate({ userRepo: deps.userRepo });

  router.post('/', auth, upload.array('fotos', 4), asyncHandler(controller.criar));
  router.get('/', auth, asyncHandler(controller.listar));
  router.get('/:id', auth, asyncHandler(controller.buscarPorId));
  router.patch('/:id', auth, asyncHandler(controller.editar));

  return router;
}
```

- [ ] **Step 4: Atualizar `backend/src/app.ts`**

Adicionar os imports:

```ts
import type { PhotoUploader } from './services/cloudinary-uploader.service.js';
import { createCloudinaryUploader } from './services/cloudinary-uploader.service.js';
import { createRequestTypeRepository } from './repositories/request-type.repository.js';
import { createRequestRepository } from './repositories/request.repository.js';
import { RequestService } from './services/request.service.js';
import { createRequestRouter } from './routes/request.routes.js';
```

(Se `createRequestTypeRepository` já foi importado na Task 5, não duplicar a linha.)

Mudar a assinatura de `createApp` para aceitar um `PhotoUploader` opcional:

```ts
export function createApp(prisma: PrismaClient, deps?: { photoUploader?: PhotoUploader }): express.Express {
```

Dentro da função, onde os outros repositórios/serviços são criados, adicionar:

```ts
  const requestRepo = createRequestRepository(prisma);
  const photoUploader =
    deps?.photoUploader ??
    createCloudinaryUploader({
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      apiKey: env.CLOUDINARY_API_KEY,
      apiSecret: env.CLOUDINARY_API_SECRET,
    });
  const requestService = new RequestService({ requestRepo, requestTypeRepo, photoUploader });
```

(`requestTypeRepo` já existe desde a Task 5 — reaproveitar, não recriar.)

E montar a rota junto às outras:

```ts
  app.use('/demandas', createRequestRouter({ requestService, userRepo }));
```

- [ ] **Step 5: Atualizar `backend/tests/helpers/build-test-app.ts`**

```ts
import { createApp } from '../../src/app.js';
import { testPrisma } from './reset-db.js';
import { createFakePhotoUploader } from './fakes.js';

export function buildTestApp() {
  return createApp(testPrisma, { photoUploader: createFakePhotoUploader() });
}
```

- [ ] **Step 6: Escrever `backend/tests/integration/request.routes.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { hash } from '@node-rs/argon2';
import { buildTestApp } from '../helpers/build-test-app.js';
import { testPrisma, resetDb } from '../helpers/reset-db.js';

const app = buildTestApp();

beforeEach(async () => {
  await resetDb();
  await testPrisma.requestPhoto.deleteMany();
  await testPrisma.request.deleteMany();
  await testPrisma.requestType.deleteMany();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function fotoValida(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 5, g: 5, b: 5 } } }).jpeg().toBuffer();
}

async function loginComoAssessor(role: 'ASSESSOR_RUA' | 'ASSESSOR_GABINETE' = 'ASSESSOR_RUA', telefone = '+5534999998000') {
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
    expect(res.body.data.codigoInterno).toMatch(/^GD-\d{8}-[0-9A-F]{4}$/);
  });

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
  });

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
  });

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
  });

  it('exige autenticação', async () => {
    const res = await request(app).post('/demandas').field({ tituloResumido: 'x' });
    expect(res.status).toBe(401);
  });
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
  });

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
  });
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
  });

  it('retorna 400 quando o id não é um uuid válido', async () => {
    const { accessToken } = await loginComoAssessor();
    const res = await request(app)
      .patch('/demandas/not-a-uuid')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ tituloResumido: 'x' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 7: Rodar os testes**

Run: `cd backend && npx vitest run tests/integration/request.routes.test.ts`
Expected: PASS (11 testes).

- [ ] **Step 8: Rodar toda a suíte do backend**

Run: `cd backend && npm test`
Expected: PASS — todos os testes das Fases 1 e 2 até aqui.

- [ ] **Step 9: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/controllers/request.controller.ts backend/src/routes/request.routes.ts backend/src/app.ts backend/tests/helpers/build-test-app.ts backend/tests/integration/request.routes.test.ts
git commit -m "feat(backend): rotas de demandas (criar, listar, detalhar, editar) com upload de fotos"
```

---

## Task 11: Front-end — consulta de CEP via ViaCEP

**Files:**
- Create: `frontend/src/lib/cep.ts`
- Test: `frontend/src/lib/cep.test.ts`

**Interfaces:**
- Produces:
```ts
export interface EnderecoViaCep { rua: string; bairro: string; cidade: string; estado: string }
export type BuscarCepResultado =
  | { status: 'ok'; endereco: EnderecoViaCep }
  | { status: 'nao_encontrado' }
  | { status: 'erro' };
export async function buscarCep(cepBruto: string): Promise<BuscarCepResultado>;
```

- [ ] **Step 1: Escrever o teste**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buscarCep } from './cep';

describe('buscarCep', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retorna o endereço quando o ViaCEP encontra o CEP', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ logradouro: 'Rua das Palmeiras', bairro: 'Centro', localidade: 'Uberlândia', uf: 'MG' }),
    });

    const resultado = await buscarCep('38400-000');

    expect(resultado).toEqual({
      status: 'ok',
      endereco: { rua: 'Rua das Palmeiras', bairro: 'Centro', cidade: 'Uberlândia', estado: 'MG' },
    });
    expect(fetch).toHaveBeenCalledWith('https://viacep.com.br/ws/38400000/json/');
  });

  it('retorna nao_encontrado quando o ViaCEP responde com erro:true', async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ({ erro: true }) });
    const resultado = await buscarCep('00000000');
    expect(resultado).toEqual({ status: 'nao_encontrado' });
  });

  it('retorna erro para um CEP com formato inválido, sem chamar a rede', async () => {
    const resultado = await buscarCep('123');
    expect(resultado).toEqual({ status: 'erro' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retorna erro quando a requisição falha', async () => {
    (fetch as any).mockRejectedValueOnce(new Error('rede fora do ar'));
    const resultado = await buscarCep('38400-000');
    expect(resultado).toEqual({ status: 'erro' });
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run src/lib/cep.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `frontend/src/lib/cep.ts`**

```ts
export interface EnderecoViaCep {
  rua: string;
  bairro: string;
  cidade: string;
  estado: string;
}

export type BuscarCepResultado =
  | { status: 'ok'; endereco: EnderecoViaCep }
  | { status: 'nao_encontrado' }
  | { status: 'erro' };

export async function buscarCep(cepBruto: string): Promise<BuscarCepResultado> {
  const cep = cepBruto.replace(/\D/g, '');
  if (cep.length !== 8) {
    return { status: 'erro' };
  }

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!res.ok) {
      return { status: 'erro' };
    }
    const dados = await res.json();
    if (dados.erro) {
      return { status: 'nao_encontrado' };
    }
    return {
      status: 'ok',
      endereco: {
        rua: dados.logradouro ?? '',
        bairro: dados.bairro ?? '',
        cidade: dados.localidade ?? '',
        estado: dados.uf ?? '',
      },
    };
  } catch {
    return { status: 'erro' };
  }
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run src/lib/cep.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/cep.ts frontend/src/lib/cep.test.ts
git commit -m "feat(frontend): consulta de CEP via ViaCEP"
```

---

## Task 12: Front-end — suporte a `multipart/form-data` no cliente de API

**Files:**
- Modify: `frontend/src/services/api-client.ts`
- Modify: `frontend/src/services/api-client.test.ts`

**Interfaces:**
- Modifica `apiClient.request`: quando `options.body instanceof FormData`, envia o `FormData` direto (sem `JSON.stringify` e sem forçar `Content-Type: application/json` — o navegador define o `Content-Type: multipart/form-data; boundary=...` sozinho).

- [ ] **Step 1: Ler o `frontend/src/services/api-client.ts` atual e localizar `buildInit`**

O método `request` monta o `init` da chamada `fetch` assim (da Fase 1):

```ts
const buildInit = (): RequestInit => ({
  method: options.method ?? 'GET',
  headers: {
    'Content-Type': 'application/json',
    ...(options.auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  },
  credentials: 'include',
  body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
});
```

- [ ] **Step 2: Adicionar o teste de multipart em `frontend/src/services/api-client.test.ts`**

Adicionar dentro do `describe('apiClient.request', ...)` já existente:

```ts
  it('envia FormData sem JSON.stringify e sem forçar Content-Type', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ success: true, data: { ok: true } }),
    });

    const formData = new FormData();
    formData.append('campo', 'valor');

    await apiClient.request('/demandas', { method: 'POST', body: formData, auth: true });

    const [, init] = (fetch as any).mock.calls[0];
    expect(init.body).toBe(formData);
    expect(init.headers['Content-Type']).toBeUndefined();
  });
```

- [ ] **Step 3: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run src/services/api-client.test.ts`
Expected: FAIL — o teste novo falha (`init.body` vira uma string JSON, `Content-Type` vem definido).

- [ ] **Step 4: Atualizar `buildInit` em `frontend/src/services/api-client.ts`**

Substituir a função `buildInit` inteira por:

```ts
    const ehFormData = options.body instanceof FormData;

    const buildInit = (): RequestInit => ({
      method: options.method ?? 'GET',
      headers: {
        ...(ehFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(options.auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      credentials: 'include',
      body: ehFormData ? (options.body as FormData) : options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
```

- [ ] **Step 5: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run src/services/api-client.test.ts`
Expected: PASS (todos os testes, incluindo o novo).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/services/api-client.ts frontend/src/services/api-client.test.ts
git commit -m "feat(frontend): suporte a multipart/form-data no cliente de API"
```

---

## Task 13: Front-end — tipos compartilhados, chips de assunto e campo de CEP

**Files:**
- Create: `frontend/src/types/request.ts`
- Create: `frontend/src/components/TipoDemandaChips.tsx`
- Create: `frontend/src/components/CepField.tsx`
- Test: `frontend/src/components/CepField.test.tsx`

**Interfaces:**
- Consumes: `buscarCep` (Task 11); `TextField` (Fase 1).
- Produces:
```ts
export type RequestStatusValue = 'RASCUNHO'|'ENVIADA'|'RECEBIDA'|'EM_CONFERENCIA'|'PENDENTE_INFORMACAO'|'PROTOCOLADA'|'EM_ANDAMENTO'|'CONCLUIDA'|'ARQUIVADA'|'RECUSADA';
export interface TipoDemanda { id: string; nome: string; exigeDescricaoObrigatoria: boolean }
export interface DemandaResumo { id: string; codigoInterno: string; tituloResumido: string; solicitanteNome: string; bairro: string | null; status: RequestStatusValue; assessorResponsavelId: string; assessorResponsavelNome: string; requestTypeId: string; requestTypeNome: string; numeroProtocolo: string | null; createdAt: string }
export interface DemandaDetalhe extends DemandaResumo { /* ver Step 1 */ }
```
- `<TipoDemandaChips tipos selecionadoId onSelecionar />`
- `<CepField value onChange onEnderecoEncontrado />`

- [ ] **Step 1: Implementar `frontend/src/types/request.ts`**

```ts
export type RequestStatusValue =
  | 'RASCUNHO'
  | 'ENVIADA'
  | 'RECEBIDA'
  | 'EM_CONFERENCIA'
  | 'PENDENTE_INFORMACAO'
  | 'PROTOCOLADA'
  | 'EM_ANDAMENTO'
  | 'CONCLUIDA'
  | 'ARQUIVADA'
  | 'RECUSADA';

export interface TipoDemanda {
  id: string;
  nome: string;
  exigeDescricaoObrigatoria: boolean;
}

export interface DemandaResumo {
  id: string;
  codigoInterno: string;
  tituloResumido: string;
  solicitanteNome: string;
  bairro: string | null;
  status: RequestStatusValue;
  assessorResponsavelId: string;
  assessorResponsavelNome: string;
  requestTypeId: string;
  requestTypeNome: string;
  numeroProtocolo: string | null;
  createdAt: string;
}

export interface DemandaDetalhe extends DemandaResumo {
  solicitanteTelefone: string;
  solicitanteNascimento: string | null;
  cep: string | null;
  rua: string | null;
  numero: string | null;
  complemento: string | null;
  cidade: string | null;
  estado: string | null;
  pontoReferencia: string | null;
  localExato: string | null;
  descricao: string;
  descricaoOutroAssunto: string | null;
  autorizacaoDados: boolean;
  updatedAt: string;
  fotos: { id: string; url: string; larguraPx: number | null; alturaPx: number | null }[];
}
```

- [ ] **Step 2: Implementar `frontend/src/components/TipoDemandaChips.tsx`**

```tsx
'use client';

import type { TipoDemanda } from '@/types/request';

interface TipoDemandaChipsProps {
  tipos: TipoDemanda[];
  selecionadoId: string | null;
  onSelecionar: (id: string) => void;
}

export function TipoDemandaChips({ tipos, selecionadoId, onSelecionar }: TipoDemandaChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {tipos.map((tipo) => {
        const selecionado = tipo.id === selecionadoId;
        return (
          <button
            key={tipo.id}
            type="button"
            onClick={() => onSelecionar(tipo.id)}
            className={
              selecionado
                ? 'rounded-full bg-secondary px-4 py-2 text-xs font-medium text-white'
                : 'rounded-full border border-primary px-4 py-2 text-xs font-medium text-primary'
            }
          >
            {tipo.nome}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Escrever `frontend/src/components/CepField.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CepField } from './CepField';

vi.mock('@/lib/cep', () => ({ buscarCep: vi.fn() }));
import { buscarCep } from '@/lib/cep';

describe('CepField', () => {
  beforeEach(() => {
    vi.mocked(buscarCep).mockReset();
  });

  it('chama onEnderecoEncontrado quando o CEP é encontrado ao sair do campo', async () => {
    vi.mocked(buscarCep).mockResolvedValueOnce({
      status: 'ok',
      endereco: { rua: 'Rua das Palmeiras', bairro: 'Centro', cidade: 'Uberlândia', estado: 'MG' },
    });
    const onEnderecoEncontrado = vi.fn();

    render(<CepField value="38400-000" onChange={() => {}} onEnderecoEncontrado={onEnderecoEncontrado} />);
    fireEvent.blur(screen.getByLabelText(/cep/i));

    await waitFor(() => expect(onEnderecoEncontrado).toHaveBeenCalledWith({
      rua: 'Rua das Palmeiras', bairro: 'Centro', cidade: 'Uberlândia', estado: 'MG',
    }));
  });

  it('mostra mensagem de CEP não encontrado', async () => {
    vi.mocked(buscarCep).mockResolvedValueOnce({ status: 'nao_encontrado' });

    render(<CepField value="00000-000" onChange={() => {}} onEnderecoEncontrado={() => {}} />);
    fireEvent.blur(screen.getByLabelText(/cep/i));

    expect(await screen.findByText(/cep não encontrado/i)).toBeInTheDocument();
  });

  it('não consulta a API quando o CEP tem menos de 8 dígitos', () => {
    render(<CepField value="123" onChange={() => {}} onEnderecoEncontrado={() => {}} />);
    fireEvent.blur(screen.getByLabelText(/cep/i));
    expect(buscarCep).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run src/components/CepField.test.tsx`
Expected: FAIL — `./CepField` não existe.

- [ ] **Step 5: Implementar `frontend/src/components/CepField.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { TextField } from '@/components/TextField';
import { buscarCep, type EnderecoViaCep } from '@/lib/cep';

interface CepFieldProps {
  value: string;
  onChange: (cep: string) => void;
  onEnderecoEncontrado: (endereco: EnderecoViaCep) => void;
}

export function CepField({ value, onChange, onEnderecoEncontrado }: CepFieldProps) {
  const [estado, setEstado] = useState<'ocioso' | 'carregando' | 'nao_encontrado' | 'erro'>('ocioso');

  async function handleBlur() {
    const digitos = value.replace(/\D/g, '');
    if (digitos.length !== 8) return;

    setEstado('carregando');
    const resultado = await buscarCep(value);
    if (resultado.status === 'ok') {
      setEstado('ocioso');
      onEnderecoEncontrado(resultado.endereco);
    } else {
      setEstado(resultado.status === 'nao_encontrado' ? 'nao_encontrado' : 'erro');
    }
  }

  return (
    <div>
      <TextField
        label="CEP"
        name="cep"
        inputMode="numeric"
        placeholder="38400-000"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={handleBlur}
      />
      {estado === 'carregando' && <p className="mt-1 text-xs text-gray-500">Buscando endereço…</p>}
      {estado === 'nao_encontrado' && (
        <p className="mt-1 text-xs text-red-600">CEP não encontrado — preencha o endereço manualmente.</p>
      )}
      {estado === 'erro' && (
        <p className="mt-1 text-xs text-red-600">Não foi possível consultar o CEP agora — preencha manualmente.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run src/components/CepField.test.tsx`
Expected: PASS (3 testes).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/types/request.ts frontend/src/components/TipoDemandaChips.tsx frontend/src/components/CepField.tsx frontend/src/components/CepField.test.tsx
git commit -m "feat(frontend): tipos de demanda, chips de assunto e campo de CEP"
```

---

## Task 14: Front-end — compressão de fotos e componente de upload

**Files:**
- Create: `frontend/src/lib/photo-compression.ts`
- Test: `frontend/src/lib/photo-compression.test.ts`
- Create: `frontend/src/components/PhotoUploader.tsx`
- Test: `frontend/src/components/PhotoUploader.test.tsx`

**Interfaces:**
- Produces: `comprimirImagem(arquivo: File, larguraMaxima?: number, qualidade?: number): Promise<Blob>`.
- Produces:
```tsx
export interface FotoSelecionada { id: string; blob: Blob; previewUrl: string }
export function PhotoUploader(props: {
  fotos: FotoSelecionada[];
  onChange: (fotos: FotoSelecionada[]) => void;
  minimo?: number;
  maximo?: number;
}): JSX.Element;
```

- [ ] **Step 1: Escrever `frontend/src/lib/photo-compression.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { comprimirImagem } from './photo-compression';

describe('comprimirImagem', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('redimensiona mantendo a proporção quando a imagem é maior que a largura máxima', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 3200, height: 1600, close: vi.fn() })));
    const drawImage = vi.fn();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toBlob = vi.fn(function (callback: BlobCallback) {
      callback(new Blob(['fake'], { type: 'image/jpeg' }));
    }) as unknown as typeof HTMLCanvasElement.prototype.toBlob;

    const arquivo = new File(['conteudo'], 'foto.jpg', { type: 'image/jpeg' });
    await comprimirImagem(arquivo, 1600, 0.8);

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 800);
  });

  it('não amplia uma imagem menor que a largura máxima', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 400, height: 300, close: vi.fn() })));
    const drawImage = vi.fn();
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toBlob = vi.fn(function (callback: BlobCallback) {
      callback(new Blob(['fake'], { type: 'image/jpeg' }));
    }) as unknown as typeof HTMLCanvasElement.prototype.toBlob;

    const arquivo = new File(['conteudo'], 'foto.jpg', { type: 'image/jpeg' });
    await comprimirImagem(arquivo, 1600, 0.8);

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 400, 300);
  });

  it('resolve com um Blob', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 400, height: 300, close: vi.fn() })));
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toBlob = vi.fn(function (callback: BlobCallback) {
      callback(new Blob(['fake'], { type: 'image/jpeg' }));
    }) as unknown as typeof HTMLCanvasElement.prototype.toBlob;

    const arquivo = new File(['conteudo'], 'foto.jpg', { type: 'image/jpeg' });
    const resultado = await comprimirImagem(arquivo);
    expect(resultado).toBeInstanceOf(Blob);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run src/lib/photo-compression.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `frontend/src/lib/photo-compression.ts`**

```ts
export async function comprimirImagem(arquivo: File, larguraMaxima = 1600, qualidade = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, larguraMaxima / bitmap.width);
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);

  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Este navegador não suporta o processamento de imagem necessário');
  }
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao comprimir a imagem'))),
      'image/jpeg',
      qualidade,
    );
  });
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run src/lib/photo-compression.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Escrever `frontend/src/components/PhotoUploader.test.tsx`**

```tsx
import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PhotoUploader, type FotoSelecionada } from './PhotoUploader';

vi.mock('@/lib/photo-compression', () => ({ comprimirImagem: vi.fn() }));
import { comprimirImagem } from '@/lib/photo-compression';

beforeEach(() => {
  vi.mocked(comprimirImagem).mockReset();
  vi.mocked(comprimirImagem).mockImplementation(async () => new Blob(['fake'], { type: 'image/jpeg' }));
  vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:fake-url'), revokeObjectURL: vi.fn() });
});

function Wrapper() {
  const [fotos, setFotos] = useState<FotoSelecionada[]>([]);
  return <PhotoUploader fotos={fotos} onChange={setFotos} />;
}

describe('PhotoUploader', () => {
  it('mostra "0 de 4 fotos adicionadas" inicialmente', () => {
    render(<Wrapper />);
    expect(screen.getByText(/0 de 4 fotos adicionadas/i)).toBeInTheDocument();
  });

  it('adiciona uma prévia para cada arquivo selecionado', async () => {
    render(<Wrapper />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const arquivo = new File(['conteudo'], 'foto.jpg', { type: 'image/jpeg' });

    fireEvent.change(input, { target: { files: [arquivo] } });

    await waitFor(() => expect(screen.getByText(/1 de 4 fotos adicionadas/i)).toBeInTheDocument());
    expect(screen.getAllByAltText(/prévia da foto/i)).toHaveLength(1);
  });

  it('remove uma foto ao clicar no botão de remover', async () => {
    render(<Wrapper />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const arquivo = new File(['conteudo'], 'foto.jpg', { type: 'image/jpeg' });

    fireEvent.change(input, { target: { files: [arquivo] } });
    await waitFor(() => expect(screen.getByText(/1 de 4 fotos adicionadas/i)).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText(/remover foto/i));
    await waitFor(() => expect(screen.getByText(/0 de 4 fotos adicionadas/i)).toBeInTheDocument());
  });

  it('rejeita um arquivo com tipo não permitido', async () => {
    render(<Wrapper />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const arquivoInvalido = new File(['conteudo'], 'documento.pdf', { type: 'application/pdf' });

    fireEvent.change(input, { target: { files: [arquivoInvalido] } });

    expect(await screen.findByText(/apenas fotos em jpg, png ou webp/i)).toBeInTheDocument();
    expect(comprimirImagem).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run src/components/PhotoUploader.test.tsx`
Expected: FAIL — `./PhotoUploader` não existe.

- [ ] **Step 7: Implementar `frontend/src/components/PhotoUploader.tsx`**

```tsx
'use client';

import { useRef, useState } from 'react';
import { comprimirImagem } from '@/lib/photo-compression';

export interface FotoSelecionada {
  id: string;
  blob: Blob;
  previewUrl: string;
}

interface PhotoUploaderProps {
  fotos: FotoSelecionada[];
  onChange: (fotos: FotoSelecionada[]) => void;
  minimo?: number;
  maximo?: number;
}

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];

export function PhotoUploader({ fotos, onChange, minimo = 2, maximo = 4 }: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function handleArquivos(arquivos: FileList | null) {
    if (!arquivos || arquivos.length === 0) return;
    setErro(null);

    const espacoDisponivel = maximo - fotos.length;
    const selecionados = Array.from(arquivos).slice(0, espacoDisponivel);

    const invalido = selecionados.find((arquivo) => !TIPOS_PERMITIDOS.includes(arquivo.type));
    if (invalido) {
      setErro('Envie apenas fotos em JPG, PNG ou WebP.');
      return;
    }

    const novasFotos: FotoSelecionada[] = [];
    for (const arquivo of selecionados) {
      const blob = await comprimirImagem(arquivo);
      novasFotos.push({ id: `${Date.now()}-${arquivo.name}`, blob, previewUrl: URL.createObjectURL(blob) });
    }

    onChange([...fotos, ...novasFotos]);
  }

  function remover(id: string) {
    onChange(fotos.filter((foto) => foto.id !== id));
  }

  return (
    <div>
      <div className="flex gap-2">
        {fotos.map((foto) => (
          <div key={foto.id} className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={foto.previewUrl} alt="Prévia da foto" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => remover(foto.id)}
              aria-label="Remover foto"
              className="absolute right-0 top-0 bg-black/60 px-1 text-xs text-white"
            >
              ×
            </button>
          </div>
        ))}
        {fotos.length < maximo && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg border border-dashed border-primary text-primary"
          >
            +
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        capture="environment"
        className="hidden"
        onChange={(e) => handleArquivos(e.target.files)}
      />
      <p className="mt-1 text-xs text-gray-500">
        {fotos.length} de {maximo} fotos adicionadas (mínimo {minimo})
      </p>
      {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}
    </div>
  );
}
```

- [ ] **Step 8: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run src/components/PhotoUploader.test.tsx`
Expected: PASS (4 testes).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/photo-compression.ts frontend/src/lib/photo-compression.test.ts frontend/src/components/PhotoUploader.tsx frontend/src/components/PhotoUploader.test.tsx
git commit -m "feat(frontend): compressao client-side de fotos e componente de upload"
```

---

## Task 15: Front-end — página de nova demanda

**Files:**
- Create: `frontend/src/app/painel/demandas/nova/page.tsx`
- Test: `frontend/src/app/painel/demandas/nova/page.test.tsx`

**Interfaces:**
- Consumes: `apiClient`, `ApiError` (Fase 1, com suporte a multipart da Task 12); `maskPhone` (Fase 1); `TextField`, `Button` (Fase 1); `CepField` (Task 13); `TipoDemandaChips` (Task 13); `PhotoUploader`, `FotoSelecionada` (Task 14); `TipoDemanda` (Task 13).

- [ ] **Step 1: Escrever `frontend/src/app/painel/demandas/nova/page.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import NovaDemandaPage from './page';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('@/components/PhotoUploader', () => ({
  PhotoUploader: ({ onChange }: { onChange: (fotos: unknown[]) => void }) => (
    <button
      type="button"
      onClick={() =>
        onChange([
          { id: '1', blob: new Blob(['a']), previewUrl: 'blob:1' },
          { id: '2', blob: new Blob(['b']), previewUrl: 'blob:2' },
        ])
      }
    >
      Simular 2 fotos
    </button>
  ),
}));

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient } from '@/services/api-client';

beforeEach(() => {
  push.mockReset();
  vi.mocked(apiClient.request).mockReset();
  vi.mocked(apiClient.request).mockResolvedValueOnce([
    { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false },
  ]);
});

async function preencherCamposObrigatorios() {
  fireEvent.click(screen.getByText('Simular 2 fotos'));
  fireEvent.click(await screen.findByText('Tapa-buraco'));
  fireEvent.change(screen.getByLabelText(/nome do solicitante/i), { target: { value: 'Maria Solicitante' } });
  fireEvent.change(screen.getByLabelText(/telefone do solicitante/i), { target: { value: '34999990000' } });
  fireEvent.change(screen.getByLabelText(/local exato/i), { target: { value: 'Em frente ao 100' } });
  fireEvent.change(screen.getByLabelText(/título resumido/i), { target: { value: 'Buraco na rua' } });
  fireEvent.change(screen.getByLabelText(/descrição/i), { target: { value: 'Buraco grande' } });
  fireEvent.click(screen.getByLabelText(/autorizo o uso/i));
}

describe('NovaDemandaPage', () => {
  it('carrega os tipos de demanda e exibe como chips', async () => {
    render(<NovaDemandaPage />);
    expect(await screen.findByText('Tapa-buraco')).toBeInTheDocument();
  });

  it('envia a demanda como FormData e navega para o detalhe ao ter sucesso', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({ id: 'demanda-123' });

    render(<NovaDemandaPage />);
    await preencherCamposObrigatorios();

    fireEvent.click(screen.getByRole('button', { name: /enviar demanda/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/painel/demandas/demanda-123'));

    const chamada = vi.mocked(apiClient.request).mock.calls[1];
    expect(chamada?.[0]).toBe('/demandas');
    expect((chamada?.[1] as { body: FormData }).body).toBeInstanceOf(FormData);
  });

  it('mostra erro quando o envio falha', async () => {
    const { ApiError } = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
    vi.mocked(apiClient.request).mockRejectedValueOnce(new ApiError(400, 'Envie de 2 a 4 fotos'));

    render(<NovaDemandaPage />);
    await preencherCamposObrigatorios();

    fireEvent.click(screen.getByRole('button', { name: /enviar demanda/i }));

    expect(await screen.findByText('Envie de 2 a 4 fotos')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run src/app/painel/demandas/nova/page.test.tsx`
Expected: FAIL — `./page` não existe.

- [ ] **Step 3: Implementar `frontend/src/app/painel/demandas/nova/page.tsx`**

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { CepField } from '@/components/CepField';
import { TipoDemandaChips } from '@/components/TipoDemandaChips';
import { PhotoUploader, type FotoSelecionada } from '@/components/PhotoUploader';
import { maskPhone } from '@/lib/phone-mask';
import { apiClient, ApiError } from '@/services/api-client';
import type { TipoDemanda } from '@/types/request';

export default function NovaDemandaPage() {
  const router = useRouter();
  const [tipos, setTipos] = useState<TipoDemanda[]>([]);
  const [tipoSelecionadoId, setTipoSelecionadoId] = useState<string | null>(null);

  const [solicitanteNome, setSolicitanteNome] = useState('');
  const [solicitanteTelefone, setSolicitanteTelefone] = useState('');
  const [solicitanteNascimento, setSolicitanteNascimento] = useState('');
  const [cep, setCep] = useState('');
  const [rua, setRua] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [pontoReferencia, setPontoReferencia] = useState('');
  const [localExato, setLocalExato] = useState('');
  const [tituloResumido, setTituloResumido] = useState('');
  const [descricao, setDescricao] = useState('');
  const [descricaoOutroAssunto, setDescricaoOutroAssunto] = useState('');
  const [autorizacaoDados, setAutorizacaoDados] = useState(false);
  const [fotos, setFotos] = useState<FotoSelecionada[]>([]);

  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    apiClient
      .request<TipoDemanda[]>('/tipos-demanda', { auth: true })
      .then(setTipos)
      .catch(() => setTipos([]));
  }, []);

  const tipoSelecionado = useMemo(() => tipos.find((t) => t.id === tipoSelecionadoId) ?? null, [tipos, tipoSelecionadoId]);

  const formValido =
    solicitanteNome.trim().length > 1 &&
    solicitanteTelefone.replace(/\D/g, '').length >= 10 &&
    localExato.trim().length > 1 &&
    tituloResumido.trim().length > 1 &&
    descricao.trim().length > 1 &&
    tipoSelecionadoId !== null &&
    (!tipoSelecionado?.exigeDescricaoObrigatoria || descricaoOutroAssunto.trim().length > 0) &&
    autorizacaoDados &&
    fotos.length >= 2 &&
    fotos.length <= 4;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErro(null);

    if (!formValido || !tipoSelecionadoId) {
      setErro('Preencha todos os campos obrigatórios e adicione de 2 a 4 fotos.');
      return;
    }

    setEnviando(true);
    try {
      const formData = new FormData();
      formData.append('solicitanteNome', solicitanteNome);
      formData.append('solicitanteTelefone', solicitanteTelefone);
      if (solicitanteNascimento) formData.append('solicitanteNascimento', solicitanteNascimento);
      if (cep) formData.append('cep', cep);
      if (rua) formData.append('rua', rua);
      if (numero) formData.append('numero', numero);
      if (complemento) formData.append('complemento', complemento);
      if (bairro) formData.append('bairro', bairro);
      if (cidade) formData.append('cidade', cidade);
      if (estado) formData.append('estado', estado);
      if (pontoReferencia) formData.append('pontoReferencia', pontoReferencia);
      formData.append('localExato', localExato);
      formData.append('tituloResumido', tituloResumido);
      formData.append('descricao', descricao);
      if (descricaoOutroAssunto) formData.append('descricaoOutroAssunto', descricaoOutroAssunto);
      formData.append('requestTypeId', tipoSelecionadoId);
      formData.append('autorizacaoDados', String(autorizacaoDados));
      fotos.forEach((foto, indice) => formData.append('fotos', foto.blob, `foto-${indice}.jpg`));

      const demanda = await apiClient.request<{ id: string }>('/demandas', { method: 'POST', body: formData, auth: true });
      router.push(`/painel/demandas/${demanda.id}`);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível enviar a demanda. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-md flex-col gap-4 rounded-card bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-primary-dark">Nova demanda</h1>

      <PhotoUploader fotos={fotos} onChange={setFotos} />

      <div>
        <p className="mb-2 text-xs font-medium text-gray-600">Tipo de demanda</p>
        <TipoDemandaChips tipos={tipos} selecionadoId={tipoSelecionadoId} onSelecionar={setTipoSelecionadoId} />
      </div>

      {tipoSelecionado?.exigeDescricaoObrigatoria && (
        <TextField
          label="Descreva o assunto"
          name="descricaoOutroAssunto"
          value={descricaoOutroAssunto}
          onChange={(e) => setDescricaoOutroAssunto(e.target.value)}
        />
      )}

      <TextField
        label="Nome do solicitante"
        name="solicitanteNome"
        value={solicitanteNome}
        onChange={(e) => setSolicitanteNome(e.target.value)}
      />
      <TextField
        label="Telefone do solicitante"
        name="solicitanteTelefone"
        inputMode="numeric"
        value={maskPhone(solicitanteTelefone)}
        onChange={(e) => setSolicitanteTelefone(e.target.value)}
      />
      <TextField
        label="Data de nascimento (opcional)"
        name="solicitanteNascimento"
        type="date"
        value={solicitanteNascimento}
        onChange={(e) => setSolicitanteNascimento(e.target.value)}
      />

      <CepField
        value={cep}
        onChange={setCep}
        onEnderecoEncontrado={(endereco) => {
          setRua(endereco.rua);
          setBairro(endereco.bairro);
          setCidade(endereco.cidade);
          setEstado(endereco.estado);
        }}
      />
      <TextField label="Rua" name="rua" value={rua} onChange={(e) => setRua(e.target.value)} />
      <TextField label="Número" name="numero" value={numero} onChange={(e) => setNumero(e.target.value)} />
      <TextField
        label="Complemento (opcional)"
        name="complemento"
        value={complemento}
        onChange={(e) => setComplemento(e.target.value)}
      />
      <TextField label="Bairro" name="bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
      <TextField label="Cidade" name="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
      <TextField label="Estado" name="estado" value={estado} onChange={(e) => setEstado(e.target.value)} />
      <TextField
        label="Ponto de referência (opcional)"
        name="pontoReferencia"
        value={pontoReferencia}
        onChange={(e) => setPontoReferencia(e.target.value)}
      />
      <TextField
        label="Local exato do problema"
        name="localExato"
        value={localExato}
        onChange={(e) => setLocalExato(e.target.value)}
      />
      <TextField
        label="Título resumido"
        name="tituloResumido"
        value={tituloResumido}
        onChange={(e) => setTituloResumido(e.target.value)}
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="descricao" className="text-sm font-medium text-gray-700">
          Descrição
        </label>
        <textarea
          id="descricao"
          name="descricao"
          rows={4}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          className="rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <label className="flex items-start gap-2 text-xs text-gray-600">
        <input
          type="checkbox"
          checked={autorizacaoDados}
          onChange={(e) => setAutorizacaoDados(e.target.checked)}
          className="mt-1"
        />
        Autorizo o uso e armazenamento dos dados desta demanda pelo gabinete, conforme o aviso de privacidade.
      </label>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      <Button type="submit" variant="secondary" disabled={!formValido || enviando}>
        {enviando ? 'Enviando…' : 'Enviar demanda'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run src/app/painel/demandas/nova/page.test.tsx`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/painel/demandas/nova
git commit -m "feat(frontend): pagina de nova demanda"
```

---

## Task 16: Front-end — listagem de demandas com filtro e paginação

**Files:**
- Create: `frontend/src/app/painel/demandas/page.tsx`
- Test: `frontend/src/app/painel/demandas/page.test.tsx`

**Interfaces:**
- Consumes: `apiClient` (Fase 1); `DemandaResumo` (Task 13). Espera `GET /demandas` retornando `{ items: DemandaResumo[]; total: number; pagina: number; tamanhoPagina: number }` em `data` (formato definido na Task 10).

- [ ] **Step 1: Escrever `frontend/src/app/painel/demandas/page.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DemandasPage from './page';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient } from '@/services/api-client';

function itemFake(overrides: Record<string, unknown> = {}) {
  return {
    id: '1', codigoInterno: 'GD-1', tituloResumido: 'Buraco na rua', solicitanteNome: 'Maria',
    bairro: 'Centro', status: 'ENVIADA', assessorResponsavelId: 'a1', assessorResponsavelNome: 'Assessor',
    requestTypeId: 'tipo-1', requestTypeNome: 'Tapa-buraco', numeroProtocolo: null, createdAt: '2026-08-30T10:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(apiClient.request).mockReset();
});

describe('DemandasPage', () => {
  it('lista as demandas retornadas pela API', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({
      items: [itemFake()], total: 1, pagina: 1, tamanhoPagina: 20,
    });

    render(<DemandasPage />);

    expect(await screen.findByText('Buraco na rua')).toBeInTheDocument();
    expect(screen.getByText('Maria')).toBeInTheDocument();
  });

  it('refaz a busca quando o filtro de bairro muda', async () => {
    vi.mocked(apiClient.request).mockResolvedValue({ items: [], total: 0, pagina: 1, tamanhoPagina: 20 });

    render(<DemandasPage />);
    await waitFor(() => expect(apiClient.request).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText(/bairro/i), { target: { value: 'Centro' } });

    await waitFor(() => expect(apiClient.request).toHaveBeenCalledTimes(2));
    const [url] = vi.mocked(apiClient.request).mock.calls[1]!;
    expect(url).toContain('bairro=Centro');
  });

  it('mostra mensagem quando não há demandas', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({ items: [], total: 0, pagina: 1, tamanhoPagina: 20 });

    render(<DemandasPage />);

    expect(await screen.findByText(/nenhuma demanda encontrada/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run src/app/painel/demandas/page.test.tsx`
Expected: FAIL — `./page` não existe.

- [ ] **Step 3: Implementar `frontend/src/app/painel/demandas/page.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/services/api-client';
import type { DemandaResumo } from '@/types/request';

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  ENVIADA: 'Enviada',
  RECEBIDA: 'Recebida',
  EM_CONFERENCIA: 'Em conferência',
  PENDENTE_INFORMACAO: 'Pendente de informação',
  PROTOCOLADA: 'Protocolada',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDA: 'Concluída',
  ARQUIVADA: 'Arquivada',
  RECUSADA: 'Recusada',
};

interface ListaDemandasResposta {
  items: DemandaResumo[];
  total: number;
  pagina: number;
  tamanhoPagina: number;
}

export default function DemandasPage() {
  const [itens, setItens] = useState<DemandaResumo[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [bairro, setBairro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const tamanhoPagina = 20;

  useEffect(() => {
    setCarregando(true);
    const params = new URLSearchParams({ pagina: String(pagina), tamanhoPagina: String(tamanhoPagina) });
    if (bairro) params.set('bairro', bairro);

    apiClient
      .request<ListaDemandasResposta>(`/demandas?${params.toString()}`, { auth: true })
      .then((resposta) => {
        setItens(resposta.items);
        setTotal(resposta.total);
      })
      .catch(() => {
        setItens([]);
        setTotal(0);
      })
      .finally(() => setCarregando(false));
  }, [pagina, bairro]);

  const totalPaginas = Math.max(1, Math.ceil(total / tamanhoPagina));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-primary-dark">Demandas</h1>
        <Link
          href="/painel/demandas/nova"
          className="rounded-xl bg-secondary px-4 py-2 text-sm font-medium text-white"
        >
          Nova demanda
        </Link>
      </div>

      <div className="max-w-xs">
        <label htmlFor="filtro-bairro" className="text-xs font-medium text-gray-600">
          Bairro
        </label>
        <input
          id="filtro-bairro"
          value={bairro}
          onChange={(e) => {
            setPagina(1);
            setBairro(e.target.value);
          }}
          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {carregando && <p className="text-sm text-gray-500">Carregando…</p>}

      {!carregando && itens.length === 0 && (
        <p className="text-sm text-gray-500">Nenhuma demanda encontrada.</p>
      )}

      <div className="flex flex-col gap-2">
        {itens.map((demanda) => (
          <Link
            key={demanda.id}
            href={`/painel/demandas/${demanda.id}`}
            className="rounded-card bg-white p-4 shadow-sm"
          >
            <p className="font-medium text-gray-900">{demanda.tituloResumido}</p>
            <p className="text-sm text-gray-600">{demanda.solicitanteNome} — {demanda.bairro ?? 'sem bairro'}</p>
            <span className="mt-1 inline-block rounded-full bg-primary-light px-3 py-1 text-xs font-medium text-primary-dark">
              {STATUS_LABEL[demanda.status] ?? demanda.status}
            </span>
          </Link>
        ))}
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            disabled={pagina <= 1}
            onClick={() => setPagina((p) => p - 1)}
            className="text-sm text-primary disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-sm text-gray-600">
            Página {pagina} de {totalPaginas}
          </span>
          <button
            type="button"
            disabled={pagina >= totalPaginas}
            onClick={() => setPagina((p) => p + 1)}
            className="text-sm text-primary disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run src/app/painel/demandas/page.test.tsx`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/painel/demandas/page.tsx frontend/src/app/painel/demandas/page.test.tsx
git commit -m "feat(frontend): listagem de demandas com filtro de bairro e paginacao"
```

---

## Task 17: Front-end — detalhe da demanda

**Files:**
- Create: `frontend/src/app/painel/demandas/[id]/page.tsx`
- Test: `frontend/src/app/painel/demandas/[id]/page.test.tsx`

**Interfaces:**
- Consumes: `apiClient` (Fase 1); `DemandaDetalhe` (Task 13); `useAuth` (Fase 1, para saber o papel do usuário logado e decidir se mostra o botão Editar).

- [ ] **Step 1: Escrever `frontend/src/app/painel/demandas/[id]/page.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import DemandaDetalhePage from './page';

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'demanda-1' }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const useAuthMock = vi.fn();
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => useAuthMock() }));

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient } from '@/services/api-client';

function demandaFake(overrides: Record<string, unknown> = {}) {
  return {
    id: 'demanda-1', codigoInterno: 'GD-1', tituloResumido: 'Buraco na rua', solicitanteNome: 'Maria',
    solicitanteTelefone: '+5534999990000', solicitanteNascimento: null, bairro: 'Centro', cep: null,
    rua: null, numero: null, complemento: null, cidade: null, estado: null, pontoReferencia: null,
    localExato: 'Em frente ao 100', status: 'ENVIADA', assessorResponsavelId: 'user-dono',
    assessorResponsavelNome: 'Assessor', requestTypeId: 'tipo-1', requestTypeNome: 'Tapa-buraco', numeroProtocolo: null,
    descricao: 'Descrição detalhada', descricaoOutroAssunto: null, autorizacaoDados: true,
    createdAt: '2026-08-30T10:00:00.000Z', updatedAt: '2026-08-30T10:00:00.000Z',
    fotos: [{ id: 'f1', url: 'https://cdn/a.jpg', larguraPx: 800, alturaPx: 600 }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(apiClient.request).mockReset();
});

describe('DemandaDetalhePage', () => {
  it('mostra os dados da demanda e a galeria de fotos', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'user-dono', role: 'ASSESSOR_RUA' } });
    vi.mocked(apiClient.request).mockResolvedValueOnce(demandaFake());

    render(<DemandaDetalhePage />);

    expect(await screen.findByText('Buraco na rua')).toBeInTheDocument();
    expect(screen.getByText('Maria')).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('mostra o botão Editar quando o dono ainda pode editar', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'user-dono', role: 'ASSESSOR_RUA' } });
    vi.mocked(apiClient.request).mockResolvedValueOnce(demandaFake({ status: 'ENVIADA' }));

    render(<DemandaDetalhePage />);

    expect(await screen.findByRole('link', { name: /editar/i })).toHaveAttribute('href', '/painel/demandas/demanda-1/editar');
  });

  it('não mostra o botão Editar para o assessor de rua depois de protocolada', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'user-dono', role: 'ASSESSOR_RUA' } });
    vi.mocked(apiClient.request).mockResolvedValueOnce(demandaFake({ status: 'PROTOCOLADA' }));

    render(<DemandaDetalhePage />);
    await screen.findByText('Buraco na rua');

    expect(screen.queryByRole('link', { name: /editar/i })).not.toBeInTheDocument();
  });

  it('gabinete vê o botão Editar mesmo depois de protocolada', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'gabinete-1', role: 'ASSESSOR_GABINETE' } });
    vi.mocked(apiClient.request).mockResolvedValueOnce(demandaFake({ status: 'PROTOCOLADA' }));

    render(<DemandaDetalhePage />);

    expect(await screen.findByRole('link', { name: /editar/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run src/app/painel/demandas/[id]/page.test.tsx`
Expected: FAIL — `./page` não existe.

- [ ] **Step 3: Implementar `frontend/src/app/painel/demandas/[id]/page.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@/services/api-client';
import { useAuth } from '@/hooks/use-auth';
import { STATUS_ANTES_DE_PROTOCOLAR } from '@/lib/request-status';
import type { DemandaDetalhe } from '@/types/request';

export default function DemandaDetalhePage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const [demanda, setDemanda] = useState<DemandaDetalhe | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    apiClient
      .request<DemandaDetalhe>(`/demandas/${params.id}`, { auth: true })
      .then(setDemanda)
      .finally(() => setCarregando(false));
  }, [params.id]);

  if (carregando) {
    return <p className="text-sm text-gray-500">Carregando…</p>;
  }

  if (!demanda) {
    return <p className="text-sm text-red-600">Não foi possível carregar esta demanda.</p>;
  }

  const podeEditar =
    user?.role === 'ASSESSOR_GABINETE' ||
    user?.role === 'CHEFE' ||
    (user?.role === 'ASSESSOR_RUA' &&
      demanda.assessorResponsavelId === user.id &&
      (STATUS_ANTES_DE_PROTOCOLAR as string[]).includes(demanda.status));

  return (
    <div className="flex flex-col gap-4 rounded-card bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-primary-dark">{demanda.tituloResumido}</h1>
        {podeEditar && (
          <Link
            href={`/painel/demandas/${demanda.id}/editar`}
            className="rounded-xl bg-secondary px-4 py-2 text-sm font-medium text-white"
          >
            Editar
          </Link>
        )}
      </div>

      <p className="text-xs text-gray-500">Código {demanda.codigoInterno} — {demanda.requestTypeNome}</p>

      <div className="flex gap-2 overflow-x-auto">
        {demanda.fotos.map((foto) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={foto.id} src={foto.url} alt="Foto da demanda" className="h-24 w-24 flex-shrink-0 rounded-lg object-cover" />
        ))}
      </div>

      <div>
        <p className="text-xs font-medium text-gray-600">Solicitante</p>
        <p className="text-sm text-gray-900">{demanda.solicitanteNome}</p>
        <p className="text-sm text-gray-600">{demanda.solicitanteTelefone}</p>
      </div>

      <div>
        <p className="text-xs font-medium text-gray-600">Local</p>
        <p className="text-sm text-gray-900">{demanda.localExato}</p>
        <p className="text-sm text-gray-600">{demanda.bairro ?? 'sem bairro informado'}</p>
      </div>

      <div>
        <p className="text-xs font-medium text-gray-600">Descrição</p>
        <p className="text-sm text-gray-900">{demanda.descricao}</p>
      </div>

      <div>
        <p className="text-xs font-medium text-gray-600">Assessor responsável</p>
        <p className="text-sm text-gray-900">{demanda.assessorResponsavelNome}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Criar `frontend/src/lib/request-status.ts` (mesma constante do backend, para a UI decidir quando mostrar Editar)**

```ts
import type { RequestStatusValue } from '@/types/request';

export const STATUS_ANTES_DE_PROTOCOLAR: readonly RequestStatusValue[] = [
  'RASCUNHO',
  'ENVIADA',
  'RECEBIDA',
  'EM_CONFERENCIA',
  'PENDENTE_INFORMACAO',
];
```

- [ ] **Step 5: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run "src/app/painel/demandas/[id]/page.test.tsx"`
Expected: PASS (4 testes).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/painel/demandas/\[id\]/page.tsx "frontend/src/app/painel/demandas/[id]/page.test.tsx" frontend/src/lib/request-status.ts
git commit -m "feat(frontend): pagina de detalhe da demanda com galeria e botao editar condicional"
```

---

## Task 18: Front-end — página de edição de demanda

**Files:**
- Create: `frontend/src/app/painel/demandas/[id]/editar/page.tsx`
- Test: `frontend/src/app/painel/demandas/[id]/editar/page.test.tsx`

**Interfaces:**
- Consumes: `apiClient`, `ApiError` (Fase 1); `maskPhone` (Fase 1); `TextField`, `Button` (Fase 1); `CepField`, `TipoDemandaChips` (Task 13); `DemandaDetalhe`, `TipoDemanda` (Task 13, já com `requestTypeId`).
- Não inclui edição de fotos (fora do escopo desta fase — ver spec).

- [ ] **Step 1: Escrever `frontend/src/app/painel/demandas/[id]/editar/page.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EditarDemandaPage from './page';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'demanda-1' }),
  useRouter: () => ({ push }),
}));

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient } from '@/services/api-client';

function demandaFake(overrides: Record<string, unknown> = {}) {
  return {
    id: 'demanda-1', codigoInterno: 'GD-1', tituloResumido: 'Buraco na rua', solicitanteNome: 'Maria',
    solicitanteTelefone: '+5534999990000', solicitanteNascimento: null, bairro: 'Centro', cep: '38400000',
    rua: 'Rua A', numero: '100', complemento: null, cidade: 'Uberlândia', estado: 'MG', pontoReferencia: null,
    localExato: 'Em frente ao 100', status: 'ENVIADA', assessorResponsavelId: 'user-dono',
    assessorResponsavelNome: 'Assessor', requestTypeId: 'tipo-1', requestTypeNome: 'Tapa-buraco', numeroProtocolo: null,
    descricao: 'Descrição detalhada', descricaoOutroAssunto: null, autorizacaoDados: true,
    createdAt: '2026-08-30T10:00:00.000Z', updatedAt: '2026-08-30T10:00:00.000Z', fotos: [],
    ...overrides,
  };
}

beforeEach(() => {
  push.mockReset();
  vi.mocked(apiClient.request).mockReset();
});

describe('EditarDemandaPage', () => {
  it('pré-preenche o formulário com os dados atuais da demanda', async () => {
    vi.mocked(apiClient.request)
      .mockResolvedValueOnce(demandaFake())
      .mockResolvedValueOnce([{ id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false }]);

    render(<EditarDemandaPage />);

    expect(await screen.findByDisplayValue('Maria')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Buraco na rua')).toBeInTheDocument();
  });

  it('salva as alterações com PATCH e volta para o detalhe', async () => {
    vi.mocked(apiClient.request)
      .mockResolvedValueOnce(demandaFake())
      .mockResolvedValueOnce([{ id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false }])
      .mockResolvedValueOnce({ id: 'demanda-1' });

    render(<EditarDemandaPage />);
    const campoTitulo = await screen.findByDisplayValue('Buraco na rua');
    fireEvent.change(campoTitulo, { target: { value: 'Buraco corrigido' } });

    fireEvent.click(screen.getByRole('button', { name: /salvar alterações/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/painel/demandas/demanda-1'));

    const chamada = vi.mocked(apiClient.request).mock.calls[2];
    expect(chamada?.[0]).toBe('/demandas/demanda-1');
    expect((chamada?.[1] as { method: string }).method).toBe('PATCH');
  });

  it('mostra erro quando a permissão é negada (403)', async () => {
    const { ApiError } = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
    vi.mocked(apiClient.request)
      .mockResolvedValueOnce(demandaFake())
      .mockResolvedValueOnce([{ id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false }])
      .mockRejectedValueOnce(new ApiError(403, 'Você não tem permissão para editar esta demanda'));

    render(<EditarDemandaPage />);
    await screen.findByDisplayValue('Buraco na rua');

    fireEvent.click(screen.getByRole('button', { name: /salvar alterações/i }));

    expect(await screen.findByText(/você não tem permissão/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run "src/app/painel/demandas/[id]/editar/page.test.tsx"`
Expected: FAIL — `./page` não existe.

- [ ] **Step 3: Implementar `frontend/src/app/painel/demandas/[id]/editar/page.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { CepField } from '@/components/CepField';
import { TipoDemandaChips } from '@/components/TipoDemandaChips';
import { maskPhone } from '@/lib/phone-mask';
import { apiClient, ApiError } from '@/services/api-client';
import type { DemandaDetalhe, TipoDemanda } from '@/types/request';

export default function EditarDemandaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [tipos, setTipos] = useState<TipoDemanda[]>([]);
  const [tipoSelecionadoId, setTipoSelecionadoId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroCarregamento, setErroCarregamento] = useState(false);

  const [solicitanteNome, setSolicitanteNome] = useState('');
  const [solicitanteTelefone, setSolicitanteTelefone] = useState('');
  const [cep, setCep] = useState('');
  const [rua, setRua] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('');
  const [pontoReferencia, setPontoReferencia] = useState('');
  const [localExato, setLocalExato] = useState('');
  const [tituloResumido, setTituloResumido] = useState('');
  const [descricao, setDescricao] = useState('');

  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    Promise.all([
      apiClient.request<DemandaDetalhe>(`/demandas/${params.id}`, { auth: true }),
      apiClient.request<TipoDemanda[]>('/tipos-demanda', { auth: true }),
    ])
      .then(([demanda, listaTipos]) => {
        setTipos(listaTipos);
        setTipoSelecionadoId(demanda.requestTypeId);
        setSolicitanteNome(demanda.solicitanteNome);
        setSolicitanteTelefone(demanda.solicitanteTelefone);
        setCep(demanda.cep ?? '');
        setRua(demanda.rua ?? '');
        setNumero(demanda.numero ?? '');
        setComplemento(demanda.complemento ?? '');
        setBairro(demanda.bairro ?? '');
        setCidade(demanda.cidade ?? '');
        setEstado(demanda.estado ?? '');
        setPontoReferencia(demanda.pontoReferencia ?? '');
        setLocalExato(demanda.localExato ?? '');
        setTituloResumido(demanda.tituloResumido);
        setDescricao(demanda.descricao);
      })
      .catch(() => setErroCarregamento(true))
      .finally(() => setCarregando(false));
  }, [params.id]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      await apiClient.request(`/demandas/${params.id}`, {
        method: 'PATCH',
        auth: true,
        body: {
          solicitanteNome,
          solicitanteTelefone,
          cep,
          rua,
          numero,
          complemento,
          bairro,
          cidade,
          estado,
          pontoReferencia,
          localExato,
          tituloResumido,
          descricao,
          requestTypeId: tipoSelecionadoId ?? undefined,
        },
      });
      router.push(`/painel/demandas/${params.id}`);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível salvar as alterações.');
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return <p className="text-sm text-gray-500">Carregando…</p>;
  }
  if (erroCarregamento) {
    return <p className="text-sm text-red-600">Não foi possível carregar esta demanda para edição.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-md flex-col gap-4 rounded-card bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-primary-dark">Editar demanda</h1>

      <div>
        <p className="mb-2 text-xs font-medium text-gray-600">Tipo de demanda</p>
        <TipoDemandaChips tipos={tipos} selecionadoId={tipoSelecionadoId} onSelecionar={setTipoSelecionadoId} />
      </div>

      <TextField
        label="Nome do solicitante"
        name="solicitanteNome"
        value={solicitanteNome}
        onChange={(e) => setSolicitanteNome(e.target.value)}
      />
      <TextField
        label="Telefone do solicitante"
        name="solicitanteTelefone"
        inputMode="numeric"
        value={maskPhone(solicitanteTelefone)}
        onChange={(e) => setSolicitanteTelefone(e.target.value)}
      />

      <CepField
        value={cep}
        onChange={setCep}
        onEnderecoEncontrado={(endereco) => {
          setRua(endereco.rua);
          setBairro(endereco.bairro);
          setCidade(endereco.cidade);
          setEstado(endereco.estado);
        }}
      />
      <TextField label="Rua" name="rua" value={rua} onChange={(e) => setRua(e.target.value)} />
      <TextField label="Número" name="numero" value={numero} onChange={(e) => setNumero(e.target.value)} />
      <TextField
        label="Complemento (opcional)"
        name="complemento"
        value={complemento}
        onChange={(e) => setComplemento(e.target.value)}
      />
      <TextField label="Bairro" name="bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
      <TextField label="Cidade" name="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
      <TextField label="Estado" name="estado" value={estado} onChange={(e) => setEstado(e.target.value)} />
      <TextField
        label="Ponto de referência (opcional)"
        name="pontoReferencia"
        value={pontoReferencia}
        onChange={(e) => setPontoReferencia(e.target.value)}
      />
      <TextField
        label="Local exato do problema"
        name="localExato"
        value={localExato}
        onChange={(e) => setLocalExato(e.target.value)}
      />
      <TextField
        label="Título resumido"
        name="tituloResumido"
        value={tituloResumido}
        onChange={(e) => setTituloResumido(e.target.value)}
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="descricao" className="text-sm font-medium text-gray-700">
          Descrição
        </label>
        <textarea
          id="descricao"
          name="descricao"
          rows={4}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          className="rounded-xl border border-gray-300 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      <Button type="submit" variant="secondary" disabled={salvando}>
        {salvando ? 'Salvando…' : 'Salvar alterações'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run "src/app/painel/demandas/[id]/editar/page.test.tsx"`
Expected: PASS (3 testes).

- [ ] **Step 5: Rodar toda a suíte do front-end e o build de produção**

Run: `cd frontend && npx vitest run && npm run build`
Expected: todos os testes PASS; build do Next.js conclui sem erros.

- [ ] **Step 6: Rodar a suíte completa do backend mais uma vez, para garantir que nada quebrou nesta fase**

Run: `cd backend && npm test && npm run typecheck`
Expected: todos os testes PASS (unitários + integração contra o Neon); typecheck limpo.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/painel/demandas/\[id\]/editar
git commit -m "feat(frontend): pagina de edicao de demanda"
```
