# Fase 4: Escala e mural do gabinete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma tela nova (`/painel/escala`), visível a todos os papéis, com um calendário mensal onde o chefe organiza dia a dia quem fica no gabinete e quem vai pra rua; a própria grade do calendário, aberta já no mês atual com o dia de hoje destacado, funciona como o "mural" do dia.

**Architecture:** Mesmo padrão repository → service → controller → route já usado no resto do backend, com um `DutyRosterRepository`/`DutyRosterService`/router novos e isolados. Front-end: um utilitário puro de grade de calendário, dois componentes (grade mensal + painel de dia), e uma página que os une.

**Tech Stack:** Mesmo da Fase 3 — Express, TypeScript, Prisma, Zod; Next.js, React, Tailwind (nenhuma biblioteca de calendário nova — a grade é construída à mão com um utilitário puro, mesmo padrão de simplicidade já usado no resto do front-end).

## Global Constraints

- Editar a escala de qualquer dia é exclusivo de `CHEFE` — 403 para `ASSESSOR_GABINETE` e `ASSESSOR_RUA`.
- Visualizar a escala (qualquer mês, qualquer dia) é permitido a **todos os papéis autenticados**, inclusive `CHEFE`.
- A escala vale para qualquer assessor (`ASSESSOR_RUA` ou `ASSESSOR_GABINETE`) — o papel não restringe onde a pessoa pode ser escalada num dia. `CHEFE` nunca é escalado; tentar escalar um `CHEFE` ou um usuário inativo é rejeitado com 400.
- Não existe status explícito de "folga"/"férias" — um assessor ausente da escala de um dia está, implicitamente, de folga naquele dia.
- Edição é sempre **dia por dia**, e sempre **substitui inteiramente** a escala daquele dia (remove tudo que existia, cria o que foi enviado) — nunca um patch incremental.
- Interface 100% em português do Brasil; sem comentários no código a não ser para documentar um porquê não óbvio.
- Toda regra de permissão é aplicada no backend, nunca só escondida no front-end.

---

