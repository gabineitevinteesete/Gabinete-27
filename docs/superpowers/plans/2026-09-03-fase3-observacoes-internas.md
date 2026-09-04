# Fase 3 (parte 2) — Observações Internas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assessor de gabinete e chefe conseguem deixar, ver, editar e apagar anotações internas numa demanda — visíveis só entre eles, nunca para o assessor de rua nem para o munícipe.

**Architecture:** Módulo novo e isolado (repository → service → controller), separado de `request.service.ts`/`request.repository.ts` para não fazer esses arquivos já grandes crescerem mais — a única dependência cruzada é o `InternalNoteService` chamar `RequestRepository.findById` para confirmar que a demanda existe antes de criar/listar observações. As rotas ficam aninhadas em `/demandas/:id/observacoes` dentro do router de demandas já existente (mesmo padrão das rotas de status/reatribuição da Fase 3 parte 1), mas apontam para um controller próprio.

**Tech Stack:** Mesmo da Fase 3 parte 1 — Express, TypeScript, Prisma, Zod; Next.js, React, Tailwind (mesmos componentes/tokens já existentes, nenhum novo).

## Global Constraints

- `ASSESSOR_GABINETE` e `CHEFE` podem criar e ver observações internas, em qualquer demanda, em qualquer status.
- `ASSESSOR_RUA` não tem acesso a observações internas: nenhuma das 4 rotas, em nenhuma demanda (nem nas próprias) — bloqueio total por papel, não uma regra de "dono".
- Editar e apagar uma observação são exclusivos de quem a escreveu — mesmo `CHEFE` não edita/apaga a nota de outra pessoa. 403 para qualquer outro autor.
- Apagar é exclusão real da linha (não existe "removida mas guardada" nesta fase).
- `autorId` de uma observação vem sempre do usuário autenticado (`req.user.id`), nunca do corpo da requisição.
- `updatedAt` só é preenchido quando a nota é de fato editada (fica `null` até lá) — não usa o `@updatedAt` automático do Prisma, que mudaria em qualquer `update`.
- Interface 100% em português do Brasil; sem comentários no código a não ser para documentar um porquê não óbvio.
- Toda regra de permissão é aplicada no backend, nunca só escondida no front-end.

---

## Task 1: Schema — campo de edição na observação interna

**Files:**
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Produces: `InternalNote.updatedAt: DateTime | null` — consumido pela Task 2 (repositório).

- [ ] **Step 1: Adicionar o campo ao `model InternalNote`**

Abra `backend/prisma/schema.prisma` e localize o `model InternalNote` (por volta da linha 196). Adicione `updatedAt` logo depois de `createdAt`:

```prisma
model InternalNote {
  id        String    @id @default(uuid())
  requestId String
  request   Request   @relation(fields: [requestId], references: [id])
  autorId   String
  autor     User      @relation("InternalNoteAuthor", fields: [autorId], references: [id])
  texto     String
  createdAt DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt DateTime? @db.Timestamptz(3)

  @@index([requestId])
  @@map("internal_notes")
}
```

(Só a linha `updatedAt DateTime? @db.Timestamptz(3)` é nova — o resto do bloco já existe, mantenha exatamente como está.)

- [ ] **Step 2: Gerar e aplicar a migração**

Run (a partir de `backend/`, contra o banco `production`/dev do Neon já configurado em `.env`):
```bash
npx prisma migrate dev --name add_internal_note_updated_at
```
Expected: cria uma nova pasta em `prisma/migrations/`, aplica no Neon dev, regenera o Prisma Client sem erros.

- [ ] **Step 3: Confirmar que o typecheck do backend continua limpo**

Run: `npm run typecheck` (a partir de `backend/`)
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(backend): adiciona updatedAt as observacoes internas"
```

---

## Task 2: Repositório de observações internas

**Files:**
- Create: `backend/src/repositories/internal-note.repository.ts`
- Modify: `backend/tests/helpers/fakes.ts` (adicionar `createFakeInternalNoteRepo`)
- Test: `backend/tests/integration/internal-note.repository.test.ts`

**Interfaces:**
- Produces: `InternalNoteRepository` (`create`, `list`, `findById`, `update`, `delete`), `InternalNoteItem` — consumidos pela Task 4 (service).

- [ ] **Step 1: Escrever o teste**

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createInternalNoteRepository } from '../../src/repositories/internal-note.repository.js';
import { createRequestRepository, type CriarRequestInput } from '../../src/repositories/request.repository.js';

const prisma = new PrismaClient();
const internalNoteRepo = createInternalNoteRepository(prisma);
const requestRepo = createRequestRepository(prisma);

let tipoId: string;
let assessorId: string;

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await prisma.internalNote.deleteMany();
  await prisma.requestPhoto.deleteMany();
  await prisma.requestStatusHistory.deleteMany();
  await prisma.requestReassignmentHistory.deleteMany();
  await prisma.request.deleteMany();
  await prisma.requestType.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  const tipo = await prisma.requestType.create({
    data: { nome: 'Tapa-buraco', ativo: true, exigeDescricaoObrigatoria: false },
  });
  tipoId = tipo.id;

  const assessor = await prisma.user.create({
    data: { nome: 'Assessor Teste', telefone: '+5534999997100', role: 'ASSESSOR_GABINETE' },
  });
  assessorId = assessor.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

function inputBase(overrides: Partial<CriarRequestInput> = {}): CriarRequestInput {
  return {
    codigoInterno: 'GD-obs-0001',
    solicitanteNome: 'Maria Solicitante',
    solicitanteTelefone: '+5534999990000',
    tituloResumido: 'Buraco na rua',
    descricao: 'Buraco grande em frente ao número 100',
    requestTypeId: tipoId,
    assessorResponsavelId: assessorId,
    autorizacaoDados: true,
    ...overrides,
  };
}

const fotoBase = { url: 'https://cdn.example/a.jpg', publicId: 'a', larguraPx: 800, alturaPx: 600, bytes: 12345 };

async function criarDemanda(codigoInterno: string) {
  return requestRepo.create(inputBase({ codigoInterno }), [fotoBase]);
}

describe('InternalNoteRepository.create', () => {
  it('cria a observação com autor e sem updatedAt', async () => {
    const demanda = await criarDemanda('GD-obs-1');

    const criada = await internalNoteRepo.create(demanda.id, assessorId, 'Liguei pra prefeitura');

    expect(criada.texto).toBe('Liguei pra prefeitura');
    expect(criada.autorId).toBe(assessorId);
    expect(criada.autorNome).toBe('Assessor Teste');
    expect(criada.requestId).toBe(demanda.id);
    expect(criada.updatedAt).toBeNull();
  });
});

describe('InternalNoteRepository.list', () => {
  it('lista as observações da demanda, mais recente primeiro', async () => {
    const demanda = await criarDemanda('GD-obs-2');
    await internalNoteRepo.create(demanda.id, assessorId, 'Primeira nota');
    await internalNoteRepo.create(demanda.id, assessorId, 'Segunda nota');

    const lista = await internalNoteRepo.list(demanda.id);

    expect(lista).toHaveLength(2);
    expect(lista[0]?.texto).toBe('Segunda nota');
    expect(lista[1]?.texto).toBe('Primeira nota');
  });

  it('não retorna observações de outra demanda', async () => {
    const demandaA = await criarDemanda('GD-obs-3');
    const demandaB = await criarDemanda('GD-obs-4');
    await internalNoteRepo.create(demandaA.id, assessorId, 'Nota da A');
    await internalNoteRepo.create(demandaB.id, assessorId, 'Nota da B');

    const lista = await internalNoteRepo.list(demandaA.id);

    expect(lista).toHaveLength(1);
    expect(lista[0]?.texto).toBe('Nota da A');
  });
});

describe('InternalNoteRepository.findById', () => {
  it('retorna null quando não existe', async () => {
    const encontrada = await internalNoteRepo.findById('00000000-0000-0000-0000-000000000000');
    expect(encontrada).toBeNull();
  });

  it('retorna a observação quando existe', async () => {
    const demanda = await criarDemanda('GD-obs-5');
    const criada = await internalNoteRepo.create(demanda.id, assessorId, 'Nota');

    const encontrada = await internalNoteRepo.findById(criada.id);

    expect(encontrada?.texto).toBe('Nota');
  });
});

describe('InternalNoteRepository.update', () => {
  it('atualiza o texto e grava updatedAt', async () => {
    const demanda = await criarDemanda('GD-obs-6');
    const criada = await internalNoteRepo.create(demanda.id, assessorId, 'Texto original');

    const atualizada = await internalNoteRepo.update(criada.id, 'Texto corrigido');

    expect(atualizada.texto).toBe('Texto corrigido');
    expect(atualizada.updatedAt).not.toBeNull();
  });
});

describe('InternalNoteRepository.delete', () => {
  it('remove a observação', async () => {
    const demanda = await criarDemanda('GD-obs-7');
    const criada = await internalNoteRepo.create(demanda.id, assessorId, 'Nota a apagar');

    await internalNoteRepo.delete(criada.id);

    const encontrada = await internalNoteRepo.findById(criada.id);
    expect(encontrada).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/integration/internal-note.repository.test.ts`
