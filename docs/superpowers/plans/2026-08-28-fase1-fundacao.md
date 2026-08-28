# Fase 1 — Fundação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fundação completa do Gabinete Digital — schema Prisma completo, autenticação por telefone+PIN com JWT/refresh rotativo, papéis (chefe, assessor de rua, assessor de gabinete), e a casca protegida do front-end — sem nenhuma tela ou rota de demandas ainda.

**Architecture:** Monorepo com `backend/` (Node.js + Express + TypeScript + Prisma) e `frontend/` (Next.js App Router + TypeScript + Tailwind), comunicando-se só via REST. Backend roda contra PostgreSQL (Neon em produção; Postgres local via Docker em dev/test). Access token JWT de 15 min devolvido no corpo da resposta; refresh token opaco de alta entropia, hash SHA-256 armazenado no banco, entregue via cookie httpOnly.

**Tech Stack:** Express, TypeScript, Prisma, `@node-rs/argon2` (hash de PIN), `jsonwebtoken`, `zod`, `express-rate-limit`, `helmet`, `cors`, `vitest` + `supertest` (backend); Next.js, React, Tailwind CSS, `vitest` + `@testing-library/react` (frontend).

## Global Constraints

- Login exclusivamente por telefone + PIN de 6 dígitos — nunca e-mail.
- PIN nunca em texto puro em nenhum lugar (banco, logs, resposta de API).
- PIN óbvio (ex: `123456`, `000000`, sequências) deve ser rejeitado na criação/troca.
- Bloqueio após 5 tentativas incorretas consecutivas (janela de 15 minutos).
- JWT access token de curta duração (15 min); refresh token rotativo, revogado no logout.
- Usuário desativado perde acesso imediatamente, mesmo com tokens ainda não expirados.
- Telefones não podem se repetir entre usuários.
- Todo login (sucesso ou falha) grava IP, user-agent e timestamp em `login_attempts`.
- Ações administrativas (criar/editar/desativar usuário, resetar acesso) gravam em `audit_logs`.
- Nenhum dado pessoal ou token aparece em logs de aplicação.
- CORS restrito à URL do front-end (`FRONTEND_URL`); Helmet ativo; payload JSON limitado.
- Todas as tabelas usam UUID como PK, `createdAt`/`updatedAt` com timezone, e exclusão lógica (`ativo`/`arquivadoEm`) em vez de DELETE físico onde a spec pede retenção.
- Papéis: `CHEFE`, `ASSESSOR_RUA`, `ASSESSOR_GABINETE`. Só o chefe cadastra/edita/ativa/desativa usuários.
- Interface 100% em português do Brasil; sem Bootstrap.
- Front-end não acessa o banco diretamente — só fala com a API REST via `NEXT_PUBLIC_API_URL`.

---

## Task 1: Scaffolding do backend + health check

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/.gitignore`
- Create: `backend/src/config/env.ts`
- Create: `backend/src/app.ts`
- Create: `backend/src/server.ts`
- Test: `backend/tests/integration/health.test.ts`
- Test: `backend/tests/helpers/setup-env.ts`
- Test: `backend/tests/helpers/build-test-app.ts`

**Interfaces:**
- Produces: `loadEnv(): Env` em `src/config/env.ts`, onde `Env` tem `{ PORT: number; NODE_ENV: 'development'|'test'|'production'; DATABASE_URL: string; JWT_ACCESS_SECRET: string; JWT_REFRESH_SECRET: string; FRONTEND_URL: string; CLOUDINARY_CLOUD_NAME: string; CLOUDINARY_API_KEY: string; CLOUDINARY_API_SECRET: string }`.
- Produces: `createApp(): express.Express` em `src/app.ts` — monta a app Express sem chamar `listen` (usado nos testes via supertest).

- [ ] **Step 1: Criar `backend/package.json`**

```json
{
  "name": "gabinete-digital-backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:migrate:deploy": "prisma migrate deploy",
    "prisma:seed": "tsx prisma/seed.ts"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@node-rs/argon2": "^1.8.3",
    "@prisma/client": "^5.20.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.21.0",
    "express-rate-limit": "^7.4.0",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/node": "^22.9.0",
    "@types/supertest": "^6.0.2",
    "prisma": "^5.20.0",
    "supertest": "^7.0.0",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

- [ ] **Step 2: Criar `backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src", "prisma"]
}
```

- [ ] **Step 3: Criar `backend/.gitignore`**

```
node_modules/
dist/
.env
*.tsbuildinfo
```

- [ ] **Step 4: Instalar dependências**

Run: `cd backend && npm install`

- [ ] **Step 5: Criar `backend/src/config/env.ts`**

```ts
import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET precisa de ao menos 16 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET precisa de ao menos 16 caracteres'),
  FRONTEND_URL: z.string().url(),
  CLOUDINARY_CLOUD_NAME: z.string().default(''),
  CLOUDINARY_API_KEY: z.string().default(''),
  CLOUDINARY_API_SECRET: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(): Env {
  if (!cached) {
    cached = envSchema.parse(process.env);
  }
  return cached;
}
```

- [ ] **Step 6: Criar `backend/src/app.ts`**

```ts
import express from 'express';

export function createApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  return app;
}
```

- [ ] **Step 7: Criar `backend/src/server.ts`**

```ts
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';

const env = loadEnv();
const app = createApp();

app.listen(env.PORT, () => {
  console.log(`Gabinete Digital API rodando na porta ${env.PORT}`);
});
```

- [ ] **Step 8: Criar `backend/tests/helpers/setup-env.ts`**

Este arquivo é carregado pelo Vitest via `setupFiles` (Step 10), o que garante que essas
variáveis existam no `process.env` **antes** de qualquer teste importar `src/app.ts`. Não
mover essa lógica para dentro de um arquivo importado normalmente (como `build-test-app.ts`):
em módulos ES, todos os `import` de um arquivo são avaliados antes do próprio corpo do
arquivo rodar — mesmo que o `import` apareça depois de outras linhas no código-fonte —
então `process.env.X = ...` escrito ali rodaria tarde demais, depois que `src/config/env.ts`
já teria lido `process.env` via `dotenv/config`.

```ts
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.DATABASE_URL = 'postgresql://gabinete:gabinete@localhost:5433/gabinete_test';
```

- [ ] **Step 9: Criar `backend/tests/helpers/build-test-app.ts`**

```ts
import { createApp } from '../../src/app.js';

export function buildTestApp() {
  return createApp();
}
```

- [ ] **Step 10: Escrever o teste de health check**

```ts
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
```

- [ ] **Step 11: Criar `backend/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/helpers/setup-env.ts'],
  },
});
```

- [ ] **Step 12: Rodar os testes**

Run: `cd backend && npx vitest run tests/integration/health.test.ts`
Expected: PASS (1 teste).

- [ ] **Step 13: Commit**

```bash
git add backend/package.json backend/tsconfig.json backend/.gitignore backend/vitest.config.ts backend/src backend/tests
git commit -m "feat(backend): scaffolding do Express com health check"
```

---

## Task 2: Schema Prisma completo + Postgres local + migração inicial

**Files:**
- Create: `backend/prisma/schema.prisma`
- Create: `backend/src/config/prisma.ts`
- Create: `docker-compose.yml` (raiz do projeto)
- Create: `backend/.env` (local, não versionado)
- Create: `backend/.env.example`

**Interfaces:**
- Produces: `prisma` (cliente singleton) exportado de `src/config/prisma.ts`, usado por todos os repositórios das próximas tasks.
- Produces: modelos Prisma `User`, `RefreshToken`, `LoginAttempt`, `AuditLog`, `RequestType`, `Request`, `RequestPhoto`, `RequestStatusHistory`, `InternalNote`, `Notification`, `PrivacyConsent` e enums `UserRole`, `RequestStatus`.

- [ ] **Step 1: Criar `docker-compose.yml` na raiz (Postgres local para dev/test)**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: gabinete
      POSTGRES_PASSWORD: gabinete
      POSTGRES_DB: gabinete_dev
    ports:
      - "5432:5432"
    volumes:
      - gabinete_pg_data:/var/lib/postgresql/data
  postgres_test:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: gabinete
      POSTGRES_PASSWORD: gabinete
      POSTGRES_DB: gabinete_test
    ports:
      - "5433:5432"
volumes:
  gabinete_pg_data:
```

- [ ] **Step 2: Subir os bancos locais**

Run: `docker compose up -d`
Expected: dois containers `postgres` (porta 5432) e `postgres_test` (porta 5433) no ar.

- [ ] **Step 3: Criar `backend/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  CHEFE
  ASSESSOR_RUA
  ASSESSOR_GABINETE
}

enum RequestStatus {
  RASCUNHO
  ENVIADA
  RECEBIDA
  EM_CONFERENCIA
  PENDENTE_INFORMACAO
  PROTOCOLADA
  EM_ANDAMENTO
  CONCLUIDA
  ARQUIVADA
  RECUSADA
}

model User {
  id          String   @id @default(uuid())
  nome        String
  telefone    String   @unique
  pinHash     String?
  pinDefinido Boolean  @default(false)
  role        UserRole
  ativo       Boolean  @default(true)
  createdAt   DateTime @default(now()) @db.Timestamptz(3)
  updatedAt   DateTime @updatedAt @db.Timestamptz(3)

  refreshTokens        RefreshToken[]
  auditLogsComoAtor    AuditLog[]              @relation("ActorAuditLogs")
  demandasResponsavel  Request[]               @relation("AssessorResponsavel")
  historicoAlteracoes  RequestStatusHistory[]  @relation("StatusHistoryUser")
  observacoesInternas  InternalNote[]          @relation("InternalNoteAuthor")
  notificacoes         Notification[]

  @@map("users")
}

model RefreshToken {
  id          String    @id @default(uuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id])
  tokenHash   String    @unique
  expiresAt   DateTime  @db.Timestamptz(3)
  revokedAt   DateTime? @db.Timestamptz(3)
  createdByIp String?
  createdAt   DateTime  @default(now()) @db.Timestamptz(3)

  @@index([userId])
  @@map("refresh_tokens")
}

model LoginAttempt {
  id        String   @id @default(uuid())
  telefone  String
  sucesso   Boolean
  ip        String?
  userAgent String?
  createdAt DateTime @default(now()) @db.Timestamptz(3)

  @@index([telefone, createdAt])
  @@map("login_attempts")
}

model AuditLog {
  id          String   @id @default(uuid())
  actorUserId String?
  actor       User?    @relation("ActorAuditLogs", fields: [actorUserId], references: [id])
  acao        String
  entidade    String
  entidadeId  String?
  detalhes    Json?
  ip          String?
  createdAt   DateTime @default(now()) @db.Timestamptz(3)

  @@index([entidade, entidadeId])
  @@map("audit_logs")
}

model RequestType {
  id                        String   @id @default(uuid())
  nome                      String   @unique
  ativo                     Boolean  @default(true)
  exigeDescricaoObrigatoria Boolean  @default(false)
  createdAt                 DateTime @default(now()) @db.Timestamptz(3)
  updatedAt                 DateTime @updatedAt @db.Timestamptz(3)

  demandas Request[]

  @@map("request_types")
}

model Request {
  id                     String        @id @default(uuid())
  codigoInterno          String        @unique
  solicitanteNome        String
  solicitanteTelefone    String
  solicitanteNascimento  DateTime?     @db.Timestamptz(3)
  cep                    String?
  rua                    String?
  numero                 String?
  complemento            String?
  bairro                 String?
  cidade                 String?
  estado                 String?
  pontoReferencia        String?
  localExato             String?
  tituloResumido         String
  descricao              String
  descricaoOutroAssunto  String?
  requestTypeId          String
  requestType            RequestType   @relation(fields: [requestTypeId], references: [id])
  assessorResponsavelId  String
  assessorResponsavel    User          @relation("AssessorResponsavel", fields: [assessorResponsavelId], references: [id])
  status                 RequestStatus @default(RASCUNHO)
  numeroProtocolo        String?
  autorizacaoDados       Boolean       @default(false)
  arquivadoEm            DateTime?     @db.Timestamptz(3)
  createdAt              DateTime      @default(now()) @db.Timestamptz(3)
  updatedAt              DateTime      @updatedAt @db.Timestamptz(3)

  fotos         RequestPhoto[]
  historico     RequestStatusHistory[]
  observacoes   InternalNote[]
  notificacoes  Notification[]
  consentimento PrivacyConsent?

  @@index([status])
  @@index([bairro])
  @@index([assessorResponsavelId])
  @@map("requests")
}

model RequestPhoto {
  id        String   @id @default(uuid())
  requestId String
  request   Request  @relation(fields: [requestId], references: [id])
  url       String
  publicId  String
  larguraPx Int?
  alturaPx  Int?
  bytes     Int?
  createdAt DateTime @default(now()) @db.Timestamptz(3)

  @@index([requestId])
  @@map("request_photos")
}

model RequestStatusHistory {
  id             String         @id @default(uuid())
  requestId      String
  request        Request        @relation(fields: [requestId], references: [id])
  statusAnterior RequestStatus?
  statusNovo     RequestStatus
  usuarioId      String
  usuario        User           @relation("StatusHistoryUser", fields: [usuarioId], references: [id])
  observacao     String?
  createdAt      DateTime       @default(now()) @db.Timestamptz(3)

  @@index([requestId])
  @@map("request_status_history")
}

model InternalNote {
  id        String   @id @default(uuid())
  requestId String
  request   Request  @relation(fields: [requestId], references: [id])
  autorId   String
  autor     User     @relation("InternalNoteAuthor", fields: [autorId], references: [id])
  texto     String
  createdAt DateTime @default(now()) @db.Timestamptz(3)

  @@index([requestId])
  @@map("internal_notes")
}

model Notification {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  requestId String?
  request   Request? @relation(fields: [requestId], references: [id])
  tipo      String
  mensagem  String
  lida      Boolean  @default(false)
  createdAt DateTime @default(now()) @db.Timestamptz(3)

  @@index([userId, lida])
  @@map("notifications")
}

model PrivacyConsent {
  id          String   @id @default(uuid())
  requestId   String   @unique
  request     Request  @relation(fields: [requestId], references: [id])
  autorizado  Boolean
  textoVersao String
  createdAt   DateTime @default(now()) @db.Timestamptz(3)

  @@map("privacy_consents")
}
```

- [ ] **Step 4: Criar `backend/.env.example`**

```
PORT=3001
NODE_ENV=development
DATABASE_URL="postgresql://gabinete:gabinete@localhost:5432/gabinete_dev"
JWT_ACCESS_SECRET="troque-por-um-segredo-aleatorio-de-32-caracteres"
JWT_REFRESH_SECRET="troque-por-outro-segredo-aleatorio-de-32-caracteres"
FRONTEND_URL="http://localhost:3000"
CLOUDINARY_CLOUD_NAME=""
CLOUDINARY_API_KEY=""
CLOUDINARY_API_SECRET=""
```

- [ ] **Step 5: Criar `backend/.env` local (copiando o example e ajustando)**

Run: `cd backend && cp .env.example .env`

Depois, gere segredos aleatórios para os dois `JWT_*_SECRET` (ex: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, rodado duas vezes) e cole no `.env`.

- [ ] **Step 6: Criar `backend/src/config/prisma.ts`**

```ts
import { PrismaClient } from '@prisma/client';
import { loadEnv } from './env.js';