## Task 1: Schema — modelo `DutyRosterEntry`

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/tests/helpers/reset-db.ts`

**Interfaces:**
- Produces: modelo Prisma `DutyRosterEntry` (`data`, `userId`, `local`) e enum `LocalEscala` — consumidos pela Task 2 (repositório).

- [ ] **Step 1: Adicionar o enum `LocalEscala`**

Em `backend/prisma/schema.prisma`, logo após o enum `RequestStatus` (por volta da linha 28, antes de `model User {`), adicione:

```prisma
enum LocalEscala {
  GABINETE
  RUA
}
```

- [ ] **Step 2: Adicionar a relação reversa no `model User`**

No `model User`, junto das demais relações já existentes (por volta da linha 50, logo após `reatribuicoesFeitas`), adicione:

```prisma
  escalasDoDia              DutyRosterEntry[]
```

- [ ] **Step 3: Adicionar o `model DutyRosterEntry`**

No final do arquivo `schema.prisma` (depois do `model PrivacyConsent`), adicione:

```prisma
model DutyRosterEntry {
  id        String      @id @default(uuid())
  data      DateTime    @db.Date
  userId    String
  user      User        @relation(fields: [userId], references: [id])
  local     LocalEscala
  createdAt DateTime    @default(now()) @db.Timestamptz(3)
  updatedAt DateTime    @updatedAt @db.Timestamptz(3)

  @@unique([data, userId])
  @@index([data])
  @@map("duty_roster_entries")
}
```

- [ ] **Step 4: Gerar e aplicar a migração no banco de dev**

Run (a partir de `backend/`):
```bash
npx prisma migrate dev --name add_duty_roster_entry
```
Expected: cria uma nova pasta em `prisma/migrations/`, aplica no Neon de dev, regenera o Prisma Client sem erros.

- [ ] **Step 5: Aplicar a mesma migração no banco de teste**

Run (a partir de `backend/`, com as variáveis de ambiente apontando para `.env.test` — ajuste conforme o shell):
```bash
DATABASE_URL="$(grep DATABASE_URL .env.test | cut -d= -f2- | tr -d '\"')" DIRECT_URL="$(grep DIRECT_URL .env.test | cut -d= -f2- | tr -d '\"')" npx prisma migrate deploy
```
Expected: aplica a migração pendente no banco de teste sem erro. Se o comando acima não funcionar no seu shell, carregue `.env.test` manualmente e rode `npx prisma migrate deploy` normalmente — o objetivo é só garantir que a migração seja aplicada nesse banco.

- [ ] **Step 6: Atualizar `reset-db.ts` para limpar a tabela nova**

Em `backend/tests/helpers/reset-db.ts`, adicione a limpeza de `dutyRosterEntry` — ela referencia `users` com FK (comportamento padrão do Prisma, que restringe deletar um usuário com linhas dependentes), então precisa ser limpa antes de `user.deleteMany()`. Adicione a chamada logo antes de `await testPrisma.refreshToken.deleteMany();`:

```ts
  // dutyRosterEntry referencia users com FK — precisa ser limpa antes de user.
  await testPrisma.dutyRosterEntry.deleteMany();
  await testPrisma.refreshToken.deleteMany();
  await testPrisma.user.deleteMany();
```

- [ ] **Step 7: Confirmar que o typecheck e a suíte existente continuam limpos**

Run: `cd backend && npm run typecheck && npm test`
Expected: tudo passando (nenhum código ainda usa a tabela nova — só o schema e o helper de limpeza mudaram).

- [ ] **Step 8: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations backend/tests/helpers/reset-db.ts
git commit -m "feat(backend): adiciona modelo DutyRosterEntry para a escala do gabinete"
```

---

## Task 2: Repositório da escala

**Files:**
- Create: `backend/src/repositories/duty-roster.repository.ts`
- Test: `backend/tests/integration/duty-roster.repository.test.ts`

**Interfaces:**
- Consumes: modelo `DutyRosterEntry` (Task 1).
- Produces: `DutyRosterRepository.listarMes()`, `DutyRosterRepository.substituirDia()`, tipos `AtribuicaoEscala`, `LocalEscalaValue` — consumidos pela Task 3 (serviço).

- [ ] **Step 1: Escrever o teste**

Crie `backend/tests/integration/duty-roster.repository.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createDutyRosterRepository } from '../../src/repositories/duty-roster.repository.js';
import { resetDb } from '../helpers/reset-db.js';

const prisma = new PrismaClient();
const dutyRosterRepo = createDutyRosterRepository(prisma);

let assessorId: string;
let outroAssessorId: string;

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await resetDb();

  const assessor = await prisma.user.create({
    data: { nome: 'Ana Rua', telefone: '+5534999996700', role: 'ASSESSOR_RUA' },
  });
  assessorId = assessor.id;

  const outro = await prisma.user.create({
    data: { nome: 'Beto Gabinete', telefone: '+5534999996701', role: 'ASSESSOR_GABINETE' },
  });
  outroAssessorId = outro.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('DutyRosterRepository.listarMes', () => {
  it('agrupa as atribuições por dia dentro do intervalo do mês', async () => {
    await prisma.dutyRosterEntry.createMany({
      data: [
        { data: new Date('2026-09-15T00:00:00.000Z'), userId: assessorId, local: 'RUA' },
        { data: new Date('2026-09-15T00:00:00.000Z'), userId: outroAssessorId, local: 'GABINETE' },
        { data: new Date('2026-08-31T00:00:00.000Z'), userId: assessorId, local: 'RUA' },
      ],
    });

    const dias = await dutyRosterRepo.listarMes(
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-10-01T00:00:00.000Z'),
    );

    expect(dias['2026-09-15']).toHaveLength(2);
    expect(dias['2026-09-15']?.find((a) => a.userId === assessorId)?.local).toBe('RUA');
    expect(dias['2026-09-15']?.find((a) => a.userId === outroAssessorId)?.userNome).toBe('Beto Gabinete');
    expect(dias['2026-08-31']).toBeUndefined();
  }, 20000);

  it('um dia sem nenhuma entrada não aparece no resultado', async () => {
    const dias = await dutyRosterRepo.listarMes(
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-10-01T00:00:00.000Z'),
    );

    expect(dias['2026-09-20']).toBeUndefined();
  }, 20000);
});

describe('DutyRosterRepository.substituirDia', () => {
  it('cria as atribuições quando o dia estava vazio', async () => {
    await dutyRosterRepo.substituirDia(new Date('2026-09-15T00:00:00.000Z'), [
      { userId: assessorId, local: 'RUA' },
    ]);

    const dias = await dutyRosterRepo.listarMes(
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-10-01T00:00:00.000Z'),
    );
    expect(dias['2026-09-15']).toHaveLength(1);
    expect(dias['2026-09-15']?.[0]?.local).toBe('RUA');
  }, 20000);

  it('substitui inteiramente as atribuições já existentes do dia', async () => {
    await dutyRosterRepo.substituirDia(new Date('2026-09-15T00:00:00.000Z'), [
      { userId: assessorId, local: 'RUA' },
      { userId: outroAssessorId, local: 'GABINETE' },
    ]);

    await dutyRosterRepo.substituirDia(new Date('2026-09-15T00:00:00.000Z'), [
      { userId: assessorId, local: 'GABINETE' },
    ]);

    const dias = await dutyRosterRepo.listarMes(
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-10-01T00:00:00.000Z'),
    );
    expect(dias['2026-09-15']).toHaveLength(1);
    expect(dias['2026-09-15']?.[0]?.userId).toBe(assessorId);
    expect(dias['2026-09-15']?.[0]?.local).toBe('GABINETE');
  }, 20000);

  it('esvazia o dia quando a lista de atribuições enviada é vazia', async () => {
    await dutyRosterRepo.substituirDia(new Date('2026-09-15T00:00:00.000Z'), [
      { userId: assessorId, local: 'RUA' },
    ]);
    await dutyRosterRepo.substituirDia(new Date('2026-09-15T00:00:00.000Z'), []);

    const dias = await dutyRosterRepo.listarMes(
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-10-01T00:00:00.000Z'),
    );
    expect(dias['2026-09-15']).toBeUndefined();
  }, 20000);
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/integration/duty-roster.repository.test.ts`
Expected: FAIL — `../../src/repositories/duty-roster.repository.js` não existe.

- [ ] **Step 3: Implementar**

Crie `backend/src/repositories/duty-roster.repository.ts`:

```ts
import type { PrismaClient } from '@prisma/client';

export type LocalEscalaValue = 'GABINETE' | 'RUA';

export interface AtribuicaoEscala {
  userId: string;
  userNome: string;
  local: LocalEscalaValue;
}

export interface DutyRosterRepository {
  listarMes(mesInicio: Date, mesFim: Date): Promise<Record<string, AtribuicaoEscala[]>>;
  substituirDia(data: Date, atribuicoes: { userId: string; local: LocalEscalaValue }[]): Promise<void>;
}

export function createDutyRosterRepository(prisma: PrismaClient): DutyRosterRepository {
  return {
    async listarMes(mesInicio, mesFim) {
      const entradas = await prisma.dutyRosterEntry.findMany({
        where: { data: { gte: mesInicio, lt: mesFim } },
        include: { user: { select: { nome: true } } },
        orderBy: { data: 'asc' },
      });

      const dias: Record<string, AtribuicaoEscala[]> = {};
      for (const entrada of entradas) {
        const chave = entrada.data.toISOString().slice(0, 10);
        dias[chave] ??= [];
        dias[chave]!.push({
          userId: entrada.userId,
          userNome: entrada.user.nome,
          local: entrada.local as LocalEscalaValue,
        });
      }
      return dias;
    },

    async substituirDia(data, atribuicoes) {
      await prisma.$transaction([
        prisma.dutyRosterEntry.deleteMany({ where: { data } }),
        prisma.dutyRosterEntry.createMany({
          data: atribuicoes.map((a) => ({ data, userId: a.userId, local: a.local })),
        }),
      ]);
    },
  };
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/integration/duty-roster.repository.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Rodar o typecheck**

Run: `cd backend && npm run typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add backend/src/repositories/duty-roster.repository.ts backend/tests/integration/duty-roster.repository.test.ts
git commit -m "feat(backend): repositorio da escala do gabinete"
```

---

## Task 3: Serviço, validadores, controller, rotas e wiring

**Files:**
- Create: `backend/src/services/duty-roster.service.ts`
- Test: `backend/tests/unit/duty-roster.service.test.ts`
- Create: `backend/src/validators/duty-roster.validators.ts`
- Create: `backend/src/controllers/duty-roster.controller.ts`
- Create: `backend/src/routes/duty-roster.routes.ts`
- Modify: `backend/src/app.ts`

**Interfaces:**
- Consumes: `DutyRosterRepository` (Task 2); `UserRepository` (já existe); `authenticate`/`requireRole` (já existem).
- Produces: `GET /escala`, `PUT /escala/:data` — consumidos pela Task 4 (testes de rota) e pelo front-end (Tasks 5-8).

- [ ] **Step 1: Escrever o teste do serviço**

Crie `backend/tests/unit/duty-roster.service.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DutyRosterService } from '../../src/services/duty-roster.service.js';
import { createFakeUserRepo } from '../helpers/fakes.js';
import type { DutyRosterRepository, LocalEscalaValue } from '../../src/repositories/duty-roster.repository.js';