Expected: FAIL — `../../src/repositories/internal-note.repository.js` não existe.

- [ ] **Step 3: Implementar**

Crie `backend/src/repositories/internal-note.repository.ts`:

```ts
import type { PrismaClient } from '@prisma/client';

export interface InternalNoteItem {
  id: string;
  requestId: string;
  autorId: string;
  autorNome: string;
  texto: string;
  createdAt: Date;
  updatedAt: Date | null;
}

export interface InternalNoteRepository {
  create(requestId: string, autorId: string, texto: string): Promise<InternalNoteItem>;
  list(requestId: string): Promise<InternalNoteItem[]>;
  findById(id: string): Promise<InternalNoteItem | null>;
  update(id: string, texto: string): Promise<InternalNoteItem>;
  delete(id: string): Promise<void>;
}

const INCLUDE_AUTOR = { autor: { select: { nome: true } } } as const;

function toItem(row: {
  id: string;
  requestId: string;
  autorId: string;
  autor: { nome: string };
  texto: string;
  createdAt: Date;
  updatedAt: Date | null;
}): InternalNoteItem {
  return {
    id: row.id,
    requestId: row.requestId,
    autorId: row.autorId,
    autorNome: row.autor.nome,
    texto: row.texto,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createInternalNoteRepository(prisma: PrismaClient): InternalNoteRepository {
  return {
    async create(requestId, autorId, texto) {
      const criada = await prisma.internalNote.create({
        data: { requestId, autorId, texto },
        include: INCLUDE_AUTOR,
      });
      return toItem(criada);
    },

    async list(requestId) {
      const rows = await prisma.internalNote.findMany({
        where: { requestId },
        include: INCLUDE_AUTOR,
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toItem);
    },

    async findById(id) {
      const row = await prisma.internalNote.findUnique({
        where: { id },
        include: INCLUDE_AUTOR,
      });
      return row ? toItem(row) : null;
    },

    async update(id, texto) {
      const atualizada = await prisma.internalNote.update({
        where: { id },
        data: { texto, updatedAt: new Date() },
        include: INCLUDE_AUTOR,
      });
      return toItem(atualizada);
    },

    async delete(id) {
      await prisma.internalNote.delete({ where: { id } });
    },
  };
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/integration/internal-note.repository.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Estender o fake para os testes unitários (Task 4 vai precisar)**

Adicione ao final de `backend/tests/helpers/fakes.ts`:

```ts
import type { InternalNoteRepository, InternalNoteItem } from '../../src/repositories/internal-note.repository.js';