loadEnv();

export const prisma = new PrismaClient();
```

- [ ] **Step 7: Gerar a migração inicial**

Run: `cd backend && npx prisma migrate dev --name init`
Expected: migração criada em `backend/prisma/migrations/`, aplicada ao banco `gabinete_dev`, `PrismaClient` gerado sem erros.

- [ ] **Step 8: Aplicar a mesma migração no banco de teste**

Run: `cd backend && DATABASE_URL="postgresql://gabinete:gabinete@localhost:5433/gabinete_test" npx prisma migrate deploy`
Expected: saída confirmando as migrações aplicadas em `gabinete_test`.

- [ ] **Step 9: Commit**

```bash
git add docker-compose.yml backend/prisma backend/.env.example backend/src/config/prisma.ts
git commit -m "feat(backend): schema Prisma completo e Postgres local via Docker"
```

Nota: `backend/.env` nunca é commitado (está no `.gitignore` da Task 1).

---

## Task 3: Seed — assuntos iniciais e primeiro chefe

**Files:**
- Create: `backend/prisma/seed.ts`

**Interfaces:**
- Consumes: `prisma` de `src/config/prisma.ts` (Task 2).
- Produces: nenhuma interface nova — script standalone rodado via `npm run prisma:seed`.

- [ ] **Step 1: Criar `backend/prisma/seed.ts`**

```ts
import { hash } from '@node-rs/argon2';
import { prisma } from '../src/config/prisma.js';

const ASSUNTOS_INICIAIS = [
  'Tapa-buraco',
  'Vazamento de água',
  'Vazamento de esgoto',
  'Iluminação pública',
  'Retirada de entulho',
  'Limpeza de terreno',
  'Poda de árvore',
  'Canaleta quebrada',
  'Limpeza de canaleta',
  'Sarjeta danificada',
  'Pintura de sinalização',
  'Sinalização viária',
  'Semáforo',
  'Redutor de velocidade',
  'Calçada e acessibilidade',
];

async function seedAssuntos() {
  for (const nome of ASSUNTOS_INICIAIS) {
    await prisma.requestType.upsert({
      where: { nome },
      update: {},
      create: { nome, ativo: true, exigeDescricaoObrigatoria: false },
    });
  }
  await prisma.requestType.upsert({
    where: { nome: 'Outros' },
    update: {},
    create: { nome: 'Outros', ativo: true, exigeDescricaoObrigatoria: true },
  });
  console.log(`Assuntos seedados: ${ASSUNTOS_INICIAIS.length + 1}`);
}

async function seedPrimeiroChefe() {
  const telefone = process.env.SEED_CHEFE_TELEFONE;
  const nome = process.env.SEED_CHEFE_NOME;
  const pin = process.env.SEED_CHEFE_PIN;

  if (!telefone || !nome || !pin) {
    console.log(
      'SEED_CHEFE_TELEFONE / SEED_CHEFE_NOME / SEED_CHEFE_PIN não definidos — pulando criação do primeiro chefe.',
    );
    return;
  }

  const existente = await prisma.user.findUnique({ where: { telefone } });
  if (existente) {
    console.log('Já existe usuário com esse telefone — pulando criação do primeiro chefe.');
    return;
  }

  const pinHash = await hash(pin);
  await prisma.user.create({
    data: {
      nome,
      telefone,
      role: 'CHEFE',
      ativo: true,
      pinDefinido: true,
      pinHash,
    },
  });
  console.log(`Primeiro chefe criado: ${nome} (${telefone})`);
}