function createFakeDutyRosterRepo(): DutyRosterRepository & {
  chamadasSubstituir: { data: Date; atribuicoes: { userId: string; local: LocalEscalaValue }[] }[];
} {
  const chamadasSubstituir: { data: Date; atribuicoes: { userId: string; local: LocalEscalaValue }[] }[] = [];
  return {
    chamadasSubstituir,
    async listarMes() {
      return {};
    },
    async substituirDia(data, atribuicoes) {
      chamadasSubstituir.push({ data, atribuicoes });
    },
  };
}

function buildService() {
  const agora = new Date();
  const userRepo = createFakeUserRepo([
    {
      id: 'assessor-1',
      nome: 'Ana',
      telefone: '+5534999990001',
      role: 'ASSESSOR_RUA',
      ativo: true,
      pinDefinido: false,
      pinHash: null,
      createdAt: agora,
      updatedAt: agora,
    },
    {
      id: 'chefe-1',
      nome: 'Chefe',
      telefone: '+5534999990002',
      role: 'CHEFE',
      ativo: true,
      pinDefinido: false,
      pinHash: null,
      createdAt: agora,
      updatedAt: agora,
    },
    {
      id: 'inativo-1',
      nome: 'Inativo',
      telefone: '+5534999990003',
      role: 'ASSESSOR_GABINETE',
      ativo: false,
      pinDefinido: false,
      pinHash: null,
      createdAt: agora,
      updatedAt: agora,
    },
  ]);
  const dutyRosterRepo = createFakeDutyRosterRepo();
  const service = new DutyRosterService({ dutyRosterRepo, userRepo });
  return { service, dutyRosterRepo };
}