export function createFakeInternalNoteRepo(): InternalNoteRepository & { store: InternalNoteItem[] } {
  const store: InternalNoteItem[] = [];
  let contador = 0;

  return {
    store,
    async create(requestId, autorId, texto) {
      contador += 1;
      const item: InternalNoteItem = {
        id: `fake-nota-${contador}`,
        requestId,
        autorId,
        autorNome: 'Autor Fake',
        texto,
        createdAt: new Date(),
        updatedAt: null,
      };
      store.push(item);
      return item;
    },
    async list(requestId) {
      return store.filter((n) => n.requestId === requestId).slice().reverse();
    },
    async findById(id) {
      return store.find((n) => n.id === id) ?? null;
    },
    async update(id, texto) {
      const existente = store.find((n) => n.id === id);
      if (!existente) throw new Error('Observação não encontrada (fake)');
      existente.texto = texto;
      existente.updatedAt = new Date();
      return existente;
    },
    async delete(id) {
      const indice = store.findIndex((n) => n.id === id);
      if (indice !== -1) store.splice(indice, 1);
    },
  };
}
```

Adicione esse mesmo import (`import type { InternalNoteRepository, InternalNoteItem } from ...`) junto dos demais imports no topo do arquivo em vez de deixá-lo solto no meio — mova a linha `import` para o topo do arquivo, junto dos outros imports já existentes, e deixe só a função `createFakeInternalNoteRepo` no ponto onde foi adicionada.

- [ ] **Step 6: Limpar `internal_notes` no helper compartilhado de reset do banco de teste**

`InternalNote.requestId` tem a mesma FK `RESTRICT` para `Request` que `RequestStatusHistory`/`RequestReassignmentHistory` já têm — só que, até esta task, nenhum teste de integração jamais gravou uma linha em `internal_notes`, então o helper compartilhado `backend/tests/helpers/reset-db.ts` nunca precisou limpar essa tabela. Esta task é a primeira a gravar linhas reais ali (via `internalNoteRepo.create` nos testes desta task, e depois via `POST /demandas/:id/observacoes` na Task 6) — sem este ajuste, `resetDb()` vai começar a falhar com erro de FK RESTRICT no `request.deleteMany()` assim que a suíte completa rodar (mesma causa-raiz do ajuste já feito no arquivo por conta de `RequestStatusHistory`/`RequestReassignmentHistory`, documentada no comentário já existente ali).

Em `backend/tests/helpers/reset-db.ts`, adicione `testPrisma.internalNote.deleteMany()` antes de `testPrisma.request.deleteMany()`:

```ts
export async function resetDb() {
  await testPrisma.auditLog.deleteMany();
  await testPrisma.loginAttempt.deleteMany();
  // requestPhoto/request/requestType precisam ser limpos antes de refreshToken/user por
  // causa das FKs RESTRICT em requests (assessorResponsavelId, requestTypeId) — desde que
  // o repositório de demandas passou a popular essas tabelas nos testes de integração.
  // requestStatusHistory/requestReassignmentHistory/internalNote também referenciam request
  // com FK RESTRICT — precisam ser limpas antes de request.
  await testPrisma.requestPhoto.deleteMany();
  await testPrisma.requestStatusHistory.deleteMany();
  await testPrisma.requestReassignmentHistory.deleteMany();
  await testPrisma.internalNote.deleteMany();
  await testPrisma.request.deleteMany();
  await testPrisma.requestType.deleteMany();
  await testPrisma.refreshToken.deleteMany();
  await testPrisma.user.deleteMany();
}
```

(Só a linha `await testPrisma.internalNote.deleteMany();` é nova, mais a palavra "internalNote" acrescentada ao comentário já existente — o resto do arquivo já existe, mantenha exatamente como está.)

- [ ] **Step 7: Rodar toda a suíte do backend**

Run: `cd backend && npm test && npm run typecheck`
Expected: tudo passando.

- [ ] **Step 8: Commit**

```bash
git add backend/src/repositories/internal-note.repository.ts backend/tests/helpers/fakes.ts backend/tests/helpers/reset-db.ts backend/tests/integration/internal-note.repository.test.ts
git commit -m "feat(backend): repositorio de observacoes internas"
```

---

## Task 3: Validadores

**Files:**
- Create: `backend/src/validators/internal-note.validators.ts`
- Test: `backend/tests/unit/internal-note.validators.test.ts`

**Interfaces:**
- Consumes: nada de outra task.
- Produces: `criarObservacaoSchema`, `editarObservacaoSchema`, `observacaoIdParamsSchema` — consumidos pela Task 5 (controller). (`demandaIdParamsSchema`, já existente em `backend/src/validators/request.validators.ts`, é reaproveitado para as rotas que só têm `:id` — não é redefinido aqui.)

- [ ] **Step 1: Escrever o teste**

```ts
import { describe, it, expect } from 'vitest';
import { criarObservacaoSchema, editarObservacaoSchema, observacaoIdParamsSchema } from '../../src/validators/internal-note.validators.js';

describe('criarObservacaoSchema', () => {
  it('aceita um texto não vazio', () => {
    const resultado = criarObservacaoSchema.safeParse({ texto: 'Liguei pra prefeitura' });
    expect(resultado.success).toBe(true);
  });

  it('rejeita texto vazio', () => {
    const resultado = criarObservacaoSchema.safeParse({ texto: '' });
    expect(resultado.success).toBe(false);
  });

  it('rejeita quando texto não é informado', () => {
    const resultado = criarObservacaoSchema.safeParse({});
    expect(resultado.success).toBe(false);
  });
});

describe('editarObservacaoSchema', () => {
  it('aceita um texto não vazio', () => {
    const resultado = editarObservacaoSchema.safeParse({ texto: 'Texto corrigido' });
    expect(resultado.success).toBe(true);
  });

  it('rejeita texto vazio', () => {
    const resultado = editarObservacaoSchema.safeParse({ texto: '' });
    expect(resultado.success).toBe(false);
  });
});

describe('observacaoIdParamsSchema', () => {
  it('aceita dois uuids válidos', () => {
    const resultado = observacaoIdParamsSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111',
      notaId: '22222222-2222-2222-2222-222222222222',
    });
    expect(resultado.success).toBe(true);
  });

  it('rejeita quando notaId não é uuid', () => {
    const resultado = observacaoIdParamsSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111',
      notaId: 'nao-e-um-uuid',
    });
    expect(resultado.success).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/unit/internal-note.validators.test.ts`
Expected: FAIL — `../../src/validators/internal-note.validators.js` não existe.

- [ ] **Step 3: Implementar**

Crie `backend/src/validators/internal-note.validators.ts`:

```ts
import { z } from 'zod';

export const criarObservacaoSchema = z.object({
  texto: z.string().min(1),
});

export const editarObservacaoSchema = z.object({
  texto: z.string().min(1),
});

export const observacaoIdParamsSchema = z.object({
  id: z.string().uuid(),
  notaId: z.string().uuid(),
});
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/unit/internal-note.validators.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/validators/internal-note.validators.ts backend/tests/unit/internal-note.validators.test.ts
git commit -m "feat(backend): validadores de observacoes internas"
```

---

## Task 4: Service — regras de permissão e orquestração

**Files:**
- Create: `backend/src/services/internal-note.service.ts`
- Test: `backend/tests/unit/internal-note.service.test.ts`

**Interfaces:**
- Consumes: `InternalNoteRepository`/`InternalNoteItem` (Task 2); `RequestRepository` (Fase 2, já existe — só usa `findById` para confirmar que a demanda existe).
- Produces: `InternalNoteService` (`criar`, `listar`, `editar`, `apagar`), tipos `CriarObservacaoResultado`, `ListarObservacoesResultado`, `EditarObservacaoResultado`, `ApagarObservacaoResultado` — consumidos pela Task 5 (controller).

- [ ] **Step 1: Escrever o teste**

```ts
import { describe, it, expect } from 'vitest';
import { InternalNoteService } from '../../src/services/internal-note.service.js';
import { createFakeInternalNoteRepo, createFakeRequestRepo, createFakeRequestTypeRepo, createFakePhotoUploader, createFakeUserRepo } from '../helpers/fakes.js';

function buildService() {
  const internalNoteRepo = createFakeInternalNoteRepo();
  const requestRepo = createFakeRequestRepo();
  const service = new InternalNoteService({ internalNoteRepo, requestRepo });
  return { service, internalNoteRepo, requestRepo };
}

async function criarDemandaFake(requestRepo: ReturnType<typeof createFakeRequestRepo>) {
  return requestRepo.create(
    {
      codigoInterno: `GD-${Math.random()}`,
      solicitanteNome: 'Solicitante',
      solicitanteTelefone: '+5534999990000',
      tituloResumido: 'Título',
      descricao: 'Descrição',
      requestTypeId: 'tipo-1',
      assessorResponsavelId: 'gabinete-1',
      autorizacaoDados: true,
    },
    [{ url: 'https://cdn/a.jpg', publicId: 'a', larguraPx: 10, alturaPx: 10, bytes: 100 }],
  );
}