async function main() {
  await seedAssuntos();
  await seedPrimeiroChefe();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Rodar o seed sem variáveis do chefe (só assuntos)**

Run: `cd backend && npx tsx prisma/seed.ts`
Expected: log "Assuntos seedados: 16" e aviso de que o chefe foi pulado.

- [ ] **Step 3: Rodar o seed criando o primeiro chefe (dados fictícios de teste local)**

Run: `cd backend && SEED_CHEFE_TELEFONE="+5534999990000" SEED_CHEFE_NOME="Chefe de Teste" SEED_CHEFE_PIN="482913" npx tsx prisma/seed.ts`
Expected: log "Primeiro chefe criado: Chefe de Teste (+5534999990000)".

Nunca commitar essas variáveis com valores reais — em produção elas são passadas como env vars do Render apenas na primeira execução manual do seed (ver README de implantação, Task 22).

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/seed.ts
git commit -m "feat(backend): seed de assuntos iniciais e primeiro chefe"
```

---

## Task 4: Utils de telefone (normalização e validação)

**Files:**
- Create: `backend/src/utils/phone.ts`
- Test: `backend/tests/unit/phone.test.ts`

**Interfaces:**
- Produces: `normalizePhone(input: string): string` (retorna dígitos com prefixo `+55`, ex: `"+5534999998888"`); `isValidBrazilianPhone(input: string): boolean`.

- [ ] **Step 1: Escrever os testes**

```ts
import { describe, it, expect } from 'vitest';
import { normalizePhone, isValidBrazilianPhone } from '../../src/utils/phone.js';

describe('normalizePhone', () => {
  it('normaliza número com máscara para E.164', () => {
    expect(normalizePhone('(34) 99999-8888')).toBe('+5534999998888');
  });

  it('normaliza número já com DDI', () => {
    expect(normalizePhone('+55 34 99999-8888')).toBe('+5534999998888');
  });

  it('normaliza número fixo (10 dígitos)', () => {
    expect(normalizePhone('(34) 3232-1122')).toBe('+553432321122');
  });
});

describe('isValidBrazilianPhone', () => {
  it('aceita celular válido com 11 dígitos', () => {
    expect(isValidBrazilianPhone('(34) 99999-8888')).toBe(true);
  });

  it('rejeita número com dígitos insuficientes', () => {
    expect(isValidBrazilianPhone('1234')).toBe(false);
  });

  it('rejeita número com letras', () => {
    expect(isValidBrazilianPhone('abc-defg')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/unit/phone.test.ts`
Expected: FAIL — módulo `../../src/utils/phone.js` não existe.

- [ ] **Step 3: Implementar `backend/src/utils/phone.ts`**

```ts
function onlyDigits(input: string): string {
  return input.replace(/\D/g, '');
}

export function normalizePhone(input: string): string {
  let digits = onlyDigits(input);
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }
  return `+55${digits}`;
}

export function isValidBrazilianPhone(input: string): boolean {
  let digits = onlyDigits(input);
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }
  return digits.length === 10 || digits.length === 11;
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/unit/phone.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/phone.ts backend/tests/unit/phone.test.ts
git commit -m "feat(backend): normalização e validação de telefone brasileiro"
```

---

## Task 5: Utils de PIN (validação de PIN óbvio e hash com Argon2)

**Files:**
- Create: `backend/src/utils/pin.ts`
- Test: `backend/tests/unit/pin.test.ts`

**Interfaces:**
- Produces: `isPinObvious(pin: string): boolean`; `isPinFormatValid(pin: string): boolean` (exatamente 6 dígitos numéricos); `hashPin(pin: string): Promise<string>`; `verifyPin(pin: string, hash: string): Promise<boolean>`.

- [ ] **Step 1: Escrever os testes**

```ts
import { describe, it, expect } from 'vitest';
import { isPinObvious, isPinFormatValid, hashPin, verifyPin } from '../../src/utils/pin.js';

describe('isPinFormatValid', () => {
  it('aceita 6 dígitos numéricos', () => {
    expect(isPinFormatValid('482913')).toBe(true);
  });

  it('rejeita menos de 6 dígitos', () => {
    expect(isPinFormatValid('4829')).toBe(false);
  });

  it('rejeita caracteres não numéricos', () => {
    expect(isPinFormatValid('48291a')).toBe(false);
  });
});

describe('isPinObvious', () => {
  it('rejeita todos os dígitos repetidos', () => {
    expect(isPinObvious('111111')).toBe(true);
    expect(isPinObvious('000000')).toBe(true);
  });

  it('rejeita sequência crescente', () => {
    expect(isPinObvious('123456')).toBe(true);
  });

  it('rejeita sequência decrescente', () => {
    expect(isPinObvious('987654')).toBe(true);
  });

  it('aceita PIN não óbvio', () => {
    expect(isPinObvious('482913')).toBe(false);
  });
});

describe('hashPin / verifyPin', () => {
  it('gera hash diferente do PIN original e verifica corretamente', async () => {
    const hash = await hashPin('482913');
    expect(hash).not.toBe('482913');
    expect(await verifyPin('482913', hash)).toBe(true);
    expect(await verifyPin('999999', hash)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/unit/pin.test.ts`
Expected: FAIL — módulo `../../src/utils/pin.js` não existe.

- [ ] **Step 3: Implementar `backend/src/utils/pin.ts`**

```ts
import { hash, verify } from '@node-rs/argon2';

export function isPinFormatValid(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

const SEQUENCIAS_OBVIAS = (() => {
  const set = new Set<string>();
  for (let d = 0; d <= 9; d++) {
    set.add(String(d).repeat(6));
  }
  for (let start = 0; start <= 4; start++) {
    let crescente = '';
    let decrescente = '';
    for (let i = 0; i < 6; i++) {
      crescente += String(start + i);
      decrescente += String(9 - start - i);
    }
    set.add(crescente);
    set.add(decrescente);
  }
  return set;
})();

export function isPinObvious(pin: string): boolean {
  return SEQUENCIAS_OBVIAS.has(pin);
}

export async function hashPin(pin: string): Promise<string> {
  return hash(pin);
}

export async function verifyPin(pin: string, pinHash: string): Promise<boolean> {
  return verify(pinHash, pin);
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/unit/pin.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/pin.ts backend/tests/unit/pin.test.ts
git commit -m "feat(backend): validação de PIN óbvio e hash com Argon2"
```

---

## Task 6: Utils de JWT (access token e refresh token opaco)

**Files:**
- Create: `backend/src/utils/jwt.ts`
- Test: `backend/tests/unit/jwt.test.ts`

**Interfaces:**
- Produces: `type AccessTokenPayload = { sub: string; role: 'CHEFE' | 'ASSESSOR_RUA' | 'ASSESSOR_GABINETE' }`; `signAccessToken(payload: AccessTokenPayload): string`; `verifyAccessToken(token: string): AccessTokenPayload`; `generateRefreshTokenValue(): string`; `hashRefreshTokenValue(value: string): string`.

- [ ] **Step 1: Escrever os testes**

```ts
import { describe, it, expect } from 'vitest';
import {
  signAccessToken,
  verifyAccessToken,
  generateRefreshTokenValue,
  hashRefreshTokenValue,
} from '../../src/utils/jwt.js';

describe('access token', () => {
  it('assina e verifica um payload válido', () => {
    const token = signAccessToken({ sub: 'user-1', role: 'ASSESSOR_RUA' });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.role).toBe('ASSESSOR_RUA');
  });

  it('lança erro para token inválido', () => {
    expect(() => verifyAccessToken('token-invalido')).toThrow();
  });
});

describe('refresh token opaco', () => {
  it('gera valores diferentes a cada chamada', () => {
    const a = generateRefreshTokenValue();
    const b = generateRefreshTokenValue();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  it('produz hash determinístico e estável', () => {
    const value = generateRefreshTokenValue();
    expect(hashRefreshTokenValue(value)).toBe(hashRefreshTokenValue(value));
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/unit/jwt.test.ts`
Expected: FAIL — módulo `../../src/utils/jwt.js` não existe.

- [ ] **Step 3: Implementar `backend/src/utils/jwt.ts`**

```ts
import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'node:crypto';
import { loadEnv } from '../config/env.js';

export type UserRoleValue = 'CHEFE' | 'ASSESSOR_RUA' | 'ASSESSOR_GABINETE';

export interface AccessTokenPayload {
  sub: string;
  role: UserRoleValue;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const env = loadEnv();
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const env = loadEnv();
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (typeof decoded === 'string' || !('sub' in decoded) || !('role' in decoded)) {
    throw new Error('Token inválido');
  }
  return { sub: decoded.sub as string, role: decoded.role as UserRoleValue };
}

export function generateRefreshTokenValue(): string {
  return randomBytes(32).toString('hex');
}

export function hashRefreshTokenValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/unit/jwt.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/jwt.ts backend/tests/unit/jwt.test.ts
git commit -m "feat(backend): utilitarios de access token JWT e refresh token opaco"
```

---

## Task 7: Repositórios (User, RefreshToken, LoginAttempt, AuditLog)

**Files:**
- Create: `backend/src/repositories/user.repository.ts`
- Create: `backend/src/repositories/refresh-token.repository.ts`
- Create: `backend/src/repositories/login-attempt.repository.ts`
- Create: `backend/src/repositories/audit-log.repository.ts`
- Test: `backend/tests/integration/repositories.test.ts`

**Interfaces:**
- Produces (usado pelas services nas Tasks 8-11):
```ts
export type PublicUser = {
  id: string; nome: string; telefone: string; role: UserRoleValue;
  ativo: boolean; pinDefinido: boolean; createdAt: Date; updatedAt: Date;
};

export interface UserRepository {
  findByTelefone(telefone: string): Promise<(PublicUser & { pinHash: string | null }) | null>;
  findById(id: string): Promise<(PublicUser & { pinHash: string | null }) | null>;
  create(data: { nome: string; telefone: string; role: UserRoleValue }): Promise<PublicUser>;
  setPinHash(id: string, pinHash: string): Promise<void>;
  clearPin(id: string): Promise<void>;
  updateRole(id: string, role: UserRoleValue): Promise<PublicUser>;
  setAtivo(id: string, ativo: boolean): Promise<PublicUser>;
  list(filter?: { ativo?: boolean }): Promise<PublicUser[]>;
}

export interface RefreshTokenRepository {
  create(data: { userId: string; tokenHash: string; expiresAt: Date; createdByIp?: string }): Promise<void>;
  findValidByHash(tokenHash: string): Promise<{ id: string; userId: string; expiresAt: Date; revokedAt: Date | null } | null>;
  revoke(id: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}

export interface LoginAttemptRepository {
  record(data: { telefone: string; sucesso: boolean; ip?: string; userAgent?: string }): Promise<void>;
  countRecentFailures(telefone: string, sinceMs: number): Promise<number>;
}

export interface AuditLogRepository {
  record(data: { actorUserId?: string; acao: string; entidade: string; entidadeId?: string; detalhes?: unknown; ip?: string }): Promise<void>;
}
```

- [ ] **Step 1: Implementar `backend/src/repositories/user.repository.ts`**

```ts
import type { PrismaClient } from '@prisma/client';
import type { UserRoleValue } from '../utils/jwt.js';

export type PublicUser = {
  id: string;
  nome: string;
  telefone: string;
  role: UserRoleValue;
  ativo: boolean;
  pinDefinido: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function toPublicUser<T extends PublicUser>(user: T): PublicUser {
  const { id, nome, telefone, role, ativo, pinDefinido, createdAt, updatedAt } = user;
  return { id, nome, telefone, role: role as UserRoleValue, ativo, pinDefinido, createdAt, updatedAt };
}

export interface UserRepository {
  findByTelefone(telefone: string): Promise<(PublicUser & { pinHash: string | null }) | null>;
  findById(id: string): Promise<(PublicUser & { pinHash: string | null }) | null>;
  create(data: { nome: string; telefone: string; role: UserRoleValue }): Promise<PublicUser>;
  setPinHash(id: string, pinHash: string): Promise<void>;
  clearPin(id: string): Promise<void>;
  updateRole(id: string, role: UserRoleValue): Promise<PublicUser>;
  setAtivo(id: string, ativo: boolean): Promise<PublicUser>;
  list(filter?: { ativo?: boolean }): Promise<PublicUser[]>;
}

export function createUserRepository(prisma: PrismaClient): UserRepository {
  return {
    async findByTelefone(telefone) {
      const user = await prisma.user.findUnique({ where: { telefone } });
      return user ? { ...toPublicUser(user), pinHash: user.pinHash } : null;
    },
    async findById(id) {
      const user = await prisma.user.findUnique({ where: { id } });
      return user ? { ...toPublicUser(user), pinHash: user.pinHash } : null;
    },
    async create({ nome, telefone, role }) {
      const user = await prisma.user.create({
        data: { nome, telefone, role, pinDefinido: false, ativo: true },
      });
      return toPublicUser(user);
    },
    async setPinHash(id, pinHash) {
      await prisma.user.update({ where: { id }, data: { pinHash, pinDefinido: true } });
    },
    async clearPin(id) {
      await prisma.user.update({ where: { id }, data: { pinHash: null, pinDefinido: false } });
    },
    async updateRole(id, role) {
      const user = await prisma.user.update({ where: { id }, data: { role } });
      return toPublicUser(user);
    },
    async setAtivo(id, ativo) {
      const user = await prisma.user.update({ where: { id }, data: { ativo } });
      return toPublicUser(user);
    },
    async list(filter) {
      const users = await prisma.user.findMany({
        where: filter?.ativo === undefined ? {} : { ativo: filter.ativo },
        orderBy: { nome: 'asc' },
      });
      return users.map(toPublicUser);
    },
  };
}
```

- [ ] **Step 2: Implementar `backend/src/repositories/refresh-token.repository.ts`**

```ts
import type { PrismaClient } from '@prisma/client';

export interface RefreshTokenRepository {
  create(data: { userId: string; tokenHash: string; expiresAt: Date; createdByIp?: string }): Promise<void>;
  findValidByHash(
    tokenHash: string,
  ): Promise<{ id: string; userId: string; expiresAt: Date; revokedAt: Date | null } | null>;
  revoke(id: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}

export function createRefreshTokenRepository(prisma: PrismaClient): RefreshTokenRepository {
  return {
    async create({ userId, tokenHash, expiresAt, createdByIp }) {
      await prisma.refreshToken.create({
        data: { userId, tokenHash, expiresAt, createdByIp },
      });
    },
    async findValidByHash(tokenHash) {
      const token = await prisma.refreshToken.findUnique({ where: { tokenHash } });
      if (!token) return null;
      return {
        id: token.id,
        userId: token.userId,
        expiresAt: token.expiresAt,
        revokedAt: token.revokedAt,
      };
    },
    async revoke(id) {
      await prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
    },
    async revokeAllForUser(userId) {
      await prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    },
  };
}
```

- [ ] **Step 3: Implementar `backend/src/repositories/login-attempt.repository.ts`**

```ts
import type { PrismaClient } from '@prisma/client';

export interface LoginAttemptRepository {
  record(data: { telefone: string; sucesso: boolean; ip?: string; userAgent?: string }): Promise<void>;
  countRecentFailures(telefone: string, sinceMs: number): Promise<number>;
}

export function createLoginAttemptRepository(prisma: PrismaClient): LoginAttemptRepository {
  return {
    async record({ telefone, sucesso, ip, userAgent }) {
      await prisma.loginAttempt.create({ data: { telefone, sucesso, ip, userAgent } });
    },
    async countRecentFailures(telefone, sinceMs) {
      return prisma.loginAttempt.count({
        where: {
          telefone,
          sucesso: false,
          createdAt: { gte: new Date(Date.now() - sinceMs) },
        },
      });
    },
  };
}
```

- [ ] **Step 4: Implementar `backend/src/repositories/audit-log.repository.ts`**

```ts
import type { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';

export interface AuditLogRepository {
  record(data: {
    actorUserId?: string;
    acao: string;
    entidade: string;
    entidadeId?: string;
    detalhes?: unknown;
    ip?: string;
  }): Promise<void>;
}

export function createAuditLogRepository(prisma: PrismaClient): AuditLogRepository {
  return {
    async record({ actorUserId, acao, entidade, entidadeId, detalhes, ip }) {
      await prisma.auditLog.create({
        data: {
          actorUserId,
          acao,
          entidade,
          entidadeId,
          detalhes: detalhes as Prisma.InputJsonValue | undefined,
          ip,
        },
      });
    },
  };
}
```

- [ ] **Step 5: Escrever teste de integração cobrindo os quatro repositórios**

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createUserRepository } from '../../src/repositories/user.repository.js';
import { createRefreshTokenRepository } from '../../src/repositories/refresh-token.repository.js';
import { createLoginAttemptRepository } from '../../src/repositories/login-attempt.repository.js';
import { createAuditLogRepository } from '../../src/repositories/audit-log.repository.js';

const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://gabinete:gabinete@localhost:5433/gabinete_test' } },
});

const userRepo = createUserRepository(prisma);
const refreshTokenRepo = createRefreshTokenRepository(prisma);
const loginAttemptRepo = createLoginAttemptRepository(prisma);
const auditLogRepo = createAuditLogRepository(prisma);

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.loginAttempt.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('UserRepository', () => {
  it('cria, busca por telefone e atualiza papel/ativo', async () => {
    const created = await userRepo.create({ nome: 'Ana Teste', telefone: '+5534999990001', role: 'ASSESSOR_RUA' });
    expect(created.pinDefinido).toBe(false);

    const found = await userRepo.findByTelefone('+5534999990001');
    expect(found?.id).toBe(created.id);
    expect(found?.pinHash).toBeNull();

    await userRepo.setPinHash(created.id, 'hash-fake');
    const withPin = await userRepo.findById(created.id);
    expect(withPin?.pinHash).toBe('hash-fake');
    expect(withPin?.pinDefinido).toBe(true);

    const updated = await userRepo.updateRole(created.id, 'ASSESSOR_GABINETE');
    expect(updated.role).toBe('ASSESSOR_GABINETE');

    const deactivated = await userRepo.setAtivo(created.id, false);
    expect(deactivated.ativo).toBe(false);
  });
});

describe('RefreshTokenRepository', () => {
  it('cria, encontra por hash válido e revoga', async () => {
    const user = await userRepo.create({ nome: 'Bia Teste', telefone: '+5534999990002', role: 'CHEFE' });
    await refreshTokenRepo.create({
      userId: user.id,
      tokenHash: 'hash-abc',
      expiresAt: new Date(Date.now() + 60_000),
    });

    const found = await refreshTokenRepo.findValidByHash('hash-abc');
    expect(found?.userId).toBe(user.id);
    expect(found?.revokedAt).toBeNull();

    await refreshTokenRepo.revoke(found!.id);
    const afterRevoke = await refreshTokenRepo.findValidByHash('hash-abc');
    expect(afterRevoke?.revokedAt).not.toBeNull();
  });
});

describe('LoginAttemptRepository', () => {
  it('registra tentativas e conta falhas recentes', async () => {
    await loginAttemptRepo.record({ telefone: '+5534999990003', sucesso: false });
    await loginAttemptRepo.record({ telefone: '+5534999990003', sucesso: false });
    await loginAttemptRepo.record({ telefone: '+5534999990003', sucesso: true });

    const failures = await loginAttemptRepo.countRecentFailures('+5534999990003', 15 * 60 * 1000);
    expect(failures).toBe(2);
  });
});

describe('AuditLogRepository', () => {
  it('grava um registro de auditoria', async () => {
    const user = await userRepo.create({ nome: 'Chefe Teste', telefone: '+5534999990004', role: 'CHEFE' });
    await auditLogRepo.record({
      actorUserId: user.id,
      acao: 'CRIAR_USUARIO',
      entidade: 'User',
      entidadeId: user.id,
    });
    const count = await prisma.auditLog.count();
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 6: Rodar o teste de integração**

Pré-requisito: banco `gabinete_test` no ar (Task 2, Step 8 já aplicou as migrações nele).

Run: `cd backend && npx vitest run tests/integration/repositories.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 7: Commit**

```bash
git add backend/src/repositories backend/tests/integration/repositories.test.ts
git commit -m "feat(backend): repositorios de usuario, refresh token, tentativas de login e auditoria"
```

---

## Task 8: AuthService — login com bloqueio progressivo

**Files:**
- Create: `backend/src/services/auth.service.ts`
- Test: `backend/tests/unit/auth-service-login.test.ts`
- Test: `backend/tests/helpers/fakes.ts`

**Interfaces:**
- Consumes: `UserRepository`, `RefreshTokenRepository`, `LoginAttemptRepository`, `AuditLogRepository` (Task 7); `hashPin`, `verifyPin`, `isPinFormatValid`, `isPinObvious` (Task 5); `signAccessToken`, `verifyAccessToken`, `generateRefreshTokenValue`, `hashRefreshTokenValue` (Task 6).
- Produces:
```ts
export type LoginResult =
  | { status: 'ok'; accessToken: string; refreshToken: string; user: PublicUser }
  | { status: 'primeiro_acesso'; userId: string }
  | { status: 'bloqueado'; ate: Date }
  | { status: 'credenciais_invalidas' }
  | { status: 'inativo' };

export class AuthService {
  constructor(deps: {
    userRepo: UserRepository;
    refreshTokenRepo: RefreshTokenRepository;
    loginAttemptRepo: LoginAttemptRepository;
    auditLogRepo: AuditLogRepository;
  });
  login(input: { telefone: string; pin: string; ip?: string; userAgent?: string }): Promise<LoginResult>;
}
```
(Task 9 e Task 10 adicionam mais métodos à mesma classe.)

- [ ] **Step 1: Criar as fakes compartilhadas em `backend/tests/helpers/fakes.ts`**

```ts
import type { PublicUser, UserRepository } from '../../src/repositories/user.repository.js';
import type { RefreshTokenRepository } from '../../src/repositories/refresh-token.repository.js';
import type { LoginAttemptRepository } from '../../src/repositories/login-attempt.repository.js';
import type { AuditLogRepository } from '../../src/repositories/audit-log.repository.js';
import type { UserRoleValue } from '../../src/utils/jwt.js';
import { randomUUID } from 'node:crypto';

type StoredUser = PublicUser & { pinHash: string | null };

export function createFakeUserRepo(seed: StoredUser[] = []): UserRepository & { users: StoredUser[] } {
  const users = [...seed];
  return {
    users,
    async findByTelefone(telefone) {
      return users.find((u) => u.telefone === telefone) ?? null;
    },
    async findById(id) {
      return users.find((u) => u.id === id) ?? null;
    },
    async create({ nome, telefone, role }) {
      const now = new Date();
      const user: StoredUser = {
        id: randomUUID(),
        nome,
        telefone,
        role,
        ativo: true,
        pinDefinido: false,
        pinHash: null,
        createdAt: now,
        updatedAt: now,
      };
      users.push(user);
      return user;
    },
    async setPinHash(id, pinHash) {
      const user = users.find((u) => u.id === id);
      if (user) {
        user.pinHash = pinHash;
        user.pinDefinido = true;
      }
    },
    async clearPin(id) {
      const user = users.find((u) => u.id === id);
      if (user) {
        user.pinHash = null;
        user.pinDefinido = false;
      }
    },
    async updateRole(id, role) {
      const user = users.find((u) => u.id === id)!;
      user.role = role as UserRoleValue;
      return user;
    },
    async setAtivo(id, ativo) {
      const user = users.find((u) => u.id === id)!;
      user.ativo = ativo;
      return user;
    },
    async list(filter) {
      return filter?.ativo === undefined ? users : users.filter((u) => u.ativo === filter.ativo);
    },
  };
}

export function createFakeRefreshTokenRepo(): RefreshTokenRepository & {
  tokens: { id: string; userId: string; tokenHash: string; expiresAt: Date; revokedAt: Date | null }[];
} {
  const tokens: { id: string; userId: string; tokenHash: string; expiresAt: Date; revokedAt: Date | null }[] = [];
  return {
    tokens,
    async create({ userId, tokenHash, expiresAt }) {
      tokens.push({ id: randomUUID(), userId, tokenHash, expiresAt, revokedAt: null });
    },
    async findValidByHash(tokenHash) {
      return tokens.find((t) => t.tokenHash === tokenHash) ?? null;
    },
    async revoke(id) {
      const token = tokens.find((t) => t.id === id);
      if (token) token.revokedAt = new Date();
    },
    async revokeAllForUser(userId) {
      for (const t of tokens) {
        if (t.userId === userId && !t.revokedAt) t.revokedAt = new Date();
      }
    },
  };
}

export function createFakeLoginAttemptRepo(): LoginAttemptRepository & {
  attempts: { telefone: string; sucesso: boolean; createdAt: Date }[];
} {
  const attempts: { telefone: string; sucesso: boolean; createdAt: Date }[] = [];
  return {
    attempts,
    async record({ telefone, sucesso }) {
      attempts.push({ telefone, sucesso, createdAt: new Date() });
    },
    async countRecentFailures(telefone, sinceMs) {
      const limite = Date.now() - sinceMs;
      return attempts.filter((a) => a.telefone === telefone && !a.sucesso && a.createdAt.getTime() >= limite).length;
    },
  };
}

export function createFakeAuditLogRepo(): AuditLogRepository & { records: unknown[] } {
  const records: unknown[] = [];
  return {
    records,
    async record(data) {
      records.push(data);
    },
  };
}
```

- [ ] **Step 2: Escrever os testes de login**

```ts
import { describe, it, expect } from 'vitest';
import { AuthService } from '../../src/services/auth.service.js';
import { hashPin } from '../../src/utils/pin.js';
import {
  createFakeUserRepo,
  createFakeRefreshTokenRepo,
  createFakeLoginAttemptRepo,
  createFakeAuditLogRepo,
} from '../helpers/fakes.js';

async function buildService(seedUsers: Awaited<ReturnType<typeof buildSeedUser>>[] = []) {
  const userRepo = createFakeUserRepo(seedUsers);
  const refreshTokenRepo = createFakeRefreshTokenRepo();
  const loginAttemptRepo = createFakeLoginAttemptRepo();
  const auditLogRepo = createFakeAuditLogRepo();
  const service = new AuthService({ userRepo, refreshTokenRepo, loginAttemptRepo, auditLogRepo });
  return { service, userRepo, refreshTokenRepo, loginAttemptRepo, auditLogRepo };
}

async function buildSeedUser(overrides: Partial<{ pin: string; role: 'CHEFE' | 'ASSESSOR_RUA' | 'ASSESSOR_GABINETE'; ativo: boolean; pinDefinido: boolean }> = {}) {
  const pin = overrides.pin ?? '482913';
  return {
    id: 'user-1',
    nome: 'Assessor Teste',
    telefone: '+5534999990001',
    role: overrides.role ?? 'ASSESSOR_RUA',
    ativo: overrides.ativo ?? true,
    pinDefinido: overrides.pinDefinido ?? true,
    pinHash: overrides.pinDefinido === false ? null : await hashPin(pin),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('AuthService.login', () => {
  it('retorna ok com tokens quando telefone e PIN estão corretos', async () => {
    const user = await buildSeedUser();
    const { service } = await buildService([user]);

    const result = await service.login({ telefone: user.telefone, pin: '482913' });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.user.id).toBe('user-1');
      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');
    }
  });

  it('retorna credenciais_invalidas quando o PIN está errado', async () => {
    const user = await buildSeedUser();
    const { service } = await buildService([user]);

    const result = await service.login({ telefone: user.telefone, pin: '000001' });
    expect(result.status).toBe('credenciais_invalidas');
  });

  it('retorna credenciais_invalidas quando o telefone não existe', async () => {
    const { service } = await buildService([]);
    const result = await service.login({ telefone: '+5534900000000', pin: '482913' });
    expect(result.status).toBe('credenciais_invalidas');
  });

  it('retorna inativo quando o usuário está desativado', async () => {
    const user = await buildSeedUser({ ativo: false });
    const { service } = await buildService([user]);
    const result = await service.login({ telefone: user.telefone, pin: '482913' });
    expect(result.status).toBe('inativo');
  });

  it('retorna primeiro_acesso quando o usuário ainda não definiu PIN', async () => {
    const user = await buildSeedUser({ pinDefinido: false });
    const { service } = await buildService([user]);
    const result = await service.login({ telefone: user.telefone, pin: '000000' });
    expect(result.status).toBe('primeiro_acesso');
    if (result.status === 'primeiro_acesso') {
      expect(result.userId).toBe('user-1');
    }
  });

  it('bloqueia após 5 tentativas incorretas em 15 minutos', async () => {
    const user = await buildSeedUser();
    const { service } = await buildService([user]);

    for (let i = 0; i < 5; i++) {
      await service.login({ telefone: user.telefone, pin: '000001' });
    }

    const result = await service.login({ telefone: user.telefone, pin: '482913' });
    expect(result.status).toBe('bloqueado');
  });

  it('registra cada tentativa de login', async () => {
    const user = await buildSeedUser();
    const { service, loginAttemptRepo } = await buildService([user]);

    await service.login({ telefone: user.telefone, pin: '482913' });
    await service.login({ telefone: user.telefone, pin: '000001' });

    expect(loginAttemptRepo.attempts).toHaveLength(2);
    expect(loginAttemptRepo.attempts[0]?.sucesso).toBe(true);
    expect(loginAttemptRepo.attempts[1]?.sucesso).toBe(false);
  });
});
```

- [ ] **Step 3: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/unit/auth-service-login.test.ts`
Expected: FAIL — `src/services/auth.service.ts` não existe.

- [ ] **Step 4: Implementar `backend/src/services/auth.service.ts` (parte de login)**

```ts
import type { UserRepository, PublicUser } from '../repositories/user.repository.js';
import type { RefreshTokenRepository } from '../repositories/refresh-token.repository.js';
import type { LoginAttemptRepository } from '../repositories/login-attempt.repository.js';
import type { AuditLogRepository } from '../repositories/audit-log.repository.js';
import { verifyPin } from '../utils/pin.js';
import { signAccessToken, generateRefreshTokenValue, hashRefreshTokenValue } from '../utils/jwt.js';

const JANELA_BLOQUEIO_MS = 15 * 60 * 1000;
const LIMITE_TENTATIVAS = 5;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type LoginResult =
  | { status: 'ok'; accessToken: string; refreshToken: string; user: PublicUser }
  | { status: 'primeiro_acesso'; userId: string }
  | { status: 'bloqueado'; ate: Date }
  | { status: 'credenciais_invalidas' }
  | { status: 'inativo' };

export class AuthService {
  private userRepo: UserRepository;
  private refreshTokenRepo: RefreshTokenRepository;
  private loginAttemptRepo: LoginAttemptRepository;
  private auditLogRepo: AuditLogRepository;

  constructor(deps: {
    userRepo: UserRepository;
    refreshTokenRepo: RefreshTokenRepository;
    loginAttemptRepo: LoginAttemptRepository;
    auditLogRepo: AuditLogRepository;
  }) {
    this.userRepo = deps.userRepo;
    this.refreshTokenRepo = deps.refreshTokenRepo;
    this.loginAttemptRepo = deps.loginAttemptRepo;
    this.auditLogRepo = deps.auditLogRepo;
  }

  async login(input: { telefone: string; pin: string; ip?: string; userAgent?: string }): Promise<LoginResult> {
    const falhasRecentes = await this.loginAttemptRepo.countRecentFailures(input.telefone, JANELA_BLOQUEIO_MS);
    if (falhasRecentes >= LIMITE_TENTATIVAS) {
      return { status: 'bloqueado', ate: new Date(Date.now() + JANELA_BLOQUEIO_MS) };
    }

    const user = await this.userRepo.findByTelefone(input.telefone);

    if (!user) {
      await this.loginAttemptRepo.record({ telefone: input.telefone, sucesso: false, ip: input.ip, userAgent: input.userAgent });
      return { status: 'credenciais_invalidas' };
    }

    if (!user.ativo) {
      await this.loginAttemptRepo.record({ telefone: input.telefone, sucesso: false, ip: input.ip, userAgent: input.userAgent });
      return { status: 'inativo' };
    }

    if (!user.pinDefinido || !user.pinHash) {
      return { status: 'primeiro_acesso', userId: user.id };
    }

    const pinValido = await verifyPin(input.pin, user.pinHash);
    if (!pinValido) {
      await this.loginAttemptRepo.record({ telefone: input.telefone, sucesso: false, ip: input.ip, userAgent: input.userAgent });
      return { status: 'credenciais_invalidas' };
    }

    await this.loginAttemptRepo.record({ telefone: input.telefone, sucesso: true, ip: input.ip, userAgent: input.userAgent });

    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    const refreshTokenValue = generateRefreshTokenValue();
    await this.refreshTokenRepo.create({
      userId: user.id,
      tokenHash: hashRefreshTokenValue(refreshTokenValue),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      createdByIp: input.ip,
    });

    const { pinHash: _pinHash, ...publicUser } = user;
    return { status: 'ok', accessToken, refreshToken: refreshTokenValue, user: publicUser };
  }
}
```

- [ ] **Step 5: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/unit/auth-service-login.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/auth.service.ts backend/tests/unit/auth-service-login.test.ts backend/tests/helpers/fakes.ts
git commit -m "feat(backend): AuthService.login com bloqueio progressivo"
```

---

## Task 9: AuthService — refresh (rotativo) e logout

**Files:**
- Modify: `backend/src/services/auth.service.ts`
- Test: `backend/tests/unit/auth-service-refresh.test.ts`

**Interfaces:**
- Produces (adiciona à classe `AuthService`):
```ts
export type RefreshResult =
  | { status: 'ok'; accessToken: string; refreshToken: string }
  | { status: 'invalido' }
  | { status: 'usuario_inativo' };

refresh(input: { refreshToken: string; ip?: string }): Promise<RefreshResult>;
logout(input: { refreshToken: string }): Promise<void>;
```

- [ ] **Step 1: Escrever os testes**

```ts
import { describe, it, expect } from 'vitest';
import { AuthService } from '../../src/services/auth.service.js';
import { hashPin } from '../../src/utils/pin.js';
import {
  createFakeUserRepo,
  createFakeRefreshTokenRepo,
  createFakeLoginAttemptRepo,
  createFakeAuditLogRepo,
} from '../helpers/fakes.js';

async function buildService() {
  const pinHash = await hashPin('482913');
  const user = {
    id: 'user-1',
    nome: 'Assessor Teste',
    telefone: '+5534999990001',
    role: 'ASSESSOR_RUA' as const,
    ativo: true,
    pinDefinido: true,
    pinHash,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const userRepo = createFakeUserRepo([user]);
  const refreshTokenRepo = createFakeRefreshTokenRepo();
  const loginAttemptRepo = createFakeLoginAttemptRepo();
  const auditLogRepo = createFakeAuditLogRepo();
  const service = new AuthService({ userRepo, refreshTokenRepo, loginAttemptRepo, auditLogRepo });
  return { service, userRepo, refreshTokenRepo, user };
}

describe('AuthService.refresh', () => {
  it('gira o refresh token: revoga o antigo e emite um novo par', async () => {
    const { service, refreshTokenRepo } = await buildService();
    const login = await service.login({ telefone: '+5534999990001', pin: '482913' });
    if (login.status !== 'ok') throw new Error('login deveria ter sucesso');

    const refreshed = await service.refresh({ refreshToken: login.refreshToken });
    expect(refreshed.status).toBe('ok');
    if (refreshed.status === 'ok') {
      expect(refreshed.refreshToken).not.toBe(login.refreshToken);
    }

    const tentativaReuso = await service.refresh({ refreshToken: login.refreshToken });
    expect(tentativaReuso.status).toBe('invalido');
    expect(refreshTokenRepo.tokens.filter((t) => t.revokedAt)).toHaveLength(1);
  });

  it('retorna invalido para um refresh token desconhecido', async () => {
    const { service } = await buildService();
    const result = await service.refresh({ refreshToken: 'token-que-nao-existe' });
    expect(result.status).toBe('invalido');
  });

  it('retorna usuario_inativo se o usuário foi desativado após o login', async () => {
    const { service, userRepo } = await buildService();
    const login = await service.login({ telefone: '+5534999990001', pin: '482913' });
    if (login.status !== 'ok') throw new Error('login deveria ter sucesso');

    await userRepo.setAtivo('user-1', false);

    const refreshed = await service.refresh({ refreshToken: login.refreshToken });
    expect(refreshed.status).toBe('usuario_inativo');
  });
});

describe('AuthService.logout', () => {
  it('revoga o refresh token informado', async () => {
    const { service, refreshTokenRepo } = await buildService();
    const login = await service.login({ telefone: '+5534999990001', pin: '482913' });
    if (login.status !== 'ok') throw new Error('login deveria ter sucesso');

    await service.logout({ refreshToken: login.refreshToken });

    const afterLogout = await service.refresh({ refreshToken: login.refreshToken });
    expect(afterLogout.status).toBe('invalido');
    expect(refreshTokenRepo.tokens.filter((t) => t.revokedAt)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/unit/auth-service-refresh.test.ts`
Expected: FAIL — `refresh`/`logout` não existem em `AuthService`.

- [ ] **Step 3: Adicionar os métodos em `backend/src/services/auth.service.ts`**

Adicionar ao topo do arquivo (junto aos outros imports):

```ts
import { hashRefreshTokenValue as _unusedAlreadyImported } from '../utils/jwt.js';
```

(Ignorar o import acima — `hashRefreshTokenValue` e `generateRefreshTokenValue` já foram importados na Task 8; não duplicar a linha.)

Adicionar os tipos logo abaixo de `LoginResult`:

```ts
export type RefreshResult =
  | { status: 'ok'; accessToken: string; refreshToken: string }
  | { status: 'invalido' }
  | { status: 'usuario_inativo' };
```

Adicionar os métodos dentro da classe `AuthService`, depois de `login`:

```ts
  async refresh(input: { refreshToken: string; ip?: string }): Promise<RefreshResult> {
    const tokenHash = hashRefreshTokenValue(input.refreshToken);
    const stored = await this.refreshTokenRepo.findValidByHash(tokenHash);

    if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      return { status: 'invalido' };
    }

    const user = await this.userRepo.findById(stored.userId);
    if (!user || !user.ativo) {
      await this.refreshTokenRepo.revoke(stored.id);
      return { status: 'usuario_inativo' };
    }

    await this.refreshTokenRepo.revoke(stored.id);

    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    const newRefreshValue = generateRefreshTokenValue();
    await this.refreshTokenRepo.create({
      userId: user.id,
      tokenHash: hashRefreshTokenValue(newRefreshValue),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      createdByIp: input.ip,
    });

    return { status: 'ok', accessToken, refreshToken: newRefreshValue };
  }

  async logout(input: { refreshToken: string }): Promise<void> {
    const tokenHash = hashRefreshTokenValue(input.refreshToken);
    const stored = await this.refreshTokenRepo.findValidByHash(tokenHash);
    if (stored && !stored.revokedAt) {
      await this.refreshTokenRepo.revoke(stored.id);
    }
  }
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/unit/auth-service-refresh.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Rodar toda a suíte unitária de novo para garantir que nada quebrou**

Run: `cd backend && npx vitest run tests/unit`
Expected: PASS (todos os testes das Tasks 4–9).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/auth.service.ts backend/tests/unit/auth-service-refresh.test.ts
git commit -m "feat(backend): AuthService.refresh rotativo e logout"
```

---

## Task 10: AuthService — primeiro acesso, troca de PIN e recuperação pelo chefe

**Files:**
- Modify: `backend/src/services/auth.service.ts`
- Test: `backend/tests/unit/auth-service-pin-flows.test.ts`

**Interfaces:**
- Produces (adiciona à classe `AuthService`):
```ts
export type DefinirPinResult =
  | { status: 'ok'; accessToken: string; refreshToken: string; user: PublicUser }
  | { status: 'pin_invalido'; motivo: 'formato' | 'obvio' }
  | { status: 'usuario_nao_encontrado' };

export type TrocarPinResult =
  | { status: 'ok' }
  | { status: 'pin_atual_incorreto' }
  | { status: 'pin_novo_invalido'; motivo: 'formato' | 'obvio' };

definirPinInicial(input: { userId: string; novoPin: string; ip?: string }): Promise<DefinirPinResult>;
trocarPin(input: { userId: string; pinAtual: string; novoPin: string }): Promise<TrocarPinResult>;
resetarAcesso(input: { chefeId: string; userId: string }): Promise<void>;
```

- [ ] **Step 1: Escrever os testes**

```ts
import { describe, it, expect } from 'vitest';
import { AuthService } from '../../src/services/auth.service.js';
import { hashPin } from '../../src/utils/pin.js';
import {
  createFakeUserRepo,
  createFakeRefreshTokenRepo,
  createFakeLoginAttemptRepo,
  createFakeAuditLogRepo,
} from '../helpers/fakes.js';

async function buildService() {
  const userRepo = createFakeUserRepo([
    {
      id: 'user-novo',
      nome: 'Assessor Novo',
      telefone: '+5534999990010',
      role: 'ASSESSOR_RUA',
      ativo: true,
      pinDefinido: false,
      pinHash: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'user-com-pin',
      nome: 'Assessor Com Pin',
      telefone: '+5534999990011',
      role: 'ASSESSOR_GABINETE',
      ativo: true,
      pinDefinido: true,
      pinHash: await hashPin('482913'),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  const refreshTokenRepo = createFakeRefreshTokenRepo();
  const loginAttemptRepo = createFakeLoginAttemptRepo();
  const auditLogRepo = createFakeAuditLogRepo();
  const service = new AuthService({ userRepo, refreshTokenRepo, loginAttemptRepo, auditLogRepo });
  return { service, userRepo, auditLogRepo };
}

describe('AuthService.definirPinInicial', () => {
  it('define o PIN e já retorna tokens de sessão', async () => {
    const { service } = await buildService();
    const result = await service.definirPinInicial({ userId: 'user-novo', novoPin: '482913' });
    expect(result.status).toBe('ok');
  });

  it('rejeita PIN com formato inválido', async () => {
    const { service } = await buildService();
    const result = await service.definirPinInicial({ userId: 'user-novo', novoPin: '12' });
    expect(result).toEqual({ status: 'pin_invalido', motivo: 'formato' });
  });

  it('rejeita PIN óbvio', async () => {
    const { service } = await buildService();
    const result = await service.definirPinInicial({ userId: 'user-novo', novoPin: '123456' });
    expect(result).toEqual({ status: 'pin_invalido', motivo: 'obvio' });
  });
});

describe('AuthService.trocarPin', () => {
  it('troca o PIN quando o atual está correto e o novo é válido', async () => {
    const { service } = await buildService();
    const result = await service.trocarPin({ userId: 'user-com-pin', pinAtual: '482913', novoPin: '739284' });
    expect(result).toEqual({ status: 'ok' });
  });

  it('rejeita quando o PIN atual está incorreto', async () => {
    const { service } = await buildService();
    const result = await service.trocarPin({ userId: 'user-com-pin', pinAtual: '000000', novoPin: '739284' });
    expect(result).toEqual({ status: 'pin_atual_incorreto' });
  });

  it('rejeita novo PIN óbvio mesmo com PIN atual correto', async () => {
    const { service } = await buildService();
    const result = await service.trocarPin({ userId: 'user-com-pin', pinAtual: '482913', novoPin: '000000' });
    expect(result).toEqual({ status: 'pin_novo_invalido', motivo: 'obvio' });
  });
});

describe('AuthService.resetarAcesso', () => {
  it('limpa o PIN do usuário, forçando novo primeiro acesso, e grava auditoria', async () => {
    const { service, userRepo, auditLogRepo } = await buildService();
    await service.resetarAcesso({ chefeId: 'chefe-1', userId: 'user-com-pin' });

    const user = await userRepo.findById('user-com-pin');
    expect(user?.pinDefinido).toBe(false);
    expect(user?.pinHash).toBeNull();
    expect(auditLogRepo.records).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/unit/auth-service-pin-flows.test.ts`
Expected: FAIL — métodos ainda não existem.

- [ ] **Step 3: Adicionar os tipos e métodos em `backend/src/services/auth.service.ts`**

Adicionar imports no topo:

```ts
import { hashPin, verifyPin, isPinFormatValid, isPinObvious } from '../utils/pin.js';
```

(Substituir o import existente `import { verifyPin } from '../utils/pin.js';` da Task 8 por essa linha completa.)

Adicionar os tipos, junto aos outros:

```ts
export type DefinirPinResult =
  | { status: 'ok'; accessToken: string; refreshToken: string; user: PublicUser }
  | { status: 'pin_invalido'; motivo: 'formato' | 'obvio' }
  | { status: 'usuario_nao_encontrado' };

export type TrocarPinResult =
  | { status: 'ok' }
  | { status: 'pin_atual_incorreto' }
  | { status: 'pin_novo_invalido'; motivo: 'formato' | 'obvio' };
```

Adicionar os métodos na classe `AuthService`, depois de `logout`:

```ts
  private validarNovoPin(pin: string): { status: 'pin_invalido'; motivo: 'formato' | 'obvio' } | null {
    if (!isPinFormatValid(pin)) return { status: 'pin_invalido', motivo: 'formato' };
    if (isPinObvious(pin)) return { status: 'pin_invalido', motivo: 'obvio' };
    return null;
  }

  async definirPinInicial(input: { userId: string; novoPin: string; ip?: string }): Promise<DefinirPinResult> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) return { status: 'usuario_nao_encontrado' };

    const erroFormato = this.validarNovoPin(input.novoPin);
    if (erroFormato) return erroFormato;

    const pinHash = await hashPin(input.novoPin);
    await this.userRepo.setPinHash(user.id, pinHash);

    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    const refreshTokenValue = generateRefreshTokenValue();
    await this.refreshTokenRepo.create({
      userId: user.id,
      tokenHash: hashRefreshTokenValue(refreshTokenValue),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      createdByIp: input.ip,
    });

    return { status: 'ok', accessToken, refreshToken: refreshTokenValue, user: { ...user, pinDefinido: true } };
  }

  async trocarPin(input: { userId: string; pinAtual: string; novoPin: string }): Promise<TrocarPinResult> {
    const user = await this.userRepo.findById(input.userId);
    if (!user || !user.pinHash || !(await verifyPin(input.pinAtual, user.pinHash))) {
      return { status: 'pin_atual_incorreto' };
    }

    const erroFormato = this.validarNovoPin(input.novoPin);
    if (erroFormato) return { status: 'pin_novo_invalido', motivo: erroFormato.motivo };

    const novoPinHash = await hashPin(input.novoPin);
    await this.userRepo.setPinHash(user.id, novoPinHash);
    return { status: 'ok' };
  }

  async resetarAcesso(input: { chefeId: string; userId: string }): Promise<void> {
    await this.userRepo.clearPin(input.userId);
    await this.refreshTokenRepo.revokeAllForUser(input.userId);
    await this.auditLogRepo.record({
      actorUserId: input.chefeId,
      acao: 'RESETAR_ACESSO',
      entidade: 'User',
      entidadeId: input.userId,
    });
  }
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/unit/auth-service-pin-flows.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Rodar a suíte unitária inteira**

Run: `cd backend && npx vitest run tests/unit`
Expected: PASS (todos os testes).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/auth.service.ts backend/tests/unit/auth-service-pin-flows.test.ts
git commit -m "feat(backend): primeiro acesso, troca de PIN e recuperacao de acesso pelo chefe"
```

---

## Task 11: UserService — chefe gerencia assessores

**Files:**
- Create: `backend/src/services/user.service.ts`
- Test: `backend/tests/unit/user-service.test.ts`

**Interfaces:**
- Consumes: `UserRepository`, `AuditLogRepository` (Task 7); `isValidBrazilianPhone`, `normalizePhone` (Task 4).
- Produces:
```ts
export type CriarAssessorResult =
  | { status: 'ok'; user: PublicUser }
  | { status: 'telefone_invalido' }
  | { status: 'telefone_duplicado' };

export class UserService {
  constructor(deps: { userRepo: UserRepository; auditLogRepo: AuditLogRepository });
  criarAssessor(input: { nome: string; telefone: string; role: UserRoleValue; criadoPorId: string }): Promise<CriarAssessorResult>;
  listar(filter?: { ativo?: boolean }): Promise<PublicUser[]>;
  atualizarRole(input: { userId: string; novoRole: UserRoleValue; atualizadoPorId: string }): Promise<PublicUser>;
  definirAtivo(input: { userId: string; ativo: boolean; atualizadoPorId: string }): Promise<PublicUser>;
}
```

- [ ] **Step 1: Escrever os testes**

```ts
import { describe, it, expect } from 'vitest';
import { UserService } from '../../src/services/user.service.js';
import { createFakeUserRepo, createFakeAuditLogRepo } from '../helpers/fakes.js';

function buildService() {
  const userRepo = createFakeUserRepo();
  const auditLogRepo = createFakeAuditLogRepo();
  const service = new UserService({ userRepo, auditLogRepo });
  return { service, userRepo, auditLogRepo };
}

describe('UserService.criarAssessor', () => {
  it('cria um assessor com telefone normalizado', async () => {
    const { service, auditLogRepo } = buildService();
    const result = await service.criarAssessor({
      nome: 'Carlos Assessor',
      telefone: '(34) 99999-1234',
      role: 'ASSESSOR_RUA',
      criadoPorId: 'chefe-1',
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.user.telefone).toBe('+5534999991234');
    }
    expect(auditLogRepo.records).toHaveLength(1);
  });

  it('rejeita telefone com formato inválido', async () => {
    const { service } = buildService();
    const result = await service.criarAssessor({
      nome: 'Carlos Assessor',
      telefone: '123',
      role: 'ASSESSOR_RUA',
      criadoPorId: 'chefe-1',
    });
    expect(result.status).toBe('telefone_invalido');
  });

  it('rejeita telefone já cadastrado', async () => {
    const { service } = buildService();
    await service.criarAssessor({
      nome: 'Carlos Assessor',
      telefone: '(34) 99999-1234',
      role: 'ASSESSOR_RUA',
      criadoPorId: 'chefe-1',
    });
    const result = await service.criarAssessor({
      nome: 'Outro Nome',
      telefone: '(34) 99999-1234',
      role: 'ASSESSOR_GABINETE',
      criadoPorId: 'chefe-1',
    });
    expect(result.status).toBe('telefone_duplicado');
  });
});

describe('UserService.listar / atualizarRole / definirAtivo', () => {
  it('lista, atualiza papel e desativa um usuário', async () => {
    const { service } = buildService();
    const criado = await service.criarAssessor({
      nome: 'Dani Assessora',
      telefone: '(34) 98888-4321',
      role: 'ASSESSOR_RUA',
      criadoPorId: 'chefe-1',
    });
    if (criado.status !== 'ok') throw new Error('esperava ok');

    const lista = await service.listar();
    expect(lista).toHaveLength(1);

    const atualizado = await service.atualizarRole({
      userId: criado.user.id,
      novoRole: 'ASSESSOR_GABINETE',
      atualizadoPorId: 'chefe-1',
    });
    expect(atualizado.role).toBe('ASSESSOR_GABINETE');

    const desativado = await service.definirAtivo({
      userId: criado.user.id,
      ativo: false,
      atualizadoPorId: 'chefe-1',
    });
    expect(desativado.ativo).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/unit/user-service.test.ts`
Expected: FAIL — `src/services/user.service.ts` não existe.

- [ ] **Step 3: Implementar `backend/src/services/user.service.ts`**

```ts
import type { UserRepository, PublicUser } from '../repositories/user.repository.js';
import type { AuditLogRepository } from '../repositories/audit-log.repository.js';
import type { UserRoleValue } from '../utils/jwt.js';
import { isValidBrazilianPhone, normalizePhone } from '../utils/phone.js';

export type CriarAssessorResult =
  | { status: 'ok'; user: PublicUser }
  | { status: 'telefone_invalido' }
  | { status: 'telefone_duplicado' };

export class UserService {
  private userRepo: UserRepository;
  private auditLogRepo: AuditLogRepository;

  constructor(deps: { userRepo: UserRepository; auditLogRepo: AuditLogRepository }) {
    this.userRepo = deps.userRepo;
    this.auditLogRepo = deps.auditLogRepo;
  }

  async criarAssessor(input: {
    nome: string;
    telefone: string;
    role: UserRoleValue;
    criadoPorId: string;
  }): Promise<CriarAssessorResult> {
    if (!isValidBrazilianPhone(input.telefone)) {
      return { status: 'telefone_invalido' };
    }

    const telefoneNormalizado = normalizePhone(input.telefone);
    const existente = await this.userRepo.findByTelefone(telefoneNormalizado);
    if (existente) {
      return { status: 'telefone_duplicado' };
    }

    const user = await this.userRepo.create({ nome: input.nome, telefone: telefoneNormalizado, role: input.role });

    await this.auditLogRepo.record({
      actorUserId: input.criadoPorId,
      acao: 'CRIAR_USUARIO',
      entidade: 'User',
      entidadeId: user.id,
      detalhes: { role: input.role },
    });

    return { status: 'ok', user };
  }

  async listar(filter?: { ativo?: boolean }): Promise<PublicUser[]> {
    return this.userRepo.list(filter);
  }

  async atualizarRole(input: { userId: string; novoRole: UserRoleValue; atualizadoPorId: string }): Promise<PublicUser> {
    const user = await this.userRepo.updateRole(input.userId, input.novoRole);
    await this.auditLogRepo.record({
      actorUserId: input.atualizadoPorId,
      acao: 'ATUALIZAR_ROLE',
      entidade: 'User',
      entidadeId: input.userId,
      detalhes: { novoRole: input.novoRole },
    });
    return user;
  }

  async definirAtivo(input: { userId: string; ativo: boolean; atualizadoPorId: string }): Promise<PublicUser> {
    const user = await this.userRepo.setAtivo(input.userId, input.ativo);
    await this.auditLogRepo.record({
      actorUserId: input.atualizadoPorId,
      acao: input.ativo ? 'ATIVAR_USUARIO' : 'DESATIVAR_USUARIO',
      entidade: 'User',
      entidadeId: input.userId,
    });
    return user;
  }
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/unit/user-service.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/user.service.ts backend/tests/unit/user-service.test.ts
git commit -m "feat(backend): UserService para o chefe gerenciar assessores"
```

---

## Task 12: Middlewares (autenticação, papel, erros, IP) e validators Zod

**Files:**
- Create: `backend/src/utils/request-ip.ts`
- Create: `backend/src/middlewares/authenticate.ts`
- Create: `backend/src/middlewares/require-role.ts`
- Create: `backend/src/middlewares/error-handler.ts`
- Create: `backend/src/validators/auth.validators.ts`
- Create: `backend/src/validators/user.validators.ts`
- Test: `backend/tests/integration/middlewares.test.ts`

**Interfaces:**
- Produces: `getClientIp(req: Request): string`; `authenticate(deps: { userRepo: UserRepository }): RequestHandler` (anexa `req.user = { id, role }`); `requireRole(...roles: UserRoleValue[]): RequestHandler`; `errorHandler: ErrorRequestHandler`; `class HttpError extends Error { status: number }`; schemas Zod `loginSchema`, `definirPinSchema`, `trocarPinSchema`, `criarUsuarioSchema`, `atualizarRoleSchema`, `definirAtivoSchema`.
- Consumes: `verifyAccessToken` (Task 6), `UserRepository` (Task 7).

- [ ] **Step 1: Implementar `backend/src/utils/request-ip.ts`**

```ts
import type { Request } from 'express';

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]!.trim();
  }
  return req.ip ?? 'desconhecido';
}
```

- [ ] **Step 2: Implementar `backend/src/middlewares/error-handler.ts`**

```ts
import type { ErrorRequestHandler } from 'express';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ success: false, error: err.message });
    return;
  }
  console.error('Erro não tratado:', err instanceof Error ? err.message : err);
  res.status(500).json({ success: false, error: 'Erro interno do servidor' });
};
```

- [ ] **Step 3: Implementar `backend/src/middlewares/authenticate.ts`**

```ts
import type { RequestHandler } from 'express';
import type { UserRepository } from '../repositories/user.repository.js';
import type { UserRoleValue } from '../utils/jwt.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { HttpError } from './error-handler.js';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: UserRoleValue };
    }
  }
}

export function authenticate(deps: { userRepo: UserRepository }): RequestHandler {
  return async (req, _res, next) => {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) {
        throw new HttpError(401, 'Token de acesso ausente');
      }
      const token = header.slice('Bearer '.length);
      const payload = verifyAccessToken(token);

      const user = await deps.userRepo.findById(payload.sub);
      if (!user || !user.ativo) {
        throw new HttpError(401, 'Sessão inválida ou usuário desativado');
      }

      req.user = { id: user.id, role: user.role };
      next();
    } catch (err) {
      if (err instanceof HttpError) {
        next(err);
      } else {
        next(new HttpError(401, 'Token de acesso inválido'));
      }
    }
  };
}
```

- [ ] **Step 4: Implementar `backend/src/middlewares/require-role.ts`**

```ts
import type { RequestHandler } from 'express';
import type { UserRoleValue } from '../utils/jwt.js';
import { HttpError } from './error-handler.js';

export function requireRole(...roles: UserRoleValue[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new HttpError(403, 'Acesso não permitido para este perfil'));
      return;
    }
    next();
  };
}
```

- [ ] **Step 5: Implementar `backend/src/validators/auth.validators.ts`**

```ts
import { z } from 'zod';

export const loginSchema = z.object({
  telefone: z.string().min(10),
  pin: z.string().length(6),
});

export const definirPinSchema = z.object({
  userId: z.string().uuid(),
  novoPin: z.string().length(6),
});

export const trocarPinSchema = z.object({
  pinAtual: z.string().length(6),
  novoPin: z.string().length(6),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});
```

- [ ] **Step 6: Implementar `backend/src/validators/user.validators.ts`**

```ts
import { z } from 'zod';

export const criarUsuarioSchema = z.object({
  nome: z.string().min(2),
  telefone: z.string().min(10),
  role: z.enum(['CHEFE', 'ASSESSOR_RUA', 'ASSESSOR_GABINETE']),
});

export const atualizarRoleSchema = z.object({
  role: z.enum(['CHEFE', 'ASSESSOR_RUA', 'ASSESSOR_GABINETE']),
});

export const definirAtivoSchema = z.object({
  ativo: z.boolean(),
});
```

- [ ] **Step 7: Escrever o teste de integração dos middlewares**

```ts
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
```

- [ ] **Step 8: Rodar os testes**

Run: `cd backend && npx vitest run tests/integration/middlewares.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 9: Commit**

```bash
git add backend/src/utils/request-ip.ts backend/src/middlewares backend/src/validators backend/tests/integration/middlewares.test.ts
git commit -m "feat(backend): middlewares de autenticacao/papel/erros e validators Zod"
```

---

## Task 13: Rotas e controllers de autenticação (integração ponta a ponta)

**Files:**
- Create: `backend/src/controllers/auth.controller.ts`
- Create: `backend/src/routes/auth.routes.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/integration/auth.routes.test.ts`
- Test: `backend/tests/helpers/reset-db.ts`

**Interfaces:**
- Consumes: `AuthService` (Tasks 8–10), validators (Task 12), `authenticate`/`errorHandler` (Task 12), `getClientIp` (Task 12).
- Produces: rotas HTTP —
  - `POST /auth/login` `{ telefone, pin }` → `200 { status, accessToken?, user? }` (refresh token vai em cookie httpOnly `refreshToken`) | `401` para credenciais inválidas/bloqueado/inativo.
  - `POST /auth/primeiro-acesso` `{ userId, novoPin }` → `200` com tokens.
  - `POST /auth/refresh` (lê cookie) → `200` com novo `accessToken` + novo cookie.
  - `POST /auth/logout` (lê cookie) → `204`, limpa o cookie.
  - `POST /auth/trocar-pin` (autenticado) `{ pinAtual, novoPin }` → `200`.
  - `POST /auth/usuarios/:id/resetar-acesso` (autenticado, só `CHEFE`) → `200`.

- [ ] **Step 1: Instalar `cookie-parser`**

Run: `cd backend && npm install cookie-parser && npm install -D @types/cookie-parser`

- [ ] **Step 2: Implementar `backend/src/controllers/auth.controller.ts`**

```ts
import type { Request, Response } from 'express';
import type { AuthService } from '../services/auth.service.js';
import { loginSchema, definirPinSchema, trocarPinSchema } from '../validators/auth.validators.js';
import { getClientIp } from '../utils/request-ip.js';
import { HttpError } from '../middlewares/error-handler.js';

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function setRefreshCookie(res: Response, value: string) {
  res.cookie(REFRESH_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    path: '/auth',
  });
}

export function createAuthController(authService: AuthService) {
  return {
    async login(req: Request, res: Response) {
      const input = loginSchema.parse(req.body);
      const result = await authService.login({
        telefone: input.telefone,
        pin: input.pin,
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'],
      });

      if (result.status === 'ok') {
        setRefreshCookie(res, result.refreshToken);
        res.json({ success: true, data: { status: 'ok', accessToken: result.accessToken, user: result.user } });
        return;
      }
      if (result.status === 'primeiro_acesso') {
        res.json({ success: true, data: { status: 'primeiro_acesso', userId: result.userId } });
        return;
      }
      if (result.status === 'bloqueado') {
        res.status(429).json({ success: false, error: 'Muitas tentativas. Tente novamente mais tarde.', data: { ate: result.ate } });
        return;
      }
      res.status(401).json({ success: false, error: 'Telefone ou PIN incorretos, ou usuário inativo.' });
    },

    async primeiroAcesso(req: Request, res: Response) {
      const input = definirPinSchema.parse(req.body);
      const result = await authService.definirPinInicial({
        userId: input.userId,
        novoPin: input.novoPin,
        ip: getClientIp(req),
      });

      if (result.status === 'ok') {
        setRefreshCookie(res, result.refreshToken);
        res.json({ success: true, data: { accessToken: result.accessToken, user: result.user } });
        return;
      }
      if (result.status === 'usuario_nao_encontrado') {
        throw new HttpError(404, 'Usuário não encontrado');
      }
      throw new HttpError(400, `PIN inválido (${result.motivo})`);
    },

    async refresh(req: Request, res: Response) {
      const token = req.cookies?.[REFRESH_COOKIE_NAME];
      if (!token) throw new HttpError(401, 'Sessão não encontrada');

      const result = await authService.refresh({ refreshToken: token, ip: getClientIp(req) });
      if (result.status !== 'ok') {
        res.clearCookie(REFRESH_COOKIE_NAME, { path: '/auth' });
        throw new HttpError(401, 'Sessão expirada, faça login novamente');
      }

      setRefreshCookie(res, result.refreshToken);
      res.json({ success: true, data: { accessToken: result.accessToken } });
    },

    async logout(req: Request, res: Response) {
      const token = req.cookies?.[REFRESH_COOKIE_NAME];
      if (token) await authService.logout({ refreshToken: token });
      res.clearCookie(REFRESH_COOKIE_NAME, { path: '/auth' });
      res.status(204).send();
    },

    async trocarPin(req: Request, res: Response) {
      const input = trocarPinSchema.parse(req.body);
      const result = await authService.trocarPin({ userId: req.user!.id, pinAtual: input.pinAtual, novoPin: input.novoPin });
      if (result.status === 'ok') {
        res.json({ success: true, data: { status: 'ok' } });
        return;
      }
      if (result.status === 'pin_atual_incorreto') {
        throw new HttpError(400, 'PIN atual incorreto');
      }
      throw new HttpError(400, `Novo PIN inválido (${result.motivo})`);
    },

    async resetarAcesso(req: Request, res: Response) {
      const userId = req.params.id;
      if (!userId) throw new HttpError(400, 'Parâmetro id ausente');
      await authService.resetarAcesso({ chefeId: req.user!.id, userId });
      res.json({ success: true, data: { status: 'ok' } });
    },
  };
}
```

- [ ] **Step 3: Implementar `backend/src/routes/auth.routes.ts`**

```ts
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { AuthService } from '../services/auth.service.js';
import type { UserRepository } from '../repositories/user.repository.js';
import { createAuthController } from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/require-role.js';

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

function asyncHandler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next);
}

export function createAuthRouter(deps: { authService: AuthService; userRepo: UserRepository }): Router {
  const router = Router();
  const controller = createAuthController(deps.authService);
  const auth = authenticate({ userRepo: deps.userRepo });

  router.post('/login', loginLimiter, asyncHandler(controller.login));
  router.post('/primeiro-acesso', loginLimiter, asyncHandler(controller.primeiroAcesso));
  router.post('/refresh', asyncHandler(controller.refresh));
  router.post('/logout', asyncHandler(controller.logout));
  router.post('/trocar-pin', auth, asyncHandler(controller.trocarPin));
  router.post('/usuarios/:id/resetar-acesso', auth, requireRole('CHEFE'), asyncHandler(controller.resetarAcesso));

  return router;
}
```

- [ ] **Step 4: Atualizar `backend/src/app.ts`**

```ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import { loadEnv } from './config/env.js';
import { errorHandler } from './middlewares/error-handler.js';
import { createUserRepository } from './repositories/user.repository.js';
import { createRefreshTokenRepository } from './repositories/refresh-token.repository.js';
import { createLoginAttemptRepository } from './repositories/login-attempt.repository.js';
import { createAuditLogRepository } from './repositories/audit-log.repository.js';
import { AuthService } from './services/auth.service.js';
import { UserService } from './services/user.service.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createUserRouter } from './routes/user.routes.js';

export function createApp(prisma: PrismaClient): express.Express {
  const env = loadEnv();
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const userRepo = createUserRepository(prisma);
  const refreshTokenRepo = createRefreshTokenRepository(prisma);
  const loginAttemptRepo = createLoginAttemptRepository(prisma);
  const auditLogRepo = createAuditLogRepository(prisma);

  const authService = new AuthService({ userRepo, refreshTokenRepo, loginAttemptRepo, auditLogRepo });
  const userService = new UserService({ userRepo, auditLogRepo });

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });

  app.use('/auth', createAuthRouter({ authService, userRepo }));
  app.use('/usuarios', createUserRouter({ userService, userRepo }));

  app.use(errorHandler);

  return app;
}
```

Nota: `createApp` agora exige um `PrismaClient` — as próximas etapas atualizam `server.ts` e os helpers de teste para refletir essa mudança de assinatura (Step 5 e 6).

- [ ] **Step 5: Atualizar `backend/src/server.ts`**

```ts
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { prisma } from './config/prisma.js';

const env = loadEnv();
const app = createApp(prisma);

app.listen(env.PORT, () => {
  console.log(`Gabinete Digital API rodando na porta ${env.PORT}`);
});
```

- [ ] **Step 6: Criar `backend/tests/helpers/reset-db.ts`**

```ts
import { PrismaClient } from '@prisma/client';

export const testPrisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://gabinete:gabinete@localhost:5433/gabinete_test' } },
});

export async function resetDb() {
  await testPrisma.auditLog.deleteMany();
  await testPrisma.loginAttempt.deleteMany();
  await testPrisma.refreshToken.deleteMany();
  await testPrisma.user.deleteMany();
}
```

- [ ] **Step 7: Atualizar `backend/tests/helpers/build-test-app.ts`**

As variáveis de ambiente de teste já são garantidas pelo `setupFiles` do Vitest
(`tests/helpers/setup-env.ts`, Task 1) — este arquivo só precisa passar o `testPrisma` para
`createApp`, que agora exige um `PrismaClient` explícito:

```ts
import { createApp } from '../../src/app.js';
import { testPrisma } from './reset-db.js';

export function buildTestApp() {
  return createApp(testPrisma);
}
```

- [ ] **Step 8: Rodar o teste de health check de novo para garantir que a refatoração não quebrou nada**

Run: `cd backend && npx vitest run tests/integration/health.test.ts`
Expected: PASS.

Nota: este passo vai falhar até a Task 14 criar `backend/src/routes/user.routes.ts` (importado no Step 4) — siga para a Task 14 antes de rodar os testes de integração completos; o Step 8 aqui serve apenas como checkpoint mental, não bloqueia o commit desta task se `user.routes.ts` ainda não existir (nesse caso pule para a Task 14 primeiro e volte).

- [ ] **Step 9: Escrever `backend/tests/integration/auth.routes.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { buildTestApp } from '../helpers/build-test-app.js';
import { testPrisma, resetDb } from '../helpers/reset-db.js';

const app = buildTestApp();

beforeEach(async () => {
  await resetDb();
});

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
});
```

- [ ] **Step 10: Rodar os testes (após a Task 14 existir)**

Run: `cd backend && npx vitest run tests/integration/auth.routes.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 11: Commit**

```bash
git add backend/src/controllers/auth.controller.ts backend/src/routes/auth.routes.ts backend/src/app.ts backend/src/server.ts backend/tests/integration/auth.routes.test.ts backend/tests/helpers/reset-db.ts backend/tests/helpers/build-test-app.ts backend/package.json backend/package-lock.json
git commit -m "feat(backend): rotas de autenticacao com cookie httpOnly de refresh token"
```

---

## Task 14: Rotas e controllers de usuários (gestão de assessores pelo chefe)

**Files:**
- Create: `backend/src/controllers/user.controller.ts`
- Create: `backend/src/routes/user.routes.ts`
- Test: `backend/tests/integration/user.routes.test.ts`

**Interfaces:**
- Consumes: `UserService` (Task 11), `criarUsuarioSchema`/`atualizarRoleSchema`/`definirAtivoSchema` (Task 12), `authenticate`/`requireRole` (Task 12).
- Produces: rotas HTTP, todas autenticadas e restritas a `CHEFE`:
  - `POST /usuarios` `{ nome, telefone, role }` → `201`.
  - `GET /usuarios?ativo=true|false` → `200` com lista.
  - `PATCH /usuarios/:id/role` `{ role }` → `200`.
  - `PATCH /usuarios/:id/ativo` `{ ativo }` → `200`.

- [ ] **Step 1: Implementar `backend/src/controllers/user.controller.ts`**

```ts
import type { Request, Response } from 'express';
import type { UserService } from '../services/user.service.js';
import { criarUsuarioSchema, atualizarRoleSchema, definirAtivoSchema } from '../validators/user.validators.js';
import { HttpError } from '../middlewares/error-handler.js';

export function createUserController(userService: UserService) {
  return {
    async criar(req: Request, res: Response) {
      const input = criarUsuarioSchema.parse(req.body);
      const result = await userService.criarAssessor({ ...input, criadoPorId: req.user!.id });

      if (result.status === 'ok') {
        res.status(201).json({ success: true, data: result.user });
        return;
      }
      if (result.status === 'telefone_invalido') {
        throw new HttpError(400, 'Telefone inválido');
      }
      throw new HttpError(409, 'Já existe um usuário com esse telefone');
    },

    async listar(req: Request, res: Response) {
      const ativoParam = req.query.ativo;
      const filter = ativoParam === undefined ? undefined : { ativo: ativoParam === 'true' };
      const usuarios = await userService.listar(filter);
      res.json({ success: true, data: usuarios });
    },

    async atualizarRole(req: Request, res: Response) {
      const userId = req.params.id;
      if (!userId) throw new HttpError(400, 'Parâmetro id ausente');
      const input = atualizarRoleSchema.parse(req.body);
      const usuario = await userService.atualizarRole({ userId, novoRole: input.role, atualizadoPorId: req.user!.id });
      res.json({ success: true, data: usuario });
    },

    async definirAtivo(req: Request, res: Response) {
      const userId = req.params.id;
      if (!userId) throw new HttpError(400, 'Parâmetro id ausente');
      const input = definirAtivoSchema.parse(req.body);
      const usuario = await userService.definirAtivo({ userId, ativo: input.ativo, atualizadoPorId: req.user!.id });
      res.json({ success: true, data: usuario });
    },
  };
}
```

- [ ] **Step 2: Implementar `backend/src/routes/user.routes.ts`**

```ts
import { Router } from 'express';
import type { UserService } from '../services/user.service.js';
import type { UserRepository } from '../repositories/user.repository.js';
import { createUserController } from '../controllers/user.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/require-role.js';

function asyncHandler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next);
}

export function createUserRouter(deps: { userService: UserService; userRepo: UserRepository }): Router {
  const router = Router();
  const controller = createUserController(deps.userService);
  const auth = authenticate({ userRepo: deps.userRepo });
  const soChefe = requireRole('CHEFE');

  router.use(auth, soChefe);
  router.post('/', asyncHandler(controller.criar));
  router.get('/', asyncHandler(controller.listar));
  router.patch('/:id/role', asyncHandler(controller.atualizarRole));
  router.patch('/:id/ativo', asyncHandler(controller.definirAtivo));

  return router;
}
```

- [ ] **Step 3: Voltar à Task 13, Step 8 e confirmar que `backend/src/app.ts` agora importa `user.routes.ts` com sucesso**

Run: `cd backend && npx vitest run tests/integration/health.test.ts`
Expected: PASS.

- [ ] **Step 4: Escrever `backend/tests/integration/user.routes.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { hash } from '@node-rs/argon2';
import { buildTestApp } from '../helpers/build-test-app.js';
import { testPrisma, resetDb } from '../helpers/reset-db.js';

const app = buildTestApp();

beforeEach(async () => {
  await resetDb();
});

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
  });

  it('assessor não pode criar outro usuário', async () => {
    const { accessToken } = await loginComoAssessor();
    const res = await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Novo Assessor', telefone: '(34) 99999-7777', role: 'ASSESSOR_RUA' });

    expect(res.status).toBe(403);
  });

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
  });
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
  });
});
```

- [ ] **Step 5: Rodar todos os testes de integração**

Run: `cd backend && npx vitest run tests/integration`
Expected: PASS (health + repositories + middlewares + auth.routes + user.routes).

- [ ] **Step 6: Rodar a suíte completa do backend**

Run: `cd backend && npx vitest run`
Expected: PASS — todos os testes unitários e de integração das Tasks 1–14.

- [ ] **Step 7: Commit**

```bash
git add backend/src/controllers/user.controller.ts backend/src/routes/user.routes.ts backend/tests/integration/user.routes.test.ts
git commit -m "feat(backend): rotas de gestao de assessores restritas ao chefe"
```

---

## Task 15: Scaffolding do front-end (Next.js + Tailwind com tokens da marca)

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/next.config.ts`
- Create: `frontend/postcss.config.mjs`
- Create: `frontend/tailwind.config.ts`
- Create: `frontend/.gitignore`
- Create: `frontend/.env.example`
- Create: `frontend/src/app/globals.css`
- Create: `frontend/src/app/layout.tsx`
- Create: `frontend/src/app/page.tsx`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/vitest.setup.ts`

**Interfaces:**
- Produces: tokens Tailwind `primary` (azul), `secondary` (rosa), `success`, usados por todos os componentes das próximas tasks.

- [ ] **Step 1: Criar `frontend/package.json`**

```json
{
  "name": "gabinete-digital-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "next": "^14.2.15",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/node": "^22.9.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.1",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.14",
    "typescript": "^5.6.3",
    "vitest": "^2.1.4"
  }
}
```

- [ ] **Step 2: Criar `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Criar `frontend/next.config.ts`**

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
```

- [ ] **Step 4: Criar `frontend/postcss.config.mjs`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 5: Criar `frontend/tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { light: '#EAF0FD', DEFAULT: '#2455C9', dark: '#163A82' },
        secondary: { light: '#FCE7EF', DEFAULT: '#E94F84', dark: '#993556' },
        success: { light: '#E4F6ED', DEFAULT: '#1F9D6B', dark: '#173404' },
        fundo: '#F4F6FA',
      },
      borderRadius: {
        card: '12px',
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 6: Criar `frontend/.gitignore`**

```
node_modules/
.next/
.env
next-env.d.ts
*.tsbuildinfo
```

- [ ] **Step 7: Criar `frontend/.env.example`**

```
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

- [ ] **Step 8: Criar `frontend/.env` local**

Run: `cd frontend && cp .env.example .env`

- [ ] **Step 9: Criar `frontend/src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background-color: #f4f6fa;
  color: #1a1a1a;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
```

- [ ] **Step 10: Criar `frontend/src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gabinete Digital',
  description: 'Gestão de demandas do gabinete parlamentar',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 11: Criar `frontend/src/app/page.tsx` (redirecionamento simples para login)**

```tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/login');
}
```

- [ ] **Step 12: Criar `frontend/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
```

- [ ] **Step 13: Criar `frontend/vitest.setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 14: Instalar dependências e validar o build**

Run: `cd frontend && npm install && npm run build`
Expected: build do Next.js conclui sem erros (a página `/login` ainda não existe — o build gera só `/` redirecionando; isso é esperado nesta etapa).

- [ ] **Step 15: Commit**

```bash
git add frontend/package.json frontend/tsconfig.json frontend/next.config.ts frontend/postcss.config.mjs frontend/tailwind.config.ts frontend/.gitignore frontend/.env.example frontend/src/app/globals.css frontend/src/app/layout.tsx frontend/src/app/page.tsx frontend/vitest.config.ts frontend/vitest.setup.ts frontend/package-lock.json
git commit -m "feat(frontend): scaffolding do Next.js com tokens de marca azul e rosa"
```

---

## Task 16: Máscara de telefone, cliente de API e contexto de autenticação

**Files:**
- Create: `frontend/src/lib/phone-mask.ts`
- Test: `frontend/src/lib/phone-mask.test.ts`
- Create: `frontend/src/services/api-client.ts`
- Test: `frontend/src/services/api-client.test.ts`
- Create: `frontend/src/types/auth.ts`
- Create: `frontend/src/hooks/use-auth.tsx`

**Interfaces:**
- Produces: `maskPhone(input: string): string` (aplica máscara `(34) 99999-8888` enquanto digita).
- Produces: `class ApiError extends Error { status: number }`; `apiClient.request<T>(path: string, options?: { method?: string; body?: unknown; auth?: boolean }): Promise<T>`; `apiClient.setAccessToken(token: string | null): void`.
- Produces: `AuthProvider`, `useAuth(): { user: PublicUser | null; accessToken: string | null; login(telefone: string, pin: string): Promise<LoginOutcome>; logout(): Promise<void>; loading: boolean }`.

- [ ] **Step 1: Escrever o teste da máscara de telefone**

```ts
import { describe, it, expect } from 'vitest';
import { maskPhone } from './phone-mask';

describe('maskPhone', () => {
  it('aplica máscara para celular (11 dígitos)', () => {
    expect(maskPhone('34999998888')).toBe('(34) 99999-8888');
  });

  it('aplica máscara parcial enquanto o usuário digita', () => {
    expect(maskPhone('349999')).toBe('(34) 9999');
  });

  it('ignora caracteres não numéricos na entrada', () => {
    expect(maskPhone('(34) 99999-8888')).toBe('(34) 99999-8888');
  });

  it('trunca em 11 dígitos', () => {
    expect(maskPhone('349999988889999')).toBe('(34) 99999-8888');
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run src/lib/phone-mask.test.ts`
Expected: FAIL — `./phone-mask` não existe.

- [ ] **Step 3: Implementar `frontend/src/lib/phone-mask.ts`**

```ts
export function maskPhone(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 11);

  if (digits.length <= 2) return digits.length === 0 ? '' : `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run src/lib/phone-mask.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Escrever o teste do cliente de API**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError } from './api-client';

describe('apiClient.request', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    apiClient.setAccessToken(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('faz a requisição com o access token quando auth=true', async () => {
    apiClient.setAccessToken('token-abc');
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { ok: true } }),
    });

    const data = await apiClient.request('/usuarios', { auth: true });

    expect(data).toEqual({ ok: true });
    const [, init] = (fetch as any).mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer token-abc');
    expect(init.credentials).toBe('include');
  });

  it('tenta renovar o access token uma vez após 401 e repete a chamada', async () => {
    apiClient.setAccessToken('token-expirado');
    (fetch as any)
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ success: false, error: 'expirado' }) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { accessToken: 'token-novo' } }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, data: { ok: true } }) });

    const data = await apiClient.request('/usuarios', { auth: true });

    expect(data).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(3);
    const [, initFinal] = (fetch as any).mock.calls[2];
    expect(initFinal.headers.Authorization).toBe('Bearer token-novo');
  });

  it('lança ApiError com a mensagem do backend quando a resposta falha', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ success: false, error: 'Dados inválidos' }),
    });

    await expect(apiClient.request('/usuarios', { method: 'POST', body: {} })).rejects.toThrow(ApiError);
  });
});
```

- [ ] **Step 6: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run src/services/api-client.test.ts`
Expected: FAIL — `./api-client` não existe.