describe('DutyRosterService.substituirDia', () => {
  it('aceita um assessor ativo e delega ao repositório', async () => {
    const { service, dutyRosterRepo } = buildService();

    const result = await service.substituirDia('2026-09-15', [{ userId: 'assessor-1', local: 'RUA' }]);

    expect(result.status).toBe('ok');
    expect(dutyRosterRepo.chamadasSubstituir).toHaveLength(1);
    expect(dutyRosterRepo.chamadasSubstituir[0]?.atribuicoes).toEqual([{ userId: 'assessor-1', local: 'RUA' }]);
    expect(dutyRosterRepo.chamadasSubstituir[0]?.data.toISOString()).toBe('2026-09-15T00:00:00.000Z');
  });

  it('rejeita quando o userId é de um chefe', async () => {
    const { service, dutyRosterRepo } = buildService();

    const result = await service.substituirDia('2026-09-15', [{ userId: 'chefe-1', local: 'GABINETE' }]);

    expect(result.status).toBe('usuario_invalido');
    expect(dutyRosterRepo.chamadasSubstituir).toHaveLength(0);
  });

  it('rejeita quando o assessor está inativo', async () => {
    const { service, dutyRosterRepo } = buildService();

    const result = await service.substituirDia('2026-09-15', [{ userId: 'inativo-1', local: 'GABINETE' }]);

    expect(result.status).toBe('usuario_invalido');
    expect(dutyRosterRepo.chamadasSubstituir).toHaveLength(0);
  });

  it('rejeita quando o userId não existe', async () => {
    const { service, dutyRosterRepo } = buildService();

    const result = await service.substituirDia('2026-09-15', [{ userId: 'nao-existe', local: 'RUA' }]);

    expect(result.status).toBe('usuario_invalido');
    expect(dutyRosterRepo.chamadasSubstituir).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/unit/duty-roster.service.test.ts`
Expected: FAIL — `../../src/services/duty-roster.service.js` não existe.

- [ ] **Step 3: Implementar o serviço**

Crie `backend/src/services/duty-roster.service.ts`:

```ts
import type { DutyRosterRepository, AtribuicaoEscala, LocalEscalaValue } from '../repositories/duty-roster.repository.js';
import type { UserRepository } from '../repositories/user.repository.js';

export type SubstituirDiaResult = { status: 'ok' } | { status: 'usuario_invalido'; userId: string };

export class DutyRosterService {
  private dutyRosterRepo: DutyRosterRepository;
  private userRepo: UserRepository;

  constructor(deps: { dutyRosterRepo: DutyRosterRepository; userRepo: UserRepository }) {
    this.dutyRosterRepo = deps.dutyRosterRepo;
    this.userRepo = deps.userRepo;
  }

  async listarMes(mes?: string): Promise<Record<string, AtribuicaoEscala[]>> {
    const referencia = mes ? new Date(`${mes}-01T00:00:00.000Z`) : new Date();
    const mesInicio = new Date(Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth(), 1));
    const mesFim = new Date(Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth() + 1, 1));
    return this.dutyRosterRepo.listarMes(mesInicio, mesFim);
  }

  async substituirDia(
    dataStr: string,
    atribuicoes: { userId: string; local: LocalEscalaValue }[],
  ): Promise<SubstituirDiaResult> {
    for (const atribuicao of atribuicoes) {
      const usuario = await this.userRepo.findById(atribuicao.userId);
      if (!usuario || usuario.role === 'CHEFE' || !usuario.ativo) {
        return { status: 'usuario_invalido', userId: atribuicao.userId };
      }
    }

    const data = new Date(`${dataStr}T00:00:00.000Z`);
    await this.dutyRosterRepo.substituirDia(data, atribuicoes);
    return { status: 'ok' };
  }
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/unit/duty-roster.service.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Validadores**

Crie `backend/src/validators/duty-roster.validators.ts`:

```ts
import { z } from 'zod';

export const mesQuerySchema = z.object({
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
});

export const dataParamsSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const substituirDiaSchema = z.object({
  atribuicoes: z.array(
    z.object({
      userId: z.string().uuid(),
      local: z.enum(['GABINETE', 'RUA']),
    }),
  ),
});
```

- [ ] **Step 6: Controller**

Crie `backend/src/controllers/duty-roster.controller.ts`:

```ts
import type { Request, Response } from 'express';
import type { DutyRosterService } from '../services/duty-roster.service.js';
import { mesQuerySchema, dataParamsSchema, substituirDiaSchema } from '../validators/duty-roster.validators.js';
import { HttpError } from '../middlewares/error-handler.js';

export function createDutyRosterController(dutyRosterService: DutyRosterService) {
  return {
    async listarMes(req: Request, res: Response) {
      const { mes } = mesQuerySchema.parse(req.query);
      const dias = await dutyRosterService.listarMes(mes);
      res.json({ success: true, data: { dias } });
    },

    async substituirDia(req: Request, res: Response) {
      const { data } = dataParamsSchema.parse(req.params);
      const { atribuicoes } = substituirDiaSchema.parse(req.body);
      const result = await dutyRosterService.substituirDia(data, atribuicoes);
      if (result.status === 'usuario_invalido') {
        throw new HttpError(400, 'Usuário inválido para escala: precisa ser um assessor ativo');
      }
      res.status(204).send();
    },
  };
}
```

- [ ] **Step 7: Rotas**

Crie `backend/src/routes/duty-roster.routes.ts`:

```ts
import { Router } from 'express';
import type { DutyRosterService } from '../services/duty-roster.service.js';
import type { UserRepository } from '../repositories/user.repository.js';
import { createDutyRosterController } from '../controllers/duty-roster.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/require-role.js';

function asyncHandler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next);
}

export function createDutyRosterRouter(deps: {
  dutyRosterService: DutyRosterService;
  userRepo: UserRepository;
}): Router {
  const router = Router();
  const controller = createDutyRosterController(deps.dutyRosterService);
  const auth = authenticate({ userRepo: deps.userRepo });
  const soChefe = requireRole('CHEFE');

  router.get('/', auth, asyncHandler(controller.listarMes));
  router.put('/:data', auth, soChefe, asyncHandler(controller.substituirDia));

  return router;
}
```

- [ ] **Step 8: Wiring no app**

Em `backend/src/app.ts`, adicione aos imports:

```ts
import { createDutyRosterRepository } from './repositories/duty-roster.repository.js';
import { DutyRosterService } from './services/duty-roster.service.js';
import { createDutyRosterRouter } from './routes/duty-roster.routes.js';
```

Depois da linha que cria `dashboardService`, adicione:

```ts
  const dutyRosterRepo = createDutyRosterRepository(prisma);
  const dutyRosterService = new DutyRosterService({ dutyRosterRepo, userRepo });
```

E adicione a linha do router, junto das demais `app.use(...)`:

```ts
  app.use('/escala', createDutyRosterRouter({ dutyRosterService, userRepo }));
```

- [ ] **Step 9: Confirmar que a suíte completa continua passando**

Run: `cd backend && npm test && npm run typecheck`
Expected: tudo passando.

- [ ] **Step 10: Commit**

```bash
git add backend/src/services/duty-roster.service.ts backend/tests/unit/duty-roster.service.test.ts backend/src/validators/duty-roster.validators.ts backend/src/controllers/duty-roster.controller.ts backend/src/routes/duty-roster.routes.ts backend/src/app.ts
git commit -m "feat(backend): rotas da escala do gabinete"
```

---

## Task 4: Testes de integração das rotas da escala

**Files:**
- Create: `backend/tests/integration/duty-roster.routes.test.ts`

**Interfaces:**
- Consumes: as duas rotas da Task 3.

- [ ] **Step 1: Escrever os testes**

```ts
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

async function loginComoAssessor(
  role: 'ASSESSOR_RUA' | 'ASSESSOR_GABINETE' | 'CHEFE' = 'CHEFE',
  telefone = '+5534999995500',
) {
  const assessor = await testPrisma.user.create({
    data: { nome: 'Usuario Teste', telefone, role, ativo: true, pinDefinido: true, pinHash: await hash('482913') },
  });
  const login = await request(app).post('/auth/login').send({ telefone, pin: '482913' });
  return { assessor, accessToken: login.body.data.accessToken as string };
}

describe('GET /escala', () => {
  it('chefe consegue listar a escala do mês', async () => {
    const { accessToken } = await loginComoAssessor('CHEFE');

    const res = await request(app).get('/escala?mes=2026-09').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.dias).toEqual({});
  }, 30000);

  it('assessor de rua e de gabinete também conseguem listar', async () => {
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999995501');
    const { accessToken: tokenGabinete } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999995502');

    const resRua = await request(app).get('/escala').set('Authorization', `Bearer ${tokenRua}`);
    const resGabinete = await request(app).get('/escala').set('Authorization', `Bearer ${tokenGabinete}`);

    expect(resRua.status).toBe(200);
    expect(resGabinete.status).toBe(200);
  }, 30000);

  it('exige autenticação', async () => {
    const res = await request(app).get('/escala');
    expect(res.status).toBe(401);
  }, 30000);
});

describe('PUT /escala/:data', () => {
  it('chefe consegue substituir a escala de um dia', async () => {
    const { accessToken } = await loginComoAssessor('CHEFE', '+5534999995503');
    const assessor = await testPrisma.user.create({
      data: { nome: 'Ana Rua', telefone: '+5534999995504', role: 'ASSESSOR_RUA' },
    });

    const res = await request(app)
      .put('/escala/2026-09-15')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ atribuicoes: [{ userId: assessor.id, local: 'RUA' }] });

    expect(res.status).toBe(204);

    const listagem = await request(app).get('/escala?mes=2026-09').set('Authorization', `Bearer ${accessToken}`);
    expect(listagem.body.data.dias['2026-09-15']).toHaveLength(1);
    expect(listagem.body.data.dias['2026-09-15'][0].local).toBe('RUA');
  }, 30000);

  it('bloqueia assessor de rua e de gabinete com 403', async () => {
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999995505');
    const { accessToken: tokenGabinete } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999995506');

    const resRua = await request(app)
      .put('/escala/2026-09-15')
      .set('Authorization', `Bearer ${tokenRua}`)
      .send({ atribuicoes: [] });
    const resGabinete = await request(app)
      .put('/escala/2026-09-15')
      .set('Authorization', `Bearer ${tokenGabinete}`)
      .send({ atribuicoes: [] });

    expect(resRua.status).toBe(403);
    expect(resGabinete.status).toBe(403);
  }, 30000);

  it('rejeita userId de um chefe com 400', async () => {
    const { accessToken } = await loginComoAssessor('CHEFE', '+5534999995507');
    const outroChefe = await testPrisma.user.create({
      data: { nome: 'Outro Chefe', telefone: '+5534999995508', role: 'CHEFE' },
    });

    const res = await request(app)
      .put('/escala/2026-09-15')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ atribuicoes: [{ userId: outroChefe.id, local: 'GABINETE' }] });

    expect(res.status).toBe(400);
  }, 30000);

  it('rejeita um formato de data inválido com 400', async () => {
    const { accessToken } = await loginComoAssessor('CHEFE', '+5534999995509');

    const res = await request(app)
      .put('/escala/15-09-2026')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ atribuicoes: [] });

    expect(res.status).toBe(400);
  }, 30000);
});
```

- [ ] **Step 2: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/integration/duty-roster.routes.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 3: Rodar toda a suíte do backend**

Run: `cd backend && npm test && npm run typecheck`
Expected: tudo passando.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/integration/duty-roster.routes.test.ts
git commit -m "test(backend): cobertura de integracao das rotas da escala"
```

---

## Task 5: Front-end — tipos e utilitário de calendário

**Files:**
- Create: `frontend/src/types/escala.ts`
- Create: `frontend/src/lib/calendario.ts`
- Test: `frontend/src/lib/calendario.test.ts`

**Interfaces:**
- Produces: tipos `LocalEscalaValue`, `AtribuicaoEscala`; funções `mesAtual`, `hojeISO`, `mesAnterior`, `mesSeguinte`, `gerarGradeCalendario` — consumidos pelas Tasks 6-8.

- [ ] **Step 1: Tipos**

Crie `frontend/src/types/escala.ts`:

```ts
export type LocalEscalaValue = 'GABINETE' | 'RUA';

export interface AtribuicaoEscala {
  userId: string;
  userNome: string;
  local: LocalEscalaValue;
}
```

- [ ] **Step 2: Escrever o teste do utilitário de calendário**

Crie `frontend/src/lib/calendario.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { gerarGradeCalendario, mesAnterior, mesSeguinte } from './calendario';

describe('gerarGradeCalendario', () => {
  it('gera os 30 dias de setembro de 2026, na ordem certa', () => {
    const grade = gerarGradeCalendario('2026-09');
    const diasReais = grade.filter((c) => c.data !== null);

    expect(diasReais).toHaveLength(30);
    expect(diasReais[0]?.data).toBe('2026-09-01');
    expect(diasReais[0]?.diaDoMes).toBe(1);
    expect(diasReais[29]?.data).toBe('2026-09-30');
    expect(diasReais[29]?.diaDoMes).toBe(30);
  });

  it('preenche células vazias antes do dia 1 conforme o dia da semana (2026-09-01 é terça-feira)', () => {
    const grade = gerarGradeCalendario('2026-09');
    const preenchimento = grade.filter((c) => c.data === null);

    expect(preenchimento).toHaveLength(2);
    expect(grade[2]?.data).toBe('2026-09-01');
  });
});

describe('mesAnterior / mesSeguinte', () => {
  it('navega entre meses dentro do mesmo ano', () => {
    expect(mesAnterior('2026-09')).toBe('2026-08');
    expect(mesSeguinte('2026-09')).toBe('2026-10');
  });

  it('navega corretamente na virada do ano', () => {
    expect(mesAnterior('2026-01')).toBe('2025-12');
    expect(mesSeguinte('2026-12')).toBe('2027-01');
  });
});
```

- [ ] **Step 3: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run src/lib/calendario.test.ts`
Expected: FAIL — `./calendario` não existe.

- [ ] **Step 4: Implementar**

Crie `frontend/src/lib/calendario.ts`:

```ts
export interface CelulaCalendario {
  data: string | null;
  diaDoMes: number | null;
}

export function mesAtual(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

export function hojeISO(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
}

export function mesAnterior(mes: string): string {
  const [ano, mesNum] = mes.split('-').map(Number) as [number, number];
  const data = new Date(Date.UTC(ano, mesNum - 2, 1));
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function mesSeguinte(mes: string): string {
  const [ano, mesNum] = mes.split('-').map(Number) as [number, number];
  const data = new Date(Date.UTC(ano, mesNum, 1));
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function gerarGradeCalendario(mes: string): CelulaCalendario[] {
  const [anoStr, mesStr] = mes.split('-') as [string, string];
  const ano = Number(anoStr);
  const mesIndice = Number(mesStr) - 1;
  const primeiroDia = new Date(Date.UTC(ano, mesIndice, 1));
  const diasNoMes = new Date(Date.UTC(ano, mesIndice + 1, 0)).getUTCDate();
  const offsetInicial = primeiroDia.getUTCDay();

  const celulas: CelulaCalendario[] = [];
  for (let i = 0; i < offsetInicial; i++) {
    celulas.push({ data: null, diaDoMes: null });
  }
  for (let dia = 1; dia <= diasNoMes; dia++) {
    celulas.push({ data: `${anoStr}-${mesStr}-${String(dia).padStart(2, '0')}`, diaDoMes: dia });
  }
  return celulas;
}
```

- [ ] **Step 5: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run src/lib/calendario.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 6: Rodar o typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/types/escala.ts frontend/src/lib/calendario.ts frontend/src/lib/calendario.test.ts
git commit -m "feat(frontend): tipos e utilitario de calendario da escala"
```

---

## Task 6: Front-end — componente da grade mensal

**Files:**
- Create: `frontend/src/components/CalendarioMensal.tsx`
- Test: `frontend/src/components/CalendarioMensal.test.tsx`

**Interfaces:**
- Consumes: `gerarGradeCalendario`, `hojeISO`, `mesAnterior`, `mesSeguinte` (Task 5); `AtribuicaoEscala` (Task 5).
- Produces: `<CalendarioMensal />` — consumido pela Task 8.

- [ ] **Step 1: Escrever o teste**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CalendarioMensal } from './CalendarioMensal';

const escalaFake = {
  '2026-09-15': [
    { userId: 'a1', userNome: 'Ana', local: 'RUA' as const },
    { userId: 'a2', userNome: 'Beto', local: 'GABINETE' as const },
  ],
};

describe('CalendarioMensal', () => {
  it('mostra os dias do mês e o resumo de quem está escalado', () => {
    render(
      <CalendarioMensal mes="2026-09" escalaPorDia={escalaFake} onSelecionarDia={() => {}} onMudarMes={() => {}} />,
    );

    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('1 gabinete · 1 rua')).toBeInTheDocument();
  });

  it('chama onSelecionarDia com a data certa ao clicar num dia', () => {
    const onSelecionarDia = vi.fn();
    render(
      <CalendarioMensal mes="2026-09" escalaPorDia={escalaFake} onSelecionarDia={onSelecionarDia} onMudarMes={() => {}} />,
    );

    fireEvent.click(screen.getByText('15'));

    expect(onSelecionarDia).toHaveBeenCalledWith('2026-09-15');
  });

  it('chama onMudarMes com o mês anterior/seguinte ao navegar', () => {
    const onMudarMes = vi.fn();
    render(<CalendarioMensal mes="2026-09" escalaPorDia={{}} onSelecionarDia={() => {}} onMudarMes={onMudarMes} />);

    fireEvent.click(screen.getByLabelText('Próximo mês'));
    expect(onMudarMes).toHaveBeenCalledWith('2026-10');

    fireEvent.click(screen.getByLabelText('Mês anterior'));
    expect(onMudarMes).toHaveBeenCalledWith('2026-08');
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run src/components/CalendarioMensal.test.tsx`
Expected: FAIL — `./CalendarioMensal` não existe.

- [ ] **Step 3: Implementar**

Crie `frontend/src/components/CalendarioMensal.tsx`:

```tsx
'use client';

import { gerarGradeCalendario, hojeISO, mesAnterior, mesSeguinte } from '@/lib/calendario';
import type { AtribuicaoEscala } from '@/types/escala';

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface CalendarioMensalProps {
  mes: string;
  escalaPorDia: Record<string, AtribuicaoEscala[]>;
  onSelecionarDia: (data: string) => void;
  onMudarMes: (novoMes: string) => void;
}

export function CalendarioMensal({ mes, escalaPorDia, onSelecionarDia, onMudarMes }: CalendarioMensalProps) {
  const celulas = gerarGradeCalendario(mes);
  const hoje = hojeISO();

  return (
    <div className="rounded-card bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onMudarMes(mesAnterior(mes))}
          aria-label="Mês anterior"
          className="rounded-lg px-2 py-1 text-sm hover:bg-gray-100"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-primary-dark">{mes}</span>
        <button
          type="button"
          onClick={() => onMudarMes(mesSeguinte(mes))}
          aria-label="Próximo mês"
          className="rounded-lg px-2 py-1 text-sm hover:bg-gray-100"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500">
        {DIAS_SEMANA.map((dia) => (
          <div key={dia}>{dia}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {celulas.map((celula, indice) => {
          if (!celula.data) {
            return <div key={`vazio-${indice}`} />;
          }
          const atribuicoes = escalaPorDia[celula.data] ?? [];
          const gabinete = atribuicoes.filter((a) => a.local === 'GABINETE').length;
          const rua = atribuicoes.filter((a) => a.local === 'RUA').length;
          const ehHoje = celula.data === hoje;

          return (
            <button
              type="button"
              key={celula.data}
              onClick={() => onSelecionarDia(celula.data!)}
              className={`flex min-h-16 flex-col items-start rounded-lg border p-1 text-left text-xs hover:bg-gray-50 ${
                ehHoje ? 'border-primary bg-primary/5' : 'border-gray-200'
              }`}
            >
              <span className="font-medium text-gray-900">{celula.diaDoMes}</span>
              {(gabinete > 0 || rua > 0) && (
                <span className="text-gray-600">
                  {gabinete} gabinete · {rua} rua
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run src/components/CalendarioMensal.test.tsx`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CalendarioMensal.tsx frontend/src/components/CalendarioMensal.test.tsx
git commit -m "feat(frontend): componente de grade mensal da escala"
```

---

## Task 7: Front-end — painel de detalhe/edição do dia

**Files:**
- Create: `frontend/src/components/PainelDiaEscala.tsx`
- Test: `frontend/src/components/PainelDiaEscala.test.tsx`

**Interfaces:**
- Consumes: `apiClient` (Fase 1); `PublicUser` (`@/types/auth`); `AtribuicaoEscala`, `LocalEscalaValue` (Task 5).
- Produces: `<PainelDiaEscala />` — consumido pela Task 8.

- [ ] **Step 1: Escrever o teste**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PainelDiaEscala } from './PainelDiaEscala';

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient } from '@/services/api-client';

const atribuicoesFake = [{ userId: 'a1', userNome: 'Ana', local: 'RUA' as const }];

beforeEach(() => {
  vi.mocked(apiClient.request).mockReset();
});

describe('PainelDiaEscala (somente leitura)', () => {
  it('mostra a lista de atribuições sem controles de edição', () => {
    render(
      <PainelDiaEscala
        data="2026-09-15"
        atribuicoes={atribuicoesFake}
        podeEditar={false}
        onFechar={() => {}}
        onSalvo={() => {}}
      />,
    );

    expect(screen.getByText(/Ana/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar' })).not.toBeInTheDocument();
  });

  it('mostra mensagem quando não há ninguém escalado', () => {
    render(
      <PainelDiaEscala data="2026-09-15" atribuicoes={[]} podeEditar={false} onFechar={() => {}} onSalvo={() => {}} />,
    );

    expect(screen.getByText(/ninguém escalado/i)).toBeInTheDocument();
  });
});

describe('PainelDiaEscala (edição, chefe)', () => {
  it('carrega os assessores ativos e pré-seleciona quem já está escalado', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([
      { id: 'a1', nome: 'Ana', telefone: '1', role: 'ASSESSOR_RUA', ativo: true, pinDefinido: true },
      { id: 'a2', nome: 'Beto', telefone: '2', role: 'ASSESSOR_GABINETE', ativo: true, pinDefinido: true },
    ]);

    render(
      <PainelDiaEscala
        data="2026-09-15"
        atribuicoes={atribuicoesFake}
        podeEditar
        onFechar={() => {}}
        onSalvo={() => {}}
      />,
    );

    expect(await screen.findByText('Ana')).toBeInTheDocument();
    expect(screen.getByLabelText('Ana')).toHaveValue('RUA');
    expect(screen.getByLabelText('Beto')).toHaveValue('');
  });

  it('salva as seleções e chama onSalvo', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([
      { id: 'a1', nome: 'Ana', telefone: '1', role: 'ASSESSOR_RUA', ativo: true, pinDefinido: true },
    ]);
    vi.mocked(apiClient.request).mockResolvedValueOnce(undefined);
    const onSalvo = vi.fn();

    render(<PainelDiaEscala data="2026-09-15" atribuicoes={[]} podeEditar onFechar={() => {}} onSalvo={onSalvo} />);

    await screen.findByText('Ana');
    fireEvent.change(screen.getByLabelText('Ana'), { target: { value: 'GABINETE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(onSalvo).toHaveBeenCalledWith('2026-09-15', [{ userId: 'a1', local: 'GABINETE', userNome: 'Ana' }]),
    );
    const [url, options] = vi.mocked(apiClient.request).mock.calls[1]!;
    expect(url).toBe('/escala/2026-09-15');
    expect(options?.method).toBe('PUT');
    expect(options?.body).toEqual({ atribuicoes: [{ userId: 'a1', local: 'GABINETE' }] });
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run src/components/PainelDiaEscala.test.tsx`
Expected: FAIL — `./PainelDiaEscala` não existe.

- [ ] **Step 3: Implementar**

Crie `frontend/src/components/PainelDiaEscala.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { apiClient, ApiError } from '@/services/api-client';
import type { PublicUser } from '@/types/auth';
import type { AtribuicaoEscala, LocalEscalaValue } from '@/types/escala';

interface PainelDiaEscalaProps {
  data: string;
  atribuicoes: AtribuicaoEscala[];
  podeEditar: boolean;
  onFechar: () => void;
  onSalvo: (data: string, novasAtribuicoes: AtribuicaoEscala[]) => void;
}

type SelecaoLocal = LocalEscalaValue | '';

export function PainelDiaEscala({ data, atribuicoes, podeEditar, onFechar, onSalvo }: PainelDiaEscalaProps) {
  const [assessores, setAssessores] = useState<PublicUser[]>([]);
  const [selecoes, setSelecoes] = useState<Record<string, SelecaoLocal>>({});
  const [carregando, setCarregando] = useState(podeEditar);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!podeEditar) return;
    apiClient
      .request<PublicUser[]>('/usuarios?ativo=true', { auth: true })
      .then((lista) => {
        const naoChefes = lista.filter((u) => u.role !== 'CHEFE');
        setAssessores(naoChefes);
        const iniciais: Record<string, SelecaoLocal> = {};
        for (const assessor of naoChefes) {
          const atual = atribuicoes.find((a) => a.userId === assessor.id);
          iniciais[assessor.id] = atual?.local ?? '';
        }
        setSelecoes(iniciais);
      })
      .catch(() => setErro('Não foi possível carregar os assessores.'))
      .finally(() => setCarregando(false));
    // `atribuicoes` fica de fora de propósito: só deve reiniciar a seleção quando o
    // painel troca de dia, não a cada nova referência de array vinda do pai.
  }, [podeEditar, data]);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const novasAtribuicoes = Object.entries(selecoes)
        .filter((entrada): entrada is [string, LocalEscalaValue] => entrada[1] !== '')
        .map(([userId, local]) => ({ userId, local }));

      await apiClient.request(`/escala/${data}`, {
        method: 'PUT',
        auth: true,
        body: { atribuicoes: novasAtribuicoes },
      });

      const comNome: AtribuicaoEscala[] = novasAtribuicoes.map(({ userId, local }) => ({
        userId,
        local,
        userNome: assessores.find((a) => a.id === userId)?.nome ?? '',
      }));
      onSalvo(data, comNome);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível salvar. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-card bg-white p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-primary-dark">Escala de {data}</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="text-gray-500 hover:text-gray-700">
            ✕
          </button>
        </div>

        {!podeEditar && (
          <ul className="flex flex-col gap-1">
            {atribuicoes.length === 0 && <li className="text-sm text-gray-500">Ninguém escalado neste dia.</li>}
            {atribuicoes.map((a) => (
              <li key={a.userId} className="text-sm text-gray-800">
                {a.userNome} — {a.local === 'GABINETE' ? 'Gabinete' : 'Rua'}
              </li>
            ))}
          </ul>
        )}

        {podeEditar && carregando && <p className="text-sm text-gray-500">Carregando…</p>}

        {podeEditar && !carregando && (
          <div className="flex flex-col gap-2">
            {assessores.map((assessor) => (
              <div key={assessor.id} className="flex items-center justify-between gap-2">
                <label htmlFor={`local-${assessor.id}`} className="text-sm text-gray-800">
                  {assessor.nome}
                </label>
                <select
                  id={`local-${assessor.id}`}
                  value={selecoes[assessor.id] ?? ''}
                  onChange={(e) =>
                    setSelecoes((prev) => ({ ...prev, [assessor.id]: e.target.value as SelecaoLocal }))
                  }
                  className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                >
                  <option value="">Não escalado</option>
                  <option value="GABINETE">Gabinete</option>
                  <option value="RUA">Rua</option>
                </select>
              </div>
            ))}
            <button
              type="button"
              onClick={salvar}
              disabled={salvando}
              className="mt-2 w-fit rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Salvar
            </button>
          </div>
        )}

        {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run src/components/PainelDiaEscala.test.tsx`
Expected: PASS (4 testes).

- [ ] **Step 5: Rodar o typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/PainelDiaEscala.tsx frontend/src/components/PainelDiaEscala.test.tsx
git commit -m "feat(frontend): painel de detalhe e edicao do dia da escala"
```

---

## Task 8: Front-end — página da escala, navegação e verificação final

**Files:**
- Create: `frontend/src/app/painel/escala/page.tsx`
- Test: `frontend/src/app/painel/escala/page.test.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/components/MobileNav.tsx`

**Interfaces:**
- Consumes: `CalendarioMensal` (Task 6), `PainelDiaEscala` (Task 7), `mesAtual` (Task 5), `useAuth` (Fase 1).

- [ ] **Step 1: Escrever o teste da página**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EscalaPage from './page';

const useAuthMock = vi.fn();
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => useAuthMock() }));

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient } from '@/services/api-client';

vi.mock('@/lib/calendario', async () => {
  const actual = await vi.importActual<typeof import('@/lib/calendario')>('@/lib/calendario');
  return { ...actual, mesAtual: () => '2026-09' };
});

describe('EscalaPage', () => {
  it('carrega a escala do mês atual e mostra o calendário', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'chefe-1', role: 'CHEFE' } });
    vi.mocked(apiClient.request).mockResolvedValueOnce({ dias: {} });

    render(<EscalaPage />);

    await waitFor(() => expect(apiClient.request).toHaveBeenCalledWith('/escala?mes=2026-09', { auth: true }));
    expect(await screen.findByText('2026-09')).toBeInTheDocument();
  });

  it('abre o painel do dia ao clicar num dia, editável para o chefe', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'chefe-1', role: 'CHEFE' } });
    vi.mocked(apiClient.request).mockResolvedValueOnce({ dias: {} }).mockResolvedValueOnce([]);

    render(<EscalaPage />);
    await screen.findByText('2026-09');

    fireEvent.click(screen.getByText('15'));

    expect(await screen.findByText('Escala de 2026-09-15')).toBeInTheDocument();
  });

  it('mostra mensagem de erro quando a API falha', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'a1', role: 'ASSESSOR_RUA' } });
    vi.mocked(apiClient.request).mockRejectedValueOnce(new Error('falhou'));

    render(<EscalaPage />);

    expect(await screen.findByText(/não foi possível carregar a escala/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run "src/app/painel/escala/page.test.tsx"`
Expected: FAIL — `./page` não existe.

- [ ] **Step 3: Implementar a página**

Crie `frontend/src/app/painel/escala/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { apiClient } from '@/services/api-client';
import { mesAtual } from '@/lib/calendario';
import { CalendarioMensal } from '@/components/CalendarioMensal';
import { PainelDiaEscala } from '@/components/PainelDiaEscala';
import type { AtribuicaoEscala } from '@/types/escala';

export default function EscalaPage() {
  const { user } = useAuth();
  const [mes, setMes] = useState(mesAtual());
  const [escalaPorDia, setEscalaPorDia] = useState<Record<string, AtribuicaoEscala[]>>({});
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    setCarregando(true);
    setErro(false);
    apiClient
      .request<{ dias: Record<string, AtribuicaoEscala[]> }>(`/escala?mes=${mes}`, { auth: true })
      .then((res) => setEscalaPorDia(res.dias))
      .catch(() => setErro(true))
      .finally(() => setCarregando(false));
  }, [mes]);

  function handleSalvo(data: string, novasAtribuicoes: AtribuicaoEscala[]) {
    setEscalaPorDia((prev) => ({ ...prev, [data]: novasAtribuicoes }));
    setDiaSelecionado(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-primary-dark">Escala do gabinete</h1>

      {carregando && <p className="text-sm text-gray-500">Carregando…</p>}
      {erro && <p className="text-sm text-red-600">Não foi possível carregar a escala.</p>}

      {!carregando && !erro && (
        <CalendarioMensal mes={mes} escalaPorDia={escalaPorDia} onSelecionarDia={setDiaSelecionado} onMudarMes={setMes} />
      )}

      {diaSelecionado && (
        <PainelDiaEscala
          data={diaSelecionado}
          atribuicoes={escalaPorDia[diaSelecionado] ?? []}
          podeEditar={user?.role === 'CHEFE'}
          onFechar={() => setDiaSelecionado(null)}
          onSalvo={handleSalvo}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run "src/app/painel/escala/page.test.tsx"`
Expected: PASS (3 testes).

- [ ] **Step 5: Adicionar o link na navegação (visível a todos os papéis)**

Em `frontend/src/components/Sidebar.tsx` e `frontend/src/components/MobileNav.tsx`, adicione um item à lista `ITENS` de cada arquivo, logo depois de `{ href: '/painel/demandas', label: 'Demandas' }` e antes do item do Dashboard:

```tsx
  { href: '/painel/escala', label: 'Escala' },
```

Sem `somenteChefe` — diferente do Dashboard, este item aparece pra todo mundo.

- [ ] **Step 6: Verificação final — suíte completa do front-end, build, e suíte completa do backend**

Run: `cd frontend && npx vitest run && npx tsc --noEmit && npm run build`
Expected: tudo passando, build conclui sem erros.

Run: `cd backend && npm test && npm run typecheck`
Expected: tudo passando (garantia de que nada quebrou nesta fase).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/painel/escala frontend/src/components/Sidebar.tsx frontend/src/components/MobileNav.tsx
git commit -m "feat(frontend): pagina da escala e link de navegacao para todos os papeis"
```