describe('InternalNoteService.criar', () => {
  it('cria a observação quando a demanda existe', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo);

    const resultado = await service.criar(demanda.id, 'gabinete-1', 'Liguei pra prefeitura');

    expect(resultado.status).toBe('ok');
    if (resultado.status === 'ok') {
      expect(resultado.observacao.texto).toBe('Liguei pra prefeitura');
      expect(resultado.observacao.autorId).toBe('gabinete-1');
    }
  });

  it('retorna nao_encontrada para uma demanda inexistente', async () => {
    const { service } = buildService();
    const resultado = await service.criar('id-inexistente', 'gabinete-1', 'Nota');
    expect(resultado.status).toBe('nao_encontrada');
  });
});

describe('InternalNoteService.listar', () => {
  it('lista as observações da demanda', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo);
    await service.criar(demanda.id, 'gabinete-1', 'Primeira');
    await service.criar(demanda.id, 'gabinete-1', 'Segunda');

    const resultado = await service.listar(demanda.id);

    expect(resultado.status).toBe('ok');
    if (resultado.status === 'ok') {
      expect(resultado.observacoes).toHaveLength(2);
    }
  });

  it('retorna nao_encontrada para uma demanda inexistente', async () => {
    const { service } = buildService();
    const resultado = await service.listar('id-inexistente');
    expect(resultado.status).toBe('nao_encontrada');
  });
});

describe('InternalNoteService.editar', () => {
  it('autor edita a própria observação', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo);
    const criada = await service.criar(demanda.id, 'gabinete-1', 'Original');
    const notaId = criada.status === 'ok' ? criada.observacao.id : '';

    const resultado = await service.editar(demanda.id, notaId, 'Corrigida', 'gabinete-1');

    expect(resultado.status).toBe('ok');
    if (resultado.status === 'ok') {
      expect(resultado.observacao.texto).toBe('Corrigida');
      expect(resultado.observacao.updatedAt).not.toBeNull();
    }
  });

  it('bloqueia quem não é o autor', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo);
    const criada = await service.criar(demanda.id, 'gabinete-1', 'Original');
    const notaId = criada.status === 'ok' ? criada.observacao.id : '';

    const resultado = await service.editar(demanda.id, notaId, 'Tentativa', 'gabinete-2');

    expect(resultado.status).toBe('sem_permissao');
  });

  it('retorna nao_encontrada para uma nota inexistente', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo);
    const resultado = await service.editar(demanda.id, 'nota-inexistente', 'Texto', 'gabinete-1');
    expect(resultado.status).toBe('nao_encontrada');
  });

  it('retorna nao_encontrada quando a nota não pertence à demanda informada', async () => {
    const { service, requestRepo } = buildService();
    const demandaA = await criarDemandaFake(requestRepo);
    const demandaB = await criarDemandaFake(requestRepo);
    const criada = await service.criar(demandaA.id, 'gabinete-1', 'Nota da A');
    const notaId = criada.status === 'ok' ? criada.observacao.id : '';

    const resultado = await service.editar(demandaB.id, notaId, 'Tentativa', 'gabinete-1');

    expect(resultado.status).toBe('nao_encontrada');
  });
});