- [ ] **Step 7: Implementar `frontend/src/services/api-client.ts`**

```ts
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const res = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
  if (!res.ok) return false;
  const body = await res.json();
  accessToken = body.data.accessToken;
  return true;
}

async function rawRequest(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${API_URL}${path}`, init);
}

export const apiClient = {
  setAccessToken(token: string | null) {
    accessToken = token;
  },
  getAccessToken(): string | null {
    return accessToken;
  },
  async request<T>(
    path: string,
    options: { method?: string; body?: unknown; auth?: boolean } = {},
  ): Promise<T> {
    const buildInit = (): RequestInit => ({
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      credentials: 'include',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    let res = await rawRequest(path, buildInit());

    if (res.status === 401 && options.auth) {
      refreshPromise ??= refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
      const renovado = await refreshPromise;
      if (renovado) {
        res = await rawRequest(path, buildInit());
      }
    }

    const body = await res.json();
    if (!res.ok) {
      throw new ApiError(res.status, body.error ?? 'Erro inesperado');
    }
    return body.data as T;
  },
};
```

- [ ] **Step 8: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run src/services/api-client.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 9: Implementar `frontend/src/types/auth.ts`**

```ts
export type UserRoleValue = 'CHEFE' | 'ASSESSOR_RUA' | 'ASSESSOR_GABINETE';

export interface PublicUser {
  id: string;
  nome: string;
  telefone: string;
  role: UserRoleValue;
  ativo: boolean;
  pinDefinido: boolean;
}
```

- [ ] **Step 10: Implementar `frontend/src/hooks/use-auth.tsx`**

```tsx
'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiClient, ApiError } from '@/services/api-client';
import type { PublicUser } from '@/types/auth';

export type { UserRoleValue, PublicUser } from '@/types/auth';

export type LoginOutcome =
  | { status: 'ok' }
  | { status: 'primeiro_acesso'; userId: string }
  | { status: 'erro'; mensagem: string };

interface AuthContextValue {
  user: PublicUser | null;
  loading: boolean;
  login(telefone: string, pin: string): Promise<LoginOutcome>;
  logout(): Promise<void>;
  setUsuarioAutenticado(user: PublicUser, accessToken: string): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiClient.request<{ accessToken: string }>('/auth/refresh', { method: 'POST' });
        apiClient.setAccessToken(data.accessToken);
      } catch {
        apiClient.setAccessToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setUsuarioAutenticado = useCallback((novoUsuario: PublicUser, accessToken: string) => {
    apiClient.setAccessToken(accessToken);
    setUser(novoUsuario);
  }, []);

  const login = useCallback(async (telefone: string, pin: string): Promise<LoginOutcome> => {
    try {
      const data = await apiClient.request<{
        status: 'ok' | 'primeiro_acesso';
        accessToken?: string;
        user?: PublicUser;
        userId?: string;
      }>('/auth/login', { method: 'POST', body: { telefone, pin } });

      if (data.status === 'primeiro_acesso' && data.userId) {
        return { status: 'primeiro_acesso', userId: data.userId };
      }
      if (data.status === 'ok' && data.accessToken && data.user) {
        setUsuarioAutenticado(data.user, data.accessToken);
        return { status: 'ok' };
      }
      return { status: 'erro', mensagem: 'Resposta inesperada do servidor' };
    } catch (err) {
      if (err instanceof ApiError) {
        return { status: 'erro', mensagem: err.message };
      }
      return { status: 'erro', mensagem: 'Não foi possível conectar ao servidor' };
    }
  }, [setUsuarioAutenticado]);

  const logout = useCallback(async () => {
    try {
      await apiClient.request('/auth/logout', { method: 'POST', auth: true });
    } finally {
      apiClient.setAccessToken(null);
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setUsuarioAutenticado }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
```

- [ ] **Step 11: Atualizar `frontend/src/app/layout.tsx` para envolver a aplicação no `AuthProvider`**

```tsx
import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/hooks/use-auth';

export const metadata: Metadata = {
  title: 'Gabinete Digital',
  description: 'Gestão de demandas do gabinete parlamentar',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 12: Rodar toda a suíte do front-end**

Run: `cd frontend && npx vitest run`
Expected: PASS (7 testes: phone-mask + api-client).

- [ ] **Step 13: Commit**

```bash
git add frontend/src/lib frontend/src/services frontend/src/types frontend/src/hooks frontend/src/app/layout.tsx
git commit -m "feat(frontend): mascara de telefone, cliente de API com refresh automatico e contexto de autenticacao"
```

---

## Task 17: Componentes base, página de login e primeiro acesso

**Files:**
- Create: `frontend/src/components/Button.tsx`
- Create: `frontend/src/components/TextField.tsx`
- Create: `frontend/src/app/login/page.tsx`
- Test: `frontend/src/app/login/page.test.tsx`
- Create: `frontend/src/app/primeiro-acesso/page.tsx`
- Test: `frontend/src/app/primeiro-acesso/page.test.tsx`

**Interfaces:**
- Consumes: `maskPhone` (Task 16), `useAuth` (Task 16), tokens Tailwind `primary`/`secondary` (Task 15).
- Produces: `<Button variant="primary" | "secondary" | "ghost">`; `<TextField label error ...props>`.

- [ ] **Step 1: Implementar `frontend/src/components/Button.tsx`**

```tsx
'use client';

import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-primary text-white hover:bg-primary-dark',
  secondary: 'bg-secondary text-white hover:bg-secondary-dark',
  ghost: 'bg-transparent text-primary-dark border border-primary hover:bg-primary-light',
};

export function Button({ variant = 'primary', className = '', disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled}
      className={`w-full rounded-xl px-4 py-3 text-base font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
    />
  );
}
```

- [ ] **Step 2: Implementar `frontend/src/components/TextField.tsx`**

```tsx
'use client';

import type { InputHTMLAttributes } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function TextField({ label, error, id, className = '', ...props }: TextFieldProps) {
  const fieldId = id ?? props.name;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        {...props}
        id={fieldId}
        className={`rounded-xl border px-4 py-3 text-base outline-none focus:ring-2 focus:ring-primary ${
          error ? 'border-red-500' : 'border-gray-300'
        } ${className}`}
      />
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 3: Escrever o teste da página de login**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from './page';
import { AuthProvider } from '@/hooks/use-auth';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});

import { apiClient } from '@/services/api-client';

describe('LoginPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.request).mockReset();
    vi.mocked(apiClient.request).mockRejectedValueOnce(new Error('sem sessão'));
  });

  it('mantém o botão desabilitado até telefone e PIN completos', async () => {
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );

    const botao = await screen.findByRole('button', { name: /entrar/i });
    expect(botao).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/telefone/i), { target: { value: '34999998888' } });
    fireEvent.change(screen.getByLabelText(/pin/i), { target: { value: '482913' } });

    await waitFor(() => expect(botao).not.toBeDisabled());
  });

  it('mostra mensagem de erro quando o login falha', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({
      status: 'erro',
    } as never);
    vi.mocked(apiClient.request).mockRejectedValueOnce(new (await import('@/services/api-client')).ApiError(401, 'Telefone ou PIN incorretos'));

    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );

    fireEvent.change(await screen.findByLabelText(/telefone/i), { target: { value: '34999998888' } });
    fireEvent.change(screen.getByLabelText(/pin/i), { target: { value: '482913' } });
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByText(/telefone ou pin incorretos/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run src/app/login/page.test.tsx`
Expected: FAIL — `./page` não existe.

- [ ] **Step 5: Implementar `frontend/src/app/login/page.tsx`**

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { maskPhone } from '@/lib/phone-mask';
import { useAuth } from '@/hooks/use-auth';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [telefone, setTelefone] = useState('');
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const telefoneDigitos = telefone.replace(/\D/g, '');
  const formValido = useMemo(() => telefoneDigitos.length >= 10 && pin.length === 6, [telefoneDigitos, pin]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const resultado = await login(telefone, pin);
      if (resultado.status === 'ok') {
        router.push('/painel');
      } else if (resultado.status === 'primeiro_acesso') {
        router.push(`/primeiro-acesso?userId=${resultado.userId}`);
      } else {
        setErro(resultado.mensagem);
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-fundo px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-card bg-white p-8 shadow-sm"
      >
        <h1 className="mb-1 text-xl font-semibold text-primary-dark">Gabinete digital</h1>
        <p className="mb-6 text-sm text-gray-600">Entre com seu telefone e PIN</p>

        <div className="flex flex-col gap-4">
          <TextField
            label="Telefone"
            name="telefone"
            inputMode="numeric"
            placeholder="(34) 99999-8888"
            value={maskPhone(telefone)}
            onChange={(e) => setTelefone(e.target.value)}
          />
          <TextField
            label="PIN de 6 dígitos"
            name="pin"
            type="password"
            inputMode="numeric"
            maxLength={6}
            placeholder="••••••"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
        </div>

        {erro && <p className="mt-4 text-sm text-red-600">{erro}</p>}

        <div className="mt-6">
          <Button type="submit" disabled={!formValido || enviando}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </Button>
        </div>
      </form>
    </main>
  );
}
```

- [ ] **Step 6: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run src/app/login/page.test.tsx`
Expected: PASS (2 testes).

- [ ] **Step 7: Escrever o teste da página de primeiro acesso**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PrimeiroAcessoPage from './page';
import { AuthProvider } from '@/hooks/use-auth';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams('userId=user-123'),
}));

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});

import { apiClient } from '@/services/api-client';

describe('PrimeiroAcessoPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.request).mockReset();
  });

  it('mostra erro quando os dois PINs não coincidem', async () => {
    render(
      <AuthProvider>
        <PrimeiroAcessoPage />
      </AuthProvider>,
    );

    fireEvent.change(screen.getByLabelText(/novo pin/i), { target: { value: '482913' } });
    fireEvent.change(screen.getByLabelText(/confirme o pin/i), { target: { value: '482914' } });
    fireEvent.click(screen.getByRole('button', { name: /criar pin/i }));

    expect(await screen.findByText(/os pins não coincidem/i)).toBeInTheDocument();
    expect(apiClient.request).not.toHaveBeenCalled();
  });

  it('envia o novo PIN e redireciona para o painel em caso de sucesso', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({
      accessToken: 'token-novo',
      user: { id: 'user-123', nome: 'Teste', telefone: '+5534999998888', role: 'ASSESSOR_RUA', ativo: true, pinDefinido: true },
    } as never);

    render(
      <AuthProvider>
        <PrimeiroAcessoPage />
      </AuthProvider>,
    );

    fireEvent.change(screen.getByLabelText(/novo pin/i), { target: { value: '482913' } });
    fireEvent.change(screen.getByLabelText(/confirme o pin/i), { target: { value: '482913' } });
    fireEvent.click(screen.getByRole('button', { name: /criar pin/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/painel'));
  });
});
```

- [ ] **Step 8: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run src/app/primeiro-acesso/page.test.tsx`
Expected: FAIL — `./page` não existe.

- [ ] **Step 9: Implementar `frontend/src/app/primeiro-acesso/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { apiClient, ApiError } from '@/services/api-client';
import { useAuth } from '@/hooks/use-auth';
import type { PublicUser } from '@/types/auth';

export default function PrimeiroAcessoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = searchParams.get('userId') ?? '';
  const { setUsuarioAutenticado } = useAuth();

  const [novoPin, setNovoPin] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErro(null);

    if (novoPin !== confirmacao) {
      setErro('Os PINs não coincidem');
      return;
    }

    setEnviando(true);
    try {
      const data = await apiClient.request<{ accessToken: string; user: PublicUser }>('/auth/primeiro-acesso', {
        method: 'POST',
        body: { userId, novoPin },
      });
      setUsuarioAutenticado(data.user, data.accessToken);
      router.push('/painel');
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível criar o PIN');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-fundo px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-card bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-primary-dark">Crie seu PIN</h1>
        <p className="mb-6 text-sm text-gray-600">
          Este é o seu primeiro acesso. Escolha um PIN de 6 dígitos que só você conhece.
        </p>

        <div className="flex flex-col gap-4">
          <TextField
            label="Novo PIN"
            name="novoPin"
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={novoPin}
            onChange={(e) => setNovoPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          <TextField
            label="Confirme o PIN"
            name="confirmacao"
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
        </div>

        {erro && <p className="mt-4 text-sm text-red-600">{erro}</p>}

        <div className="mt-6">
          <Button type="submit" disabled={novoPin.length !== 6 || confirmacao.length !== 6 || enviando}>
            {enviando ? 'Salvando…' : 'Criar PIN'}
          </Button>
        </div>
      </form>
    </main>
  );
}
```

- [ ] **Step 10: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run src/app/primeiro-acesso/page.test.tsx`
Expected: PASS (2 testes).

- [ ] **Step 11: Rodar toda a suíte do front-end**

Run: `cd frontend && npx vitest run`
Expected: PASS (todos os testes das Tasks 15–17).

- [ ] **Step 12: Commit**

```bash
git add frontend/src/components frontend/src/app/login frontend/src/app/primeiro-acesso
git commit -m "feat(frontend): componentes base e paginas de login e primeiro acesso"
```

---

## Task 18: Layout protegido (menu lateral/mobile) e painel placeholder

**Files:**
- Create: `frontend/src/components/Sidebar.tsx`
- Create: `frontend/src/components/MobileNav.tsx`
- Create: `frontend/src/app/painel/layout.tsx`
- Test: `frontend/src/app/painel/layout.test.tsx`
- Create: `frontend/src/app/painel/page.tsx`

**Interfaces:**
- Consumes: `useAuth` (Task 16).
- Produces: layout que redireciona para `/login` quando não autenticado, e mostra menu lateral (desktop) / navegação inferior (mobile) com itens condicionados ao papel do usuário (`Assessores` e `Configurações` só para `CHEFE`).

- [ ] **Step 1: Implementar `frontend/src/components/Sidebar.tsx`**

```tsx
'use client';

import type { UserRoleValue } from '@/hooks/use-auth';

interface ItemMenu {
  href: string;
  label: string;
  somenteChefe?: boolean;
}

const ITENS: ItemMenu[] = [
  { href: '/painel', label: 'Painel' },
  { href: '/painel/demandas', label: 'Demandas' },
  { href: '/painel/assessores', label: 'Assessores', somenteChefe: true },
  { href: '/painel/configuracoes', label: 'Configurações', somenteChefe: true },
];

export function Sidebar({ role }: { role: UserRoleValue }) {
  const itensVisiveis = ITENS.filter((item) => !item.somenteChefe || role === 'CHEFE');

  return (
    <aside className="hidden w-56 flex-col bg-primary-dark p-4 text-white md:flex">
      <p className="mb-6 px-2 text-base font-semibold">Gabinete digital</p>
      <nav className="flex flex-col gap-1">
        {itensVisiveis.map((item) => (
          <a key={item.href} href={item.href} className="rounded-lg px-3 py-2 text-sm hover:bg-white/10">
            {item.label}
          </a>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Implementar `frontend/src/components/MobileNav.tsx`**

```tsx
'use client';

import type { UserRoleValue } from '@/hooks/use-auth';

interface ItemMenu {
  href: string;
  label: string;
  somenteChefe?: boolean;
}

const ITENS: ItemMenu[] = [
  { href: '/painel', label: 'Painel' },
  { href: '/painel/demandas', label: 'Demandas' },
  { href: '/painel/assessores', label: 'Equipe', somenteChefe: true },
];

export function MobileNav({ role }: { role: UserRoleValue }) {
  const itensVisiveis = ITENS.filter((item) => !item.somenteChefe || role === 'CHEFE');

  return (
    <nav className="fixed inset-x-0 bottom-0 flex justify-around border-t border-gray-200 bg-white py-2 md:hidden">
      {itensVisiveis.map((item) => (
        <a key={item.href} href={item.href} className="px-3 py-2 text-sm text-primary-dark">
          {item.label}
        </a>
      ))}
    </nav>
  );
}
```

- [ ] **Step 3: Escrever o teste do layout protegido**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PainelLayout from './layout';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const useAuthMock = vi.fn();
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => useAuthMock(),
}));

describe('PainelLayout', () => {
  it('redireciona para /login quando não há usuário autenticado', async () => {
    useAuthMock.mockReturnValue({ user: null, loading: false });

    render(<PainelLayout>conteúdo</PainelLayout>);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'));
  });

  it('renderiza o conteúdo quando o usuário está autenticado', async () => {
    useAuthMock.mockReturnValue({
      user: { id: '1', nome: 'Ana', telefone: '+5534999998888', role: 'ASSESSOR_RUA', ativo: true, pinDefinido: true },
      loading: false,
    });

    render(<PainelLayout>conteúdo do painel</PainelLayout>);

    expect(await screen.findByText('conteúdo do painel')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('não redireciona enquanto ainda está carregando a sessão', () => {
    useAuthMock.mockReturnValue({ user: null, loading: true });

    render(<PainelLayout>conteúdo</PainelLayout>);

    expect(push).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run src/app/painel/layout.test.tsx`
Expected: FAIL — `./layout` não existe.

- [ ] **Step 5: Implementar `frontend/src/app/painel/layout.tsx`**

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Sidebar } from '@/components/Sidebar';
import { MobileNav } from '@/components/MobileNav';

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-fundo">
      <Sidebar role={user.role} />
      <main className="flex-1 px-4 py-6 pb-20 md:pb-6">{children}</main>
      <MobileNav role={user.role} />
    </div>
  );
}
```

- [ ] **Step 6: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run src/app/painel/layout.test.tsx`
Expected: PASS (3 testes).

- [ ] **Step 7: Implementar `frontend/src/app/painel/page.tsx` (placeholder)**

```tsx
'use client';

import { useAuth } from '@/hooks/use-auth';

export default function PainelPage() {
  const { user } = useAuth();

  return (
    <div className="rounded-card bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-primary-dark">Bem-vindo(a), {user?.nome}</h1>
      <p className="mt-2 text-sm text-gray-600">
        O painel de demandas será construído na próxima fase. Por enquanto, esta é a área
        protegida do sistema — só usuários autenticados chegam até aqui.
      </p>
    </div>
  );
}
```

- [ ] **Step 8: Rodar toda a suíte do front-end e o build de produção**

Run: `cd frontend && npx vitest run && npm run build`
Expected: todos os testes PASS; build do Next.js conclui sem erros.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/Sidebar.tsx frontend/src/components/MobileNav.tsx frontend/src/app/painel
git commit -m "feat(frontend): layout protegido com menu lateral, navegacao mobile e painel placeholder"
```

---

## Task 19: README raiz e checagem final da Fase 1

**Files:**
- Create: `README.md` (raiz do projeto)

**Interfaces:**
- Nenhuma nova — task de documentação e verificação, fecha a Fase 1.

- [ ] **Step 1: Criar o `README.md` da raiz**

```markdown
# Gabinete Digital