describe('InternalNoteService.apagar', () => {
  it('autor apaga a própria observação', async () => {
    const { service, requestRepo, internalNoteRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo);
    const criada = await service.criar(demanda.id, 'gabinete-1', 'Nota a apagar');
    const notaId = criada.status === 'ok' ? criada.observacao.id : '';

    const resultado = await service.apagar(demanda.id, notaId, 'gabinete-1');

    expect(resultado.status).toBe('ok');
    expect(internalNoteRepo.store).toHaveLength(0);
  });

  it('bloqueia quem não é o autor', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo);
    const criada = await service.criar(demanda.id, 'gabinete-1', 'Nota');
    const notaId = criada.status === 'ok' ? criada.observacao.id : '';

    const resultado = await service.apagar(demanda.id, notaId, 'gabinete-2');

    expect(resultado.status).toBe('sem_permissao');
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/unit/internal-note.service.test.ts`
Expected: FAIL — `../../src/services/internal-note.service.js` não existe.

- [ ] **Step 3: Implementar**

Crie `backend/src/services/internal-note.service.ts`:

```ts
import type { InternalNoteRepository, InternalNoteItem } from '../repositories/internal-note.repository.js';
import type { RequestRepository } from '../repositories/request.repository.js';

export type CriarObservacaoResultado =
  | { status: 'ok'; observacao: InternalNoteItem }
  | { status: 'nao_encontrada' };

export type ListarObservacoesResultado =
  | { status: 'ok'; observacoes: InternalNoteItem[] }
  | { status: 'nao_encontrada' };

export type EditarObservacaoResultado =
  | { status: 'ok'; observacao: InternalNoteItem }
  | { status: 'nao_encontrada' }
  | { status: 'sem_permissao' };

export type ApagarObservacaoResultado =
  | { status: 'ok' }
  | { status: 'nao_encontrada' }
  | { status: 'sem_permissao' };

export class InternalNoteService {
  private internalNoteRepo: InternalNoteRepository;
  private requestRepo: RequestRepository;

  constructor(deps: { internalNoteRepo: InternalNoteRepository; requestRepo: RequestRepository }) {
    this.internalNoteRepo = deps.internalNoteRepo;
    this.requestRepo = deps.requestRepo;
  }

  async criar(requestId: string, autorId: string, texto: string): Promise<CriarObservacaoResultado> {
    const demanda = await this.requestRepo.findById(requestId);
    if (!demanda) return { status: 'nao_encontrada' };
    const observacao = await this.internalNoteRepo.create(requestId, autorId, texto);
    return { status: 'ok', observacao };
  }

  async listar(requestId: string): Promise<ListarObservacoesResultado> {
    const demanda = await this.requestRepo.findById(requestId);
    if (!demanda) return { status: 'nao_encontrada' };
    const observacoes = await this.internalNoteRepo.list(requestId);
    return { status: 'ok', observacoes };
  }

  async editar(requestId: string, notaId: string, texto: string, usuarioId: string): Promise<EditarObservacaoResultado> {
    const nota = await this.internalNoteRepo.findById(notaId);
    if (!nota || nota.requestId !== requestId) return { status: 'nao_encontrada' };
    if (nota.autorId !== usuarioId) return { status: 'sem_permissao' };
    const observacao = await this.internalNoteRepo.update(notaId, texto);
    return { status: 'ok', observacao };
  }

  async apagar(requestId: string, notaId: string, usuarioId: string): Promise<ApagarObservacaoResultado> {
    const nota = await this.internalNoteRepo.findById(notaId);
    if (!nota || nota.requestId !== requestId) return { status: 'nao_encontrada' };
    if (nota.autorId !== usuarioId) return { status: 'sem_permissao' };
    await this.internalNoteRepo.delete(notaId);
    return { status: 'ok' };
  }
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/unit/internal-note.service.test.ts`
Expected: PASS (10 testes).

- [ ] **Step 5: Rodar toda a suíte do backend**

Run: `cd backend && npm test && npm run typecheck`
Expected: tudo passando.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/internal-note.service.ts backend/tests/unit/internal-note.service.test.ts
git commit -m "feat(backend): InternalNoteService com regra de autor unico para editar/apagar"
```

---

## Task 5: Controller, rotas e wiring no app

**Files:**
- Create: `backend/src/controllers/internal-note.controller.ts`
- Modify: `backend/src/routes/request.routes.ts`
- Modify: `backend/src/app.ts`

**Interfaces:**
- Consumes: `InternalNoteService` (Task 4); `criarObservacaoSchema`/`editarObservacaoSchema`/`observacaoIdParamsSchema` (Task 3); `demandaIdParamsSchema` (Fase 2, já existe em `request.validators.ts`); `requireRole` (Fase 1, já existe).
- Produces: `POST /demandas/:id/observacoes`, `GET /demandas/:id/observacoes`, `PATCH /demandas/:id/observacoes/:notaId`, `DELETE /demandas/:id/observacoes/:notaId`.

Esta task não tem ciclo de teste próprio (é fiação entre peças já testadas) — a Task 6 cobre as rotas com testes de integração.

- [ ] **Step 1: Controller**

Crie `backend/src/controllers/internal-note.controller.ts`:

```ts
import type { Request, Response } from 'express';
import type { InternalNoteService } from '../services/internal-note.service.js';
import { criarObservacaoSchema, editarObservacaoSchema, observacaoIdParamsSchema } from '../validators/internal-note.validators.js';
import { demandaIdParamsSchema } from '../validators/request.validators.js';
import { HttpError } from '../middlewares/error-handler.js';

export function createInternalNoteController(internalNoteService: InternalNoteService) {
  return {
    async criar(req: Request, res: Response) {
      const { id } = demandaIdParamsSchema.parse(req.params);
      const dados = criarObservacaoSchema.parse(req.body);
      const resultado = await internalNoteService.criar(id, req.user!.id, dados.texto);
      if (resultado.status === 'nao_encontrada') throw new HttpError(404, 'Demanda não encontrada');
      res.status(201).json({ success: true, data: resultado.observacao });
    },

    async listar(req: Request, res: Response) {
      const { id } = demandaIdParamsSchema.parse(req.params);
      const resultado = await internalNoteService.listar(id);
      if (resultado.status === 'nao_encontrada') throw new HttpError(404, 'Demanda não encontrada');
      res.json({ success: true, data: resultado.observacoes });
    },

    async editar(req: Request, res: Response) {
      const { id, notaId } = observacaoIdParamsSchema.parse(req.params);
      const dados = editarObservacaoSchema.parse(req.body);
      const resultado = await internalNoteService.editar(id, notaId, dados.texto, req.user!.id);
      if (resultado.status === 'nao_encontrada') throw new HttpError(404, 'Observação não encontrada');
      if (resultado.status === 'sem_permissao') throw new HttpError(403, 'Você só pode editar as próprias observações');
      res.json({ success: true, data: resultado.observacao });
    },

    async apagar(req: Request, res: Response) {
      const { id, notaId } = observacaoIdParamsSchema.parse(req.params);
      const resultado = await internalNoteService.apagar(id, notaId, req.user!.id);
      if (resultado.status === 'nao_encontrada') throw new HttpError(404, 'Observação não encontrada');
      if (resultado.status === 'sem_permissao') throw new HttpError(403, 'Você só pode apagar as próprias observações');
      res.status(204).send();
    },
  };
}
```

- [ ] **Step 2: Rotas**

Em `backend/src/routes/request.routes.ts`, adicione ao import do topo:

```ts
import type { InternalNoteService } from '../services/internal-note.service.js';
import { createInternalNoteController } from '../controllers/internal-note.controller.js';
```

Modifique a assinatura de `createRequestRouter` para aceitar a nova dependência:

```ts
export function createRequestRouter(deps: {
  requestService: RequestService;
  userRepo: UserRepository;
  internalNoteService: InternalNoteService;
}): Router {
```

Dentro da função, depois de `const controller = createRequestController(deps.requestService);`, adicione:

```ts
  const internalNoteController = createInternalNoteController(deps.internalNoteService);
```

E adicione estas quatro linhas depois de `router.patch('/:id/reatribuir', auth, requireRole('CHEFE'), asyncHandler(controller.reatribuir));`:

```ts
  const soGabineteOuChefe = requireRole('ASSESSOR_GABINETE', 'CHEFE');
  router.post('/:id/observacoes', auth, soGabineteOuChefe, asyncHandler(internalNoteController.criar));
  router.get('/:id/observacoes', auth, soGabineteOuChefe, asyncHandler(internalNoteController.listar));
  router.patch('/:id/observacoes/:notaId', auth, soGabineteOuChefe, asyncHandler(internalNoteController.editar));
  router.delete('/:id/observacoes/:notaId', auth, soGabineteOuChefe, asyncHandler(internalNoteController.apagar));
```

- [ ] **Step 3: Wiring no app**

Em `backend/src/app.ts`, adicione aos imports:

```ts
import { createInternalNoteRepository } from './repositories/internal-note.repository.js';
import { InternalNoteService } from './services/internal-note.service.js';
```

Depois da linha `const requestService = new RequestService({ requestRepo, requestTypeRepo, photoUploader, userRepo });`, adicione:

```ts
  const internalNoteRepo = createInternalNoteRepository(prisma);
  const internalNoteService = new InternalNoteService({ internalNoteRepo, requestRepo });
```

E atualize a linha que monta o router de demandas:

```ts
  app.use('/demandas', createRequestRouter({ requestService, userRepo, internalNoteService }));
```

- [ ] **Step 4: Confirmar que a suíte completa continua passando**

Run: `cd backend && npm test && npm run typecheck`
Expected: tudo passando — nenhuma rota nova tem teste ainda (isso é a Task 6), mas nada deve quebrar.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/internal-note.controller.ts backend/src/routes/request.routes.ts backend/src/app.ts
git commit -m "feat(backend): rotas de observacoes internas"
```

---

## Task 6: Testes de integração das novas rotas

**Files:**
- Create: `backend/tests/integration/internal-note.routes.test.ts`

**Interfaces:**
- Consumes: as quatro rotas da Task 5.

- [ ] **Step 1: Escrever os testes**

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
  await testPrisma.internalNote.deleteMany();
  await testPrisma.requestPhoto.deleteMany();
  await testPrisma.request.deleteMany();
  await testPrisma.requestType.deleteMany();
}, 30000); // Neon real via rede.

afterAll(async () => {
  await testPrisma.$disconnect();
});

async function fotoValida(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 5, g: 5, b: 5 } } }).jpeg().toBuffer();
}

async function loginComoAssessor(role: 'ASSESSOR_RUA' | 'ASSESSOR_GABINETE' | 'CHEFE' = 'ASSESSOR_RUA', telefone = '+5534999997000') {
  const assessor = await testPrisma.user.create({
    data: { nome: 'Assessor', telefone, role, ativo: true, pinDefinido: true, pinHash: await hash('482913') },
  });
  const login = await request(app).post('/auth/login').send({ telefone, pin: '482913' });
  return { assessor, accessToken: login.body.data.accessToken as string };
}

async function criarTipo() {
  return testPrisma.requestType.create({ data: { nome: 'Tapa-buraco', ativo: true, exigeDescricaoObrigatoria: false } });
}

async function criarDemandaViaApi(tipoId: string, accessToken: string) {
  const foto1 = await fotoValida();
  const foto2 = await fotoValida();
  const res = await request(app)
    .post('/demandas')
    .set('Authorization', `Bearer ${accessToken}`)
    .field({
      solicitanteNome: 'Maria Solicitante',
      solicitanteTelefone: '(34) 99999-0000',
      localExato: 'Em frente ao 100',
      tituloResumido: 'Buraco na rua',
      descricao: 'Buraco grande',
      requestTypeId: tipoId,
      autorizacaoDados: 'true',
    })
    .attach('fotos', foto1, 'foto1.jpg')
    .attach('fotos', foto2, 'foto2.jpg');
  return res.body.data as { id: string };
}

describe('POST /demandas/:id/observacoes', () => {
  it('gabinete cria uma observação', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999997001');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);
    const { accessToken: tokenGabinete } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999997002');

    const res = await request(app)
      .post(`/demandas/${demanda.id}/observacoes`)
      .set('Authorization', `Bearer ${tokenGabinete}`)
      .send({ texto: 'Liguei pra prefeitura' });

    expect(res.status).toBe(201);
    expect(res.body.data.texto).toBe('Liguei pra prefeitura');
    expect(res.body.data.updatedAt).toBeNull();
  }, 30000); // Neon real via rede.

  it('bloqueia assessor de rua com 403', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999997003');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);

    const res = await request(app)
      .post(`/demandas/${demanda.id}/observacoes`)
      .set('Authorization', `Bearer ${tokenRua}`)
      .send({ texto: 'Tentativa' });

    expect(res.status).toBe(403);
  }, 30000); // Neon real via rede.

  it('rejeita texto vazio com 400', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999997004');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);
    const { accessToken: tokenGabinete } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999997005');

    const res = await request(app)
      .post(`/demandas/${demanda.id}/observacoes`)
      .set('Authorization', `Bearer ${tokenGabinete}`)
      .send({ texto: '' });

    expect(res.status).toBe(400);
  }, 30000); // Neon real via rede.
});

describe('GET /demandas/:id/observacoes', () => {
  it('gabinete lista as observações, mais recente primeiro', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999997006');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);
    const { accessToken: tokenGabinete } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999997007');
    await request(app).post(`/demandas/${demanda.id}/observacoes`).set('Authorization', `Bearer ${tokenGabinete}`).send({ texto: 'Primeira' });
    await request(app).post(`/demandas/${demanda.id}/observacoes`).set('Authorization', `Bearer ${tokenGabinete}`).send({ texto: 'Segunda' });

    const res = await request(app).get(`/demandas/${demanda.id}/observacoes`).set('Authorization', `Bearer ${tokenGabinete}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].texto).toBe('Segunda');
  }, 30000); // Neon real via rede.

  it('bloqueia assessor de rua com 403, mesmo na própria demanda', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999997008');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);

    const res = await request(app).get(`/demandas/${demanda.id}/observacoes`).set('Authorization', `Bearer ${tokenRua}`);

    expect(res.status).toBe(403);
  }, 30000); // Neon real via rede.
});

describe('PATCH /demandas/:id/observacoes/:notaId', () => {
  it('autor edita a própria observação', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999997009');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);
    const { accessToken: tokenGabinete } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999997010');
    const criada = await request(app).post(`/demandas/${demanda.id}/observacoes`).set('Authorization', `Bearer ${tokenGabinete}`).send({ texto: 'Original' });

    const res = await request(app)
      .patch(`/demandas/${demanda.id}/observacoes/${criada.body.data.id}`)
      .set('Authorization', `Bearer ${tokenGabinete}`)
      .send({ texto: 'Corrigida' });

    expect(res.status).toBe(200);
    expect(res.body.data.texto).toBe('Corrigida');
    expect(res.body.data.updatedAt).not.toBeNull();
  }, 30000); // Neon real via rede.

  it('bloqueia quem não é o autor, mesmo sendo chefe, com 403', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999997011');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);
    const { accessToken: tokenGabinete } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999997012');
    const { accessToken: tokenChefe } = await loginComoAssessor('CHEFE', '+5534999997013');
    const criada = await request(app).post(`/demandas/${demanda.id}/observacoes`).set('Authorization', `Bearer ${tokenGabinete}`).send({ texto: 'Original' });

    const res = await request(app)
      .patch(`/demandas/${demanda.id}/observacoes/${criada.body.data.id}`)
      .set('Authorization', `Bearer ${tokenChefe}`)
      .send({ texto: 'Tentativa do chefe' });

    expect(res.status).toBe(403);
  }, 30000); // Neon real via rede.
});

describe('DELETE /demandas/:id/observacoes/:notaId', () => {
  it('autor apaga a própria observação', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999997014');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);
    const { accessToken: tokenGabinete } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999997015');
    const criada = await request(app).post(`/demandas/${demanda.id}/observacoes`).set('Authorization', `Bearer ${tokenGabinete}`).send({ texto: 'A apagar' });

    const res = await request(app)
      .delete(`/demandas/${demanda.id}/observacoes/${criada.body.data.id}`)
      .set('Authorization', `Bearer ${tokenGabinete}`);

    expect(res.status).toBe(204);
    const lista = await request(app).get(`/demandas/${demanda.id}/observacoes`).set('Authorization', `Bearer ${tokenGabinete}`);
    expect(lista.body.data).toHaveLength(0);
  }, 30000); // Neon real via rede.

  it('bloqueia quem não é o autor com 403', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999997016');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);
    const { accessToken: tokenGabineteA } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999997017');
    const { accessToken: tokenGabineteB } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999997018');
    const criada = await request(app).post(`/demandas/${demanda.id}/observacoes`).set('Authorization', `Bearer ${tokenGabineteA}`).send({ texto: 'Nota' });

    const res = await request(app)
      .delete(`/demandas/${demanda.id}/observacoes/${criada.body.data.id}`)
      .set('Authorization', `Bearer ${tokenGabineteB}`);

    expect(res.status).toBe(403);
  }, 30000); // Neon real via rede.
});
```

- [ ] **Step 2: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/integration/internal-note.routes.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 3: Rodar toda a suíte do backend**

Run: `cd backend && npm test && npm run typecheck`
Expected: tudo passando.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/integration/internal-note.routes.test.ts
git commit -m "test(backend): cobertura de integracao das rotas de observacoes internas"
```