Sistema web para gerenciamento de demandas de um gabinete parlamentar, substituindo os
formulários de papel preenchidos pelos assessores durante atendimentos de rua.

Este repositório é construído em fases. Specs e planos de cada fase ficam em
[`docs/superpowers/`](docs/superpowers).

- Fase 1 (esta) — Fundação: schema completo, autenticação por telefone+PIN, papéis.
- Fase 2 — Demandas + fotos (ViaCEP, Cloudinary, listagem/filtros).
- Fase 3 — Painel, status e relatórios.
- Fase 4 — PWA offline + notificações.
- Fase 5 — Deploy em produção (Vercel + Render + Neon + Cloudinary) e testes finais.

## Estrutura

- `backend/` — API REST em Node.js + Express + TypeScript + Prisma.
- `frontend/` — Next.js (App Router) + TypeScript + Tailwind CSS.

## Rodando localmente

Pré-requisitos: Node.js LTS, Docker (para o Postgres local).

1. Subir os bancos locais (dev + teste):
   ```bash
   docker compose up -d
   ```
2. Backend:
   ```bash
   cd backend
   cp .env.example .env   # gere segredos JWT aleatórios e cole no .env
   npm install
   npx prisma migrate dev
   npx tsx prisma/seed.ts
   npm run dev             # http://localhost:3001
   ```