---

## Task 7: Front-end — tipo compartilhado

**Files:**
- Modify: `frontend/src/types/request.ts`

**Interfaces:**
- Produces: `ObservacaoInterna` — consumido pela Task 8 (componente).

- [ ] **Step 1: Adicionar o tipo**

Adicione ao final de `frontend/src/types/request.ts`:

```ts
export interface ObservacaoInterna {
  id: string;
  requestId: string;
  autorId: string;
  autorNome: string;
  texto: string;
  createdAt: string;
  updatedAt: string | null;
}
```

- [ ] **Step 2: Rodar o typecheck do front-end**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros (é só um tipo novo, ainda não usado em lugar nenhum).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/request.ts
git commit -m "feat(frontend): tipo compartilhado de observacao interna"
```

---

## Task 8: Front-end — componente de observações internas

**Files:**
- Create: `frontend/src/components/ObservacoesInternas.tsx`
- Test: `frontend/src/components/ObservacoesInternas.test.tsx`

**Interfaces:**
- Consumes: `apiClient`/`ApiError` (Fase 1); `useAuth` (Fase 1); `ObservacaoInterna` (Task 7).
- Produces: `<ObservacoesInternas demandaId={string} />` — consumido pela Task 9.

- [ ] **Step 1: Escrever o teste**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ObservacoesInternas } from './ObservacoesInternas';

const useAuthMock = vi.fn();
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => useAuthMock() }));

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient } from '@/services/api-client';

function notaFake(overrides: Record<string, unknown> = {}) {
  return {
    id: 'n1', requestId: 'd1', autorId: 'user-eu', autorNome: 'Ana',
    texto: 'Liguei pra prefeitura', createdAt: '2026-09-03T10:00:00.000Z', updatedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  useAuthMock.mockReturnValue({ user: { id: 'user-eu', role: 'ASSESSOR_GABINETE' } });
  vi.mocked(apiClient.request).mockReset();
});

describe('ObservacoesInternas', () => {
  it('lista as observações já existentes', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([notaFake()]);
    render(<ObservacoesInternas demandaId="d1" />);
    expect(await screen.findByText('Liguei pra prefeitura')).toBeInTheDocument();
    expect(screen.getByText(/Ana/)).toBeInTheDocument();
  });

  it('mostra mensagem quando não há observações', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([]);
    render(<ObservacoesInternas demandaId="d1" />);
    expect(await screen.findByText(/nenhuma observação/i)).toBeInTheDocument();
  });

  it('cria uma nova observação e mostra na lista', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([]);
    vi.mocked(apiClient.request).mockResolvedValueOnce(notaFake());
    render(<ObservacoesInternas demandaId="d1" />);
    await screen.findByText(/nenhuma observação/i);

    fireEvent.change(screen.getByPlaceholderText(/escrever uma observação/i), { target: { value: 'Liguei pra prefeitura' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar observação/i }));

    expect(await screen.findByText('Liguei pra prefeitura')).toBeInTheDocument();
    expect(apiClient.request).toHaveBeenLastCalledWith('/demandas/d1/observacoes', {
      method: 'POST', auth: true, body: { texto: 'Liguei pra prefeitura' },
    });
  });

  it('mostra editar e apagar só na própria nota', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([
      notaFake({ id: 'minha', autorId: 'user-eu' }),
      notaFake({ id: 'de-outro', autorId: 'user-outro', autorNome: 'Bruno' }),
    ]);
    render(<ObservacoesInternas demandaId="d1" />);
    await screen.findByText(/Ana/);

    const botoesEditar = screen.getAllByRole('button', { name: /editar/i });
    expect(botoesEditar).toHaveLength(1);
  });

  it('edita a própria nota', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([notaFake()]);
    vi.mocked(apiClient.request).mockResolvedValueOnce(notaFake({ texto: 'Texto corrigido', updatedAt: '2026-09-03T11:00:00.000Z' }));
    render(<ObservacoesInternas demandaId="d1" />);
    await screen.findByText('Liguei pra prefeitura');

    fireEvent.click(screen.getByRole('button', { name: /editar/i }));
    const caixaEdicao = screen.getByDisplayValue('Liguei pra prefeitura');
    fireEvent.change(caixaEdicao, { target: { value: 'Texto corrigido' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    expect(await screen.findByText('Texto corrigido')).toBeInTheDocument();
    expect(apiClient.request).toHaveBeenLastCalledWith('/demandas/d1/observacoes/n1', {
      method: 'PATCH', auth: true, body: { texto: 'Texto corrigido' },
    });
  });

  it('apaga a própria nota depois de confirmar', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    vi.mocked(apiClient.request).mockResolvedValueOnce([notaFake()]);
    vi.mocked(apiClient.request).mockResolvedValueOnce(undefined);
    render(<ObservacoesInternas demandaId="d1" />);
    await screen.findByText('Liguei pra prefeitura');

    fireEvent.click(screen.getByRole('button', { name: /apagar/i }));

    await waitFor(() => expect(screen.queryByText('Liguei pra prefeitura')).not.toBeInTheDocument());
    expect(apiClient.request).toHaveBeenLastCalledWith('/demandas/d1/observacoes/n1', { method: 'DELETE', auth: true });
    vi.unstubAllGlobals();
  });

  it('mostra erro quando a API rejeita a criação', async () => {
    const { ApiError } = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
    vi.mocked(apiClient.request).mockResolvedValueOnce([]);
    vi.mocked(apiClient.request).mockRejectedValueOnce(new ApiError(400, 'Texto obrigatório'));
    render(<ObservacoesInternas demandaId="d1" />);
    await screen.findByText(/nenhuma observação/i);

    fireEvent.change(screen.getByPlaceholderText(/escrever uma observação/i), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /adicionar observação/i }));

    expect(await screen.findByText('Texto obrigatório')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run src/components/ObservacoesInternas.test.tsx`
Expected: FAIL — `./ObservacoesInternas` não existe.

- [ ] **Step 3: Implementar**

Crie `frontend/src/components/ObservacoesInternas.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { apiClient, ApiError } from '@/services/api-client';
import { useAuth } from '@/hooks/use-auth';
import type { ObservacaoInterna } from '@/types/request';

export function ObservacoesInternas({ demandaId }: { demandaId: string }) {
  const { user } = useAuth();
  const [observacoes, setObservacoes] = useState<ObservacaoInterna[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [textoNovo, setTextoNovo] = useState('');
  const [enviandoNova, setEnviandoNova] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [textoEdicao, setTextoEdicao] = useState('');

  useEffect(() => {
    apiClient
      .request<ObservacaoInterna[]>(`/demandas/${demandaId}/observacoes`, { auth: true })
      .then(setObservacoes)
      .catch(() => setErro('Não foi possível carregar as observações.'))
      .finally(() => setCarregando(false));
  }, [demandaId]);

  async function enviarNova() {
    if (!textoNovo.trim()) return;
    setErro(null);
    setEnviandoNova(true);
    try {
      const nova = await apiClient.request<ObservacaoInterna>(`/demandas/${demandaId}/observacoes`, {
        method: 'POST',
        auth: true,
        body: { texto: textoNovo.trim() },
      });
      setObservacoes((prev) => [nova, ...prev]);
      setTextoNovo('');
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível salvar a observação.');
    } finally {
      setEnviandoNova(false);
    }
  }

  function iniciarEdicao(nota: ObservacaoInterna) {
    setErro(null);
    setEditandoId(nota.id);
    setTextoEdicao(nota.texto);
  }

  async function salvarEdicao(notaId: string) {
    if (!textoEdicao.trim()) return;
    setErro(null);
    try {
      const atualizada = await apiClient.request<ObservacaoInterna>(`/demandas/${demandaId}/observacoes/${notaId}`, {
        method: 'PATCH',
        auth: true,
        body: { texto: textoEdicao.trim() },
      });
      setObservacoes((prev) => prev.map((nota) => (nota.id === notaId ? atualizada : nota)));
      setEditandoId(null);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível salvar a edição.');
    }
  }

  async function apagar(notaId: string) {
    if (!window.confirm('Apagar esta observação?')) return;
    setErro(null);
    try {
      await apiClient.request(`/demandas/${demandaId}/observacoes/${notaId}`, { method: 'DELETE', auth: true });
      setObservacoes((prev) => prev.filter((nota) => nota.id !== notaId));
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível apagar a observação.');
    }
  }

  if (carregando) return <p className="text-sm text-gray-500">Carregando observações…</p>;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium text-gray-600">Observações internas</p>

      {observacoes.length === 0 && <p className="text-sm text-gray-500">Nenhuma observação ainda.</p>}

      <ul className="flex flex-col gap-2">
        {observacoes.map((nota) => (
          <li key={nota.id} className="rounded-xl border border-gray-200 p-3 text-sm">
            {editandoId === nota.id ? (
              <div className="flex flex-col gap-2">
                <textarea
                  rows={3}
                  value={textoEdicao}
                  onChange={(e) => setTextoEdicao(e.target.value)}
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => salvarEdicao(nota.id)}
                    disabled={!textoEdicao.trim()}
                    className="rounded-xl bg-secondary px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditandoId(null)}
                    className="rounded-xl border border-primary px-4 py-2 text-sm font-medium text-primary-dark"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-gray-900">{nota.texto}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {nota.autorNome} — {new Date(nota.createdAt).toLocaleString('pt-BR')}
                  {nota.updatedAt && ' (editado)'}
                </p>
                {nota.autorId === user?.id && (
                  <div className="mt-2 flex gap-3">
                    <button type="button" onClick={() => iniciarEdicao(nota)} className="text-xs font-medium text-primary">
                      Editar
                    </button>
                    <button type="button" onClick={() => apagar(nota.id)} className="text-xs font-medium text-red-600">
                      Apagar
                    </button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        <textarea
          rows={3}
          placeholder="Escrever uma observação…"
          value={textoNovo}
          onChange={(e) => setTextoNovo(e.target.value)}
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="button"
          onClick={enviarNova}
          disabled={!textoNovo.trim() || enviandoNova}
          className="w-fit rounded-xl bg-secondary px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Adicionar observação
        </button>
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run src/components/ObservacoesInternas.test.tsx`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ObservacoesInternas.tsx frontend/src/components/ObservacoesInternas.test.tsx
git commit -m "feat(frontend): componente de observacoes internas"
```

---

## Task 9: Front-end — integrar na tela de detalhe e verificação final

**Files:**
- Modify: `frontend/src/app/painel/demandas/[id]/page.tsx`
- Modify: `frontend/src/app/painel/demandas/[id]/page.test.tsx`

**Interfaces:**
- Consumes: `ObservacoesInternas` (Task 8).

- [ ] **Step 1: Escrever o teste**

Leia o arquivo de teste existente primeiro (já tem os mocks de `StatusActions`/`HistoricoStatus`/`ReatribuirDemanda` da Fase 3 parte 1). Adicione ao mock existente:

```tsx
vi.mock('@/components/ObservacoesInternas', () => ({
  ObservacoesInternas: () => <div>Observações internas</div>,
}));
```

Adicione estes casos ao `describe('DemandaDetalhePage', ...)` já existente:

```tsx
  it('mostra observações internas para gabinete', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'gabinete-1', role: 'ASSESSOR_GABINETE' } });
    vi.mocked(apiClient.request).mockResolvedValueOnce(demandaFake());

    render(<DemandaDetalhePage />);

    expect(await screen.findByText('Observações internas')).toBeInTheDocument();
  });

  it('não mostra observações internas para assessor de rua', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'user-dono', role: 'ASSESSOR_RUA' } });
    vi.mocked(apiClient.request).mockResolvedValueOnce(demandaFake());

    render(<DemandaDetalhePage />);
    await screen.findByText('Buraco na rua');

    expect(screen.queryByText('Observações internas')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run "src/app/painel/demandas/[id]/page.test.tsx"`
Expected: FAIL — a página ainda não renderiza `ObservacoesInternas`.

- [ ] **Step 3: Implementar**

Em `frontend/src/app/painel/demandas/[id]/page.tsx`, adicione ao import:

```tsx
import { ObservacoesInternas } from '@/components/ObservacoesInternas';
```

No JSX, logo depois do bloco `<div>` do "Histórico" (o último bloco antes do fechamento do componente), adicione:

```tsx
      {podeMudarStatus && <ObservacoesInternas demandaId={demanda.id} />}
```

(`podeMudarStatus` já existe na página — mesma condição que já mostra `StatusActions`, `ASSESSOR_GABINETE`/`CHEFE`.)

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run "src/app/painel/demandas/[id]/page.test.tsx"`
Expected: PASS (todos os testes já existentes + 2 novos).

- [ ] **Step 5: Verificação final — suíte completa do front-end, build, e suíte completa do backend**

Run: `cd frontend && npx vitest run && npx tsc --noEmit && npm run build`
Expected: tudo passando, build conclui sem erros.

Run: `cd backend && npm test && npm run typecheck`
Expected: tudo passando (garantia de que nada quebrou nesta fase).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/painel/demandas/\[id\]/page.tsx "frontend/src/app/painel/demandas/[id]/page.test.tsx"
git commit -m "feat(frontend): integra observacoes internas na tela de detalhe"
```