3. Frontend (em outro terminal):
   ```bash
   cd frontend
   cp .env.example .env
   npm install
   npm run dev              # http://localhost:3000
   ```
4. Acesse `http://localhost:3000` — você será redirecionado para `/login`.

### Criando o primeiro chefe

O seed só cria o primeiro chefe se as variáveis `SEED_CHEFE_TELEFONE`, `SEED_CHEFE_NOME` e
`SEED_CHEFE_PIN` estiverem definidas na hora de rodar o seed:

```bash
cd backend
SEED_CHEFE_TELEFONE="+5534999990000" SEED_CHEFE_NOME="Seu Nome" SEED_CHEFE_PIN="482913" npx tsx prisma/seed.ts
```

Nunca use esses dados em produção com um PIN previsível — troque o PIN pelo próprio sistema
assim que possível.

## Rodando os testes

```bash
# backend (precisa do Postgres de teste no ar: docker compose up -d)
cd backend && npm test

# frontend
cd frontend && npm test
```

## Variáveis de ambiente

Ver `backend/.env.example` e `frontend/.env.example`. Em produção (Fase 5), `DATABASE_URL`
aponta para o Neon, `CLOUDINARY_*` para o Cloudinary, e `FRONTEND_URL`/`NEXT_PUBLIC_API_URL`
para os domínios reais na Vercel e no Render.

## Privacidade e LGPD

O texto definitivo do aviso de privacidade e a base legal para tratamento de dados devem ser
revisados pelo responsável jurídico ou encarregado de proteção de dados da Câmara antes de
qualquer uso com dados reais. Esta fase não coleta dados de solicitantes — isso começa na
Fase 2.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README raiz com instrucoes de execucao local da Fase 1"
```

- [ ] **Step 3: Verificação final de ponta a ponta**

Run:
```bash
docker compose up -d
cd backend && npm test && cd ../frontend && npm test
```
Expected: todas as suítes (backend e frontend) em PASS.

- [ ] **Step 4: Rodar o typecheck dos dois projetos**

Run: `cd backend && npm run typecheck && cd ../frontend && npm run typecheck`
Expected: sem erros de tipo em nenhum dos dois.

