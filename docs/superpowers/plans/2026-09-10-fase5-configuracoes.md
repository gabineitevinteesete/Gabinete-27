# Tela de Configurações / Tipos de Demanda (Fase 5, parte 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao chefe uma tela em `/painel/configuracoes` para gerenciar tipos de demanda: criar, editar (nome + exigência de descrição) e ativar/desativar.

**Architecture:** Estende o `request-type` existente (repository → novo service → controller → routes), seguindo exatamente o padrão de camadas já usado em `UserService`. O endpoint público `GET /tipos-demanda` (ativos, qualquer papel autenticado) não muda de comportamento — passa a ser servido pelo novo service em vez de falar direto com o repositório, para manter o controller uniformemente fino. Todos os endpoints de gestão são exclusivos do chefe. Sem exclusão: tipos referenciados por demandas não podem ser apagados (FK `RESTRICT`), então a única forma de "remover" um tipo é desativá-lo.

**Tech Stack:** Express/TypeScript/Prisma/PostgreSQL (Neon) backend; Next.js/React/TypeScript/Tailwind frontend; Vitest + Testing Library.

Design de referência: `docs/superpowers/specs/2026-09-10-fase5-configuracoes-design.md`.

## Global Constraints

- Todos os endpoints de gestão de tipos de demanda (`GET /todos`, `POST /`, `PATCH /:id`, `PATCH /:id/ativo`) exigem `requireRole('CHEFE')`. `GET /` (existente) continua exigindo só autenticação, qualquer papel.
- Nenhum endpoint de exclusão de tipo de demanda. Desativar (`ativo: false`) é a única forma de "remover" um tipo do formulário de nova demanda.
- Toda mutação (`criar`, `editar`, `definirAtivo`) grava um registro em `AuditLog`, mesmo padrão de `UserService` (`actorUserId`, `acao`, `entidade: 'RequestType'`, `entidadeId`, `ip`).
- Duplicidade de nome é verificada no service (`findByNome` antes do insert/update), nunca capturando o erro de constraint do banco — mesmo padrão do `telefone_duplicado` em `UserService`.
- O frontend nunca reimplementa uma regra de negócio do backend: mensagens de erro (ex: nome duplicado) são exibidas verbatim a partir de `err.message` de `ApiError`.
- Todo botão de ação por linha em `ListaTiposDemanda` leva `aria-label` com o nome do tipo desde a primeira versão (ex: `` `Editar ${tipo.nome}` ``) — não como correção posterior.
- Rota administrativa de listagem é `GET /tipos-demanda/todos` (sufixo, não query param).

---

### Task 1: Repository e Service de tipos de demanda

**Files:**
- Modify: `backend/src/repositories/request-type.repository.ts`
- Modify: `backend/tests/helpers/fakes.ts` (`createFakeRequestTypeRepo`)
- Create: `backend/src/services/request-type.service.ts`
- Create: `backend/tests/unit/request-type-service.test.ts`
- Modify: `backend/tests/integration/repositories.test.ts`

**Interfaces:**
- Produz: `RequestTypeRepository.listAll(): Promise<(RequestTypeSummary & {ativo: boolean})[]>`, `.findByNome(nome: string): Promise<(RequestTypeSummary & {ativo: boolean}) | null>`, `.create(data: {nome: string; exigeDescricaoObrigatoria: boolean}): Promise<RequestTypeSummary & {ativo: boolean}>`, `.update(id: string, data: {nome?: string; exigeDescricaoObrigatoria?: boolean}): Promise<RequestTypeSummary & {ativo: boolean}>`, `.setAtivo(id: string, ativo: boolean): Promise<RequestTypeSummary & {ativo: boolean}>`.
- Produz: `RequestTypeService` com `listarAtivos()`, `listarTodos()`, `criar()`, `editar()`, `definirAtivo()` — assinaturas exatas abaixo.
- Consome: `AuditLogRepository.record()` (já existe, `backend/src/repositories/audit-log.repository.ts`).

- [ ] **Step 1: Estender a interface e a implementação Prisma de `RequestTypeRepository`**

Em `backend/src/repositories/request-type.repository.ts`, substitua o conteúdo do arquivo por:

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
  findByNome(nome: string): Promise<(RequestTypeSummary & { ativo: boolean }) | null>;
  listAll(): Promise<(RequestTypeSummary & { ativo: boolean })[]>;
  create(data: { nome: string; exigeDescricaoObrigatoria: boolean }): Promise<RequestTypeSummary & { ativo: boolean }>;
  update(
    id: string,
    data: { nome?: string; exigeDescricaoObrigatoria?: boolean },
  ): Promise<RequestTypeSummary & { ativo: boolean }>;
  setAtivo(id: string, ativo: boolean): Promise<RequestTypeSummary & { ativo: boolean }>;
}

const SELECAO_ADMIN = { id: true, nome: true, exigeDescricaoObrigatoria: true, ativo: true } as const;

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
      const tipo = await prisma.requestType.findUnique({ where: { id }, select: SELECAO_ADMIN });
      return tipo;
    },
    async findByNome(nome) {
      const tipo = await prisma.requestType.findUnique({ where: { nome }, select: SELECAO_ADMIN });
      return tipo;
    },
    async listAll() {
      const tipos = await prisma.requestType.findMany({ orderBy: { nome: 'asc' }, select: SELECAO_ADMIN });
      return tipos;
    },
    async create({ nome, exigeDescricaoObrigatoria }) {
      const tipo = await prisma.requestType.create({
        data: { nome, exigeDescricaoObrigatoria, ativo: true },
        select: SELECAO_ADMIN,
      });
      return tipo;
    },
    async update(id, data) {
      const tipo = await prisma.requestType.update({
        where: { id },
        data: {
          ...(data.nome !== undefined ? { nome: data.nome } : {}),
          ...(data.exigeDescricaoObrigatoria !== undefined
            ? { exigeDescricaoObrigatoria: data.exigeDescricaoObrigatoria }
            : {}),
        },
        select: SELECAO_ADMIN,
      });
      return tipo;
    },
    async setAtivo(id, ativo) {
      const tipo = await prisma.requestType.update({ where: { id }, data: { ativo }, select: SELECAO_ADMIN });
      return tipo;
    },
  };
}
```

- [ ] **Step 2: Atualizar `createFakeRequestTypeRepo` em `backend/tests/helpers/fakes.ts`**

Substitua a função `createFakeRequestTypeRepo` existente (linhas ~171-185) por:

```ts
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
    async findByNome(nome) {
      return tipos.find((t) => t.nome === nome) ?? null;
    },
    async listAll() {
      return [...tipos].sort((a, b) => a.nome.localeCompare(b.nome));
    },
    async create({ nome, exigeDescricaoObrigatoria }) {
      const tipo = { id: randomUUID(), nome, exigeDescricaoObrigatoria, ativo: true };
      tipos.push(tipo);
      return tipo;
    },
    async update(id, data) {
      const tipo = tipos.find((t) => t.id === id)!;
      if (data.nome !== undefined) tipo.nome = data.nome;
      if (data.exigeDescricaoObrigatoria !== undefined) tipo.exigeDescricaoObrigatoria = data.exigeDescricaoObrigatoria;
      return tipo;
    },
    async setAtivo(id, ativo) {
      const tipo = tipos.find((t) => t.id === id)!;
      tipo.ativo = ativo;
      return tipo;
    },
  };
}
```

`randomUUID` e `RequestTypeSummary` já estão importados no topo do arquivo (usados por outras fakes) — não duplique o import.

- [ ] **Step 3: Criar `backend/src/services/request-type.service.ts`**

```ts
import type { RequestTypeRepository, RequestTypeSummary } from '../repositories/request-type.repository.js';
import type { AuditLogRepository } from '../repositories/audit-log.repository.js';

export type RequestTypeAdmin = RequestTypeSummary & { ativo: boolean };

export type CriarTipoResult = { status: 'ok'; tipo: RequestTypeAdmin } | { status: 'nome_duplicado' };

export type EditarTipoResult =
  | { status: 'ok'; tipo: RequestTypeAdmin }
  | { status: 'nome_duplicado' }
  | { status: 'nao_encontrado' };

export type DefinirAtivoTipoResult = { status: 'ok'; tipo: RequestTypeAdmin } | { status: 'nao_encontrado' };

export class RequestTypeService {
  private requestTypeRepo: RequestTypeRepository;
  private auditLogRepo: AuditLogRepository;

  constructor(deps: { requestTypeRepo: RequestTypeRepository; auditLogRepo: AuditLogRepository }) {
    this.requestTypeRepo = deps.requestTypeRepo;
    this.auditLogRepo = deps.auditLogRepo;
  }

  async listarAtivos(): Promise<RequestTypeSummary[]> {
    return this.requestTypeRepo.listActive();
  }

  async listarTodos(): Promise<RequestTypeAdmin[]> {
    return this.requestTypeRepo.listAll();
  }

  async criar(input: {
    nome: string;
    exigeDescricaoObrigatoria: boolean;
    criadoPorId: string;
    ip?: string;
  }): Promise<CriarTipoResult> {
    const existente = await this.requestTypeRepo.findByNome(input.nome);
    if (existente) {
      return { status: 'nome_duplicado' };
    }

    const tipo = await this.requestTypeRepo.create({
      nome: input.nome,
      exigeDescricaoObrigatoria: input.exigeDescricaoObrigatoria,
    });

    await this.auditLogRepo.record({
      actorUserId: input.criadoPorId,
      acao: 'CRIAR_TIPO_DEMANDA',
      entidade: 'RequestType',
      entidadeId: tipo.id,
      ip: input.ip,
    });

    return { status: 'ok', tipo };
  }

  async editar(input: {
    tipoId: string;
    nome?: string;
    exigeDescricaoObrigatoria?: boolean;
    atualizadoPorId: string;
    ip?: string;
  }): Promise<EditarTipoResult> {
    const atual = await this.requestTypeRepo.findById(input.tipoId);
    if (!atual) {
      return { status: 'nao_encontrado' };
    }

    if (input.nome !== undefined) {
      const existente = await this.requestTypeRepo.findByNome(input.nome);
      if (existente && existente.id !== input.tipoId) {
        return { status: 'nome_duplicado' };
      }
    }

    const tipo = await this.requestTypeRepo.update(input.tipoId, {
      nome: input.nome,
      exigeDescricaoObrigatoria: input.exigeDescricaoObrigatoria,
    });

    await this.auditLogRepo.record({
      actorUserId: input.atualizadoPorId,
      acao: 'EDITAR_TIPO_DEMANDA',
      entidade: 'RequestType',
      entidadeId: input.tipoId,
      ip: input.ip,
    });

    return { status: 'ok', tipo };
  }

  async definirAtivo(input: {
    tipoId: string;
    ativo: boolean;
    atualizadoPorId: string;
    ip?: string;
  }): Promise<DefinirAtivoTipoResult> {
    const atual = await this.requestTypeRepo.findById(input.tipoId);
    if (!atual) {
      return { status: 'nao_encontrado' };
    }

    const tipo = await this.requestTypeRepo.setAtivo(input.tipoId, input.ativo);

    await this.auditLogRepo.record({
      actorUserId: input.atualizadoPorId,
      acao: input.ativo ? 'ATIVAR_TIPO_DEMANDA' : 'DESATIVAR_TIPO_DEMANDA',
      entidade: 'RequestType',
      entidadeId: input.tipoId,
      ip: input.ip,
    });

    return { status: 'ok', tipo };
  }
}
```

- [ ] **Step 4: Escrever os testes unitários do service**

Crie `backend/tests/unit/request-type-service.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { RequestTypeService } from '../../src/services/request-type.service.js';
import { createFakeRequestTypeRepo, createFakeAuditLogRepo } from '../helpers/fakes.js';

function buildService() {
  const requestTypeRepo = createFakeRequestTypeRepo();
  const auditLogRepo = createFakeAuditLogRepo();
  const service = new RequestTypeService({ requestTypeRepo, auditLogRepo });
  return { service, requestTypeRepo, auditLogRepo };
}

describe('RequestTypeService.criar', () => {
  it('cria um tipo e grava auditoria', async () => {
    const { service, auditLogRepo } = buildService();
    const result = await service.criar({
      nome: 'Tapa-buraco',
      exigeDescricaoObrigatoria: false,
      criadoPorId: 'chefe-1',
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.tipo.nome).toBe('Tapa-buraco');
      expect(result.tipo.ativo).toBe(true);
    }
    expect(auditLogRepo.records).toHaveLength(1);
  });

  it('rejeita nome duplicado', async () => {
    const { service } = buildService();
    await service.criar({ nome: 'Poda de árvore', exigeDescricaoObrigatoria: false, criadoPorId: 'chefe-1' });
    const result = await service.criar({ nome: 'Poda de árvore', exigeDescricaoObrigatoria: true, criadoPorId: 'chefe-1' });
    expect(result.status).toBe('nome_duplicado');
  });
});

describe('RequestTypeService.editar', () => {
  it('atualiza nome e exigência de descrição', async () => {
    const { service, auditLogRepo } = buildService();
    const criado = await service.criar({ nome: 'Nome Original', exigeDescricaoObrigatoria: false, criadoPorId: 'chefe-1' });
    if (criado.status !== 'ok') throw new Error('esperava ok');

    const result = await service.editar({
      tipoId: criado.tipo.id,
      nome: 'Nome Corrigido',
      exigeDescricaoObrigatoria: true,
      atualizadoPorId: 'chefe-1',
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.tipo.nome).toBe('Nome Corrigido');
      expect(result.tipo.exigeDescricaoObrigatoria).toBe(true);
    }
    expect(auditLogRepo.records).toHaveLength(2); // criação + edição
  });

  it('permite manter o mesmo nome do próprio tipo', async () => {
    const { service } = buildService();
    const criado = await service.criar({ nome: 'Nome Original', exigeDescricaoObrigatoria: false, criadoPorId: 'chefe-1' });
    if (criado.status !== 'ok') throw new Error('esperava ok');

    const result = await service.editar({
      tipoId: criado.tipo.id,
      nome: 'Nome Original',
      atualizadoPorId: 'chefe-1',
    });

    expect(result.status).toBe('ok');
  });

  it('rejeita nome já usado por outro tipo', async () => {
    const { service } = buildService();
    await service.criar({ nome: 'Tipo A', exigeDescricaoObrigatoria: false, criadoPorId: 'chefe-1' });
    const criadoB = await service.criar({ nome: 'Tipo B', exigeDescricaoObrigatoria: false, criadoPorId: 'chefe-1' });
    if (criadoB.status !== 'ok') throw new Error('esperava ok');

    const result = await service.editar({ tipoId: criadoB.tipo.id, nome: 'Tipo A', atualizadoPorId: 'chefe-1' });

    expect(result.status).toBe('nome_duplicado');
  });

  it('retorna nao_encontrado para um id inexistente', async () => {
    const { service } = buildService();
    const result = await service.editar({ tipoId: 'id-inexistente', nome: 'Qualquer', atualizadoPorId: 'chefe-1' });
    expect(result.status).toBe('nao_encontrado');
  });
});

describe('RequestTypeService.definirAtivo', () => {
  it('ativa e desativa um tipo, gravando auditoria', async () => {
    const { service, auditLogRepo } = buildService();
    const criado = await service.criar({ nome: 'Outros', exigeDescricaoObrigatoria: true, criadoPorId: 'chefe-1' });
    if (criado.status !== 'ok') throw new Error('esperava ok');

    const desativado = await service.definirAtivo({ tipoId: criado.tipo.id, ativo: false, atualizadoPorId: 'chefe-1' });
    expect(desativado.status).toBe('ok');
    if (desativado.status === 'ok') expect(desativado.tipo.ativo).toBe(false);

    const reativado = await service.definirAtivo({ tipoId: criado.tipo.id, ativo: true, atualizadoPorId: 'chefe-1' });
    expect(reativado.status).toBe('ok');
    if (reativado.status === 'ok') expect(reativado.tipo.ativo).toBe(true);

    expect(auditLogRepo.records).toHaveLength(3); // criação + desativar + reativar
  });

  it('permite desativar o único tipo ativo restante (sem proteção de "último tipo")', async () => {
    const { service } = buildService();
    const criado = await service.criar({ nome: 'Único Tipo', exigeDescricaoObrigatoria: false, criadoPorId: 'chefe-1' });
    if (criado.status !== 'ok') throw new Error('esperava ok');

    const result = await service.definirAtivo({ tipoId: criado.tipo.id, ativo: false, atualizadoPorId: 'chefe-1' });
    expect(result.status).toBe('ok');
  });

  it('retorna nao_encontrado para um id inexistente', async () => {
    const { service } = buildService();
    const result = await service.definirAtivo({ tipoId: 'id-inexistente', ativo: false, atualizadoPorId: 'chefe-1' });
    expect(result.status).toBe('nao_encontrado');
  });
});

describe('RequestTypeService.listarAtivos / listarTodos', () => {
  it('listarAtivos só retorna ativos; listarTodos retorna todos', async () => {
    const { service } = buildService();
    const ativo = await service.criar({ nome: 'Ativo', exigeDescricaoObrigatoria: false, criadoPorId: 'chefe-1' });
    if (ativo.status !== 'ok') throw new Error('esperava ok');
    await service.definirAtivo({ tipoId: ativo.tipo.id, ativo: true, atualizadoPorId: 'chefe-1' });
    const inativo = await service.criar({ nome: 'Inativo', exigeDescricaoObrigatoria: false, criadoPorId: 'chefe-1' });
    if (inativo.status !== 'ok') throw new Error('esperava ok');
    await service.definirAtivo({ tipoId: inativo.tipo.id, ativo: false, atualizadoPorId: 'chefe-1' });

    const ativos = await service.listarAtivos();
    expect(ativos.map((t) => t.nome)).toEqual(['Ativo']);

    const todos = await service.listarTodos();
    expect(todos.map((t) => t.nome).sort()).toEqual(['Ativo', 'Inativo']);
  });
});
```

- [ ] **Step 5: Rodar os testes unitários**

Run: `cd backend && npx vitest run tests/unit/request-type-service.test.ts`
Expected: todos os testes acima passando.

- [ ] **Step 6: Estender `backend/tests/integration/repositories.test.ts`**

Adicione o import no topo do arquivo, junto aos demais:

```ts
import { createRequestTypeRepository } from '../../src/repositories/request-type.repository.js';
```

E logo após a linha `const auditLogRepo = createAuditLogRepository(prisma);`:

```ts
const requestTypeRepo = createRequestTypeRepository(prisma);
```

Adicione ao final do arquivo (antes do fechamento, como um novo `describe` no mesmo nível dos demais):

```ts
describe('RequestTypeRepository', () => {
  it('cria, edita, busca por nome e ativa/desativa', async () => {
    const criado = await requestTypeRepo.create({ nome: 'Buraco na via', exigeDescricaoObrigatoria: false });
    expect(criado.ativo).toBe(true);

    const encontrado = await requestTypeRepo.findByNome('Buraco na via');
    expect(encontrado?.id).toBe(criado.id);

    const editado = await requestTypeRepo.update(criado.id, { exigeDescricaoObrigatoria: true });
    expect(editado.exigeDescricaoObrigatoria).toBe(true);

    const desativado = await requestTypeRepo.setAtivo(criado.id, false);
    expect(desativado.ativo).toBe(false);
  });

  it('listAll inclui ativos e inativos; listActive só ativos', async () => {
    const ativo = await requestTypeRepo.create({ nome: 'Tipo Ativo X', exigeDescricaoObrigatoria: false });
    const inativoBase = await requestTypeRepo.create({ nome: 'Tipo Inativo X', exigeDescricaoObrigatoria: false });
    await requestTypeRepo.setAtivo(inativoBase.id, false);

    const todos = await requestTypeRepo.listAll();
    expect(todos.some((t) => t.id === ativo.id)).toBe(true);
    expect(todos.some((t) => t.id === inativoBase.id)).toBe(true);

    const ativos = await requestTypeRepo.listActive();
    expect(ativos.some((t) => t.id === ativo.id)).toBe(true);
    expect(ativos.some((t) => t.id === inativoBase.id)).toBe(false);
  });
});
```

- [ ] **Step 7: Rodar a suíte de integração completa**

Run: `cd backend && npx vitest run tests/integration/repositories.test.ts`
Expected: todos os testes passando, incluindo os dois novos.

- [ ] **Step 8: Commit**

```bash
git add backend/src/repositories/request-type.repository.ts backend/src/services/request-type.service.ts backend/tests/helpers/fakes.ts backend/tests/unit/request-type-service.test.ts backend/tests/integration/repositories.test.ts
git commit -m "feat(backend): repositorio e service de tipos de demanda com CRUD"
```

---

### Task 2: Validators, Controller e Routes de tipos de demanda

**Files:**
- Create: `backend/src/validators/request-type.validators.ts`
- Modify: `backend/src/controllers/request-type.controller.ts`
- Modify: `backend/src/routes/request-type.routes.ts`
- Modify: `backend/src/app.ts`

**Interfaces:**
- Consome: `RequestTypeService` (Task 1).
- Produz: rotas `GET /tipos-demanda` (inalterada), `GET /tipos-demanda/todos`, `POST /tipos-demanda`, `PATCH /tipos-demanda/:id`, `PATCH /tipos-demanda/:id/ativo`.

- [ ] **Step 1: Criar `backend/src/validators/request-type.validators.ts`**

```ts
import { z } from 'zod';

export const criarTipoSchema = z.object({
  nome: z.string().trim().min(1).max(100),
  exigeDescricaoObrigatoria: z.boolean(),
});

export const editarTipoSchema = z
  .object({
    nome: z.string().trim().min(1).max(100).optional(),
    exigeDescricaoObrigatoria: z.boolean().optional(),
  })
  .refine((data) => data.nome !== undefined || data.exigeDescricaoObrigatoria !== undefined, {
    message: 'Informe ao menos um campo para editar',
  });

export const definirAtivoTipoSchema = z.object({
  ativo: z.boolean(),
});

// Um :id malformado chegaria até o Prisma e viraria um 500 genérico. Validar aqui devolve
// 400 com a mesma forma de erro das outras rotas.
export const tipoIdParamsSchema = z.object({
  id: z.string().uuid(),
});
```

- [ ] **Step 2: Substituir `backend/src/controllers/request-type.controller.ts`**

```ts
import type { Request, Response } from 'express';
import type { RequestTypeService } from '../services/request-type.service.js';
import {
  criarTipoSchema,
  editarTipoSchema,
  definirAtivoTipoSchema,
  tipoIdParamsSchema,
} from '../validators/request-type.validators.js';
import { getClientIp } from '../utils/request-ip.js';
import { HttpError } from '../middlewares/error-handler.js';

export function createRequestTypeController(service: RequestTypeService) {
  return {
    async listar(_req: Request, res: Response) {
      const tipos = await service.listarAtivos();
      res.json({ success: true, data: tipos });
    },

    async listarTodos(_req: Request, res: Response) {
      const tipos = await service.listarTodos();
      res.json({ success: true, data: tipos });
    },

    async criar(req: Request, res: Response) {
      const input = criarTipoSchema.parse(req.body);
      const result = await service.criar({
        ...input,
        criadoPorId: req.user!.id,
        ip: getClientIp(req),
      });
      if (result.status === 'nome_duplicado') {
        throw new HttpError(409, 'Já existe um tipo de demanda com esse nome');
      }
      res.status(201).json({ success: true, data: result.tipo });
    },

    async editar(req: Request, res: Response) {
      const { id: tipoId } = tipoIdParamsSchema.parse(req.params);
      const input = editarTipoSchema.parse(req.body);
      const result = await service.editar({
        tipoId,
        nome: input.nome,
        exigeDescricaoObrigatoria: input.exigeDescricaoObrigatoria,
        atualizadoPorId: req.user!.id,
        ip: getClientIp(req),
      });
      if (result.status === 'nao_encontrado') {
        throw new HttpError(404, 'Tipo de demanda não encontrado');
      }
      if (result.status === 'nome_duplicado') {
        throw new HttpError(409, 'Já existe um tipo de demanda com esse nome');
      }
      res.json({ success: true, data: result.tipo });
    },

    async definirAtivo(req: Request, res: Response) {
      const { id: tipoId } = tipoIdParamsSchema.parse(req.params);
      const input = definirAtivoTipoSchema.parse(req.body);
      const result = await service.definirAtivo({
        tipoId,
        ativo: input.ativo,
        atualizadoPorId: req.user!.id,
        ip: getClientIp(req),
      });
      if (result.status === 'nao_encontrado') {
        throw new HttpError(404, 'Tipo de demanda não encontrado');
      }
      res.json({ success: true, data: result.tipo });
    },
  };
}
```

- [ ] **Step 3: Substituir `backend/src/routes/request-type.routes.ts`**

```ts
import { Router } from 'express';
import type { RequestTypeService } from '../services/request-type.service.js';
import type { UserRepository } from '../repositories/user.repository.js';
import { createRequestTypeController } from '../controllers/request-type.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/require-role.js';

function asyncHandler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next);
}

export function createRequestTypeRouter(deps: {
  requestTypeService: RequestTypeService;
  userRepo: UserRepository;
}): Router {
  const router = Router();
  const controller = createRequestTypeController(deps.requestTypeService);
  const auth = authenticate({ userRepo: deps.userRepo });
  const soChefe = requireRole('CHEFE');

  router.get('/', auth, asyncHandler(controller.listar));
  router.get('/todos', auth, soChefe, asyncHandler(controller.listarTodos));
  router.post('/', auth, soChefe, asyncHandler(controller.criar));
  router.patch('/:id', auth, soChefe, asyncHandler(controller.editar));
  router.patch('/:id/ativo', auth, soChefe, asyncHandler(controller.definirAtivo));

  return router;
}
```

- [ ] **Step 4: Ligar o `RequestTypeService` em `backend/src/app.ts`**

Adicione o import junto aos demais services:

```ts
import { RequestTypeService } from './services/request-type.service.js';
```

Logo após a linha `const userService = new UserService({ userRepo, auditLogRepo });`, adicione:

```ts
const requestTypeService = new RequestTypeService({ requestTypeRepo, auditLogRepo });
```

E troque a linha de montagem da rota:

```ts
app.use('/tipos-demanda', createRequestTypeRouter({ requestTypeRepo, userRepo }));
```

por:

```ts
app.use('/tipos-demanda', createRequestTypeRouter({ requestTypeService, userRepo }));
```

(`requestTypeRepo` continua existindo no arquivo — `RequestService`, logo acima, também depende dele; não remova essa linha.)

- [ ] **Step 5: Rodar o typecheck do backend**

Run: `cd backend && npm run typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add backend/src/validators/request-type.validators.ts backend/src/controllers/request-type.controller.ts backend/src/routes/request-type.routes.ts backend/src/app.ts
git commit -m "feat(backend): rotas de gestao de tipos de demanda (criar, editar, ativar/desativar)"
```

---

### Task 3: Testes de integração das rotas de tipos de demanda

**Files:**
- Modify: `backend/tests/integration/request-type.routes.test.ts`

**Interfaces:**
- Consome: rotas da Task 2.

- [ ] **Step 1: Adicionar os testes das rotas novas**

Ao final de `backend/tests/integration/request-type.routes.test.ts` (depois do `describe('GET /tipos-demanda', ...)` já existente), adicione:

```ts
async function loginComoChefe() {
  const chefe = await testPrisma.user.create({
    data: { nome: 'Chefe', telefone: '+5534999998000', role: 'CHEFE', ativo: true, pinDefinido: true, pinHash: await hash('482913') },
  });
  const login = await request(app).post('/auth/login').send({ telefone: chefe.telefone, pin: '482913' });
  return login.body.data.accessToken as string;
}

describe('GET /tipos-demanda/todos', () => {
  it('bloqueia quem não é chefe com 403', async () => {
    const accessToken = await loginComoAssessor();
    const res = await request(app).get('/tipos-demanda/todos').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  }, 30000);

  it('lista tipos ativos e inativos para o chefe', async () => {
    await testPrisma.requestType.createMany({
      data: [
        { nome: 'Tapa-buraco', ativo: true, exigeDescricaoObrigatoria: false },
        { nome: 'Assunto desativado', ativo: false, exigeDescricaoObrigatoria: false },
      ],
    });
    const accessToken = await loginComoChefe();
    const res = await request(app).get('/tipos-demanda/todos').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.map((t: { nome: string }) => t.nome)).toEqual(['Assunto desativado', 'Tapa-buraco']);
  }, 30000);
});

describe('POST /tipos-demanda', () => {
  it('bloqueia quem não é chefe com 403', async () => {
    const accessToken = await loginComoAssessor();
    const res = await request(app)
      .post('/tipos-demanda')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Novo tipo', exigeDescricaoObrigatoria: false });
    expect(res.status).toBe(403);
  }, 30000);

  it('cria um tipo de demanda', async () => {
    const accessToken = await loginComoChefe();
    const res = await request(app)
      .post('/tipos-demanda')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Iluminação pública', exigeDescricaoObrigatoria: true });

    expect(res.status).toBe(201);
    expect(res.body.data.nome).toBe('Iluminação pública');
    expect(res.body.data.ativo).toBe(true);
  }, 30000);

  it('rejeita nome duplicado com 409', async () => {
    const accessToken = await loginComoChefe();
    await request(app)
      .post('/tipos-demanda')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Poda de árvore', exigeDescricaoObrigatoria: false });
    const res = await request(app)
      .post('/tipos-demanda')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Poda de árvore', exigeDescricaoObrigatoria: true });

    expect(res.status).toBe(409);
  }, 30000);
});

describe('PATCH /tipos-demanda/:id', () => {
  it('bloqueia quem não é chefe com 403', async () => {
    const tipo = await testPrisma.requestType.create({ data: { nome: 'Tipo X', ativo: true, exigeDescricaoObrigatoria: false } });
    const accessToken = await loginComoAssessor();
    const res = await request(app)
      .patch(`/tipos-demanda/${tipo.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Tipo Y' });
    expect(res.status).toBe(403);
  }, 30000);

  it('edita nome e exigência de descrição', async () => {
    const tipo = await testPrisma.requestType.create({ data: { nome: 'Tipo Original', ativo: true, exigeDescricaoObrigatoria: false } });
    const accessToken = await loginComoChefe();
    const res = await request(app)
      .patch(`/tipos-demanda/${tipo.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Tipo Corrigido', exigeDescricaoObrigatoria: true });

    expect(res.status).toBe(200);
    expect(res.body.data.nome).toBe('Tipo Corrigido');
    expect(res.body.data.exigeDescricaoObrigatoria).toBe(true);
  }, 30000);
});

describe('PATCH /tipos-demanda/:id/ativo', () => {
  it('bloqueia quem não é chefe com 403', async () => {
    const tipo = await testPrisma.requestType.create({ data: { nome: 'Tipo Z', ativo: true, exigeDescricaoObrigatoria: false } });
    const accessToken = await loginComoAssessor();
    const res = await request(app)
      .patch(`/tipos-demanda/${tipo.id}/ativo`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ativo: false });
    expect(res.status).toBe(403);
  }, 30000);

  it('desativa e reativa um tipo de demanda', async () => {
    const tipo = await testPrisma.requestType.create({ data: { nome: 'Tipo W', ativo: true, exigeDescricaoObrigatoria: false } });
    const accessToken = await loginComoChefe();

    const desativado = await request(app)
      .patch(`/tipos-demanda/${tipo.id}/ativo`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ativo: false });
    expect(desativado.status).toBe(200);
    expect(desativado.body.data.ativo).toBe(false);

    const reativado = await request(app)
      .patch(`/tipos-demanda/${tipo.id}/ativo`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ativo: true });
    expect(reativado.status).toBe(200);
    expect(reativado.body.data.ativo).toBe(true);
  }, 30000);
});
```

- [ ] **Step 2: Rodar o arquivo de teste**

Run: `cd backend && npx vitest run tests/integration/request-type.routes.test.ts`
Expected: todos os testes (existentes + novos) passando.

- [ ] **Step 3: Rodar a suíte completa do backend e o typecheck**

Run: `cd backend && npm test && npm run typecheck`
Expected: 100% dos arquivos e testes passando (pode levar ~10-15min via Neon real — não coloque em segundo plano, aguarde o resultado completo).

- [ ] **Step 4: Commit**

```bash
git add backend/tests/integration/request-type.routes.test.ts
git commit -m "test(backend): cobre as rotas de gestao de tipos de demanda"
```

---

### Task 4: Tipo de frontend e `ModalTipoDemanda`

**Files:**
- Modify: `frontend/src/types/request.ts`
- Create: `frontend/src/components/ModalTipoDemanda.tsx`
- Create: `frontend/src/components/ModalTipoDemanda.test.tsx`

**Interfaces:**
- Produz: `TipoDemandaAdmin` (tipo), `<ModalTipoDemanda modo="criar"|"editar" tipo? onFechar onSalvo>`.
- Consome: `TextField`, `Button` (`frontend/src/components/`), `apiClient`/`ApiError` (`frontend/src/services/api-client`).

- [ ] **Step 1: Adicionar `TipoDemandaAdmin` em `frontend/src/types/request.ts`**

Logo após a interface `TipoDemanda` já existente (linhas 13-17), adicione:

```ts
export interface TipoDemandaAdmin extends TipoDemanda {
  ativo: boolean;
}
```

- [ ] **Step 2: Criar `frontend/src/components/ModalTipoDemanda.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { apiClient, ApiError } from '@/services/api-client';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import type { TipoDemandaAdmin } from '@/types/request';

interface ModalTipoDemandaProps {
  modo: 'criar' | 'editar';
  tipo?: TipoDemandaAdmin;
  onFechar: () => void;
  onSalvo: (tipo: TipoDemandaAdmin) => void;
}

export function ModalTipoDemanda({ modo, tipo, onFechar, onSalvo }: ModalTipoDemandaProps) {
  const [nome, setNome] = useState(tipo?.nome ?? '');
  const [exigeDescricaoObrigatoria, setExigeDescricaoObrigatoria] = useState(tipo?.exigeDescricaoObrigatoria ?? false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setEnviando(true);
    setErro(null);
    try {
      const resultado =
        modo === 'criar'
          ? await apiClient.request<TipoDemandaAdmin>('/tipos-demanda', {
              method: 'POST',
              auth: true,
              body: { nome, exigeDescricaoObrigatoria },
            })
          : await apiClient.request<TipoDemandaAdmin>(`/tipos-demanda/${tipo!.id}`, {
              method: 'PATCH',
              auth: true,
              body: { nome, exigeDescricaoObrigatoria },
            });
      onSalvo(resultado);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível salvar. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  const formValido = nome.trim().length >= 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-card bg-white p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-primary-dark">
            {modo === 'criar' ? 'Novo tipo de demanda' : 'Editar tipo de demanda'}
          </h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="text-gray-500 hover:text-gray-700">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <TextField label="Nome" name="nome" value={nome} onChange={(e) => setNome(e.target.value)} />

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={exigeDescricaoObrigatoria}
              onChange={(e) => setExigeDescricaoObrigatoria(e.target.checked)}
            />
            Exige descrição obrigatória
          </label>

          <Button type="button" onClick={salvar} disabled={!formValido || enviando}>
            {enviando ? 'Salvando…' : 'Salvar'}
          </Button>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Criar `frontend/src/components/ModalTipoDemanda.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ModalTipoDemanda } from './ModalTipoDemanda';

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient, ApiError } from '@/services/api-client';

const tipoFake = {
  id: 't1',
  nome: 'Tapa-buraco',
  exigeDescricaoObrigatoria: false,
  ativo: true,
};

beforeEach(() => {
  vi.mocked(apiClient.request).mockReset();
});

describe('ModalTipoDemanda (criar)', () => {
  it('envia POST /tipos-demanda ao salvar', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce(tipoFake);
    const onSalvo = vi.fn();

    render(<ModalTipoDemanda modo="criar" onFechar={() => {}} onSalvo={onSalvo} />);

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Tapa-buraco' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSalvo).toHaveBeenCalledWith(tipoFake));
    const [url, options] = vi.mocked(apiClient.request).mock.calls[0]!;
    expect(url).toBe('/tipos-demanda');
    expect(options?.method).toBe('POST');
    expect(options?.body).toEqual({ nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false });
  });

  it('envia exigeDescricaoObrigatoria true quando o checkbox é marcado', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({ ...tipoFake, exigeDescricaoObrigatoria: true });

    render(<ModalTipoDemanda modo="criar" onFechar={() => {}} onSalvo={() => {}} />);

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Outros' } });
    fireEvent.click(screen.getByLabelText('Exige descrição obrigatória'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(apiClient.request).toHaveBeenCalled());
    const [, options] = vi.mocked(apiClient.request).mock.calls[0]!;
    expect(options?.body).toEqual({ nome: 'Outros', exigeDescricaoObrigatoria: true });
  });
});

describe('ModalTipoDemanda (editar)', () => {
  it('pré-preenche nome e exigência, e envia PATCH', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({ ...tipoFake, nome: 'Tapa-buraco Corrigido' });
    const onSalvo = vi.fn();

    render(<ModalTipoDemanda modo="editar" tipo={tipoFake} onFechar={() => {}} onSalvo={onSalvo} />);

    expect(screen.getByLabelText('Nome')).toHaveValue('Tapa-buraco');
    expect(screen.getByLabelText('Exige descrição obrigatória')).not.toBeChecked();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Tapa-buraco Corrigido' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSalvo).toHaveBeenCalled());
    const [url, options] = vi.mocked(apiClient.request).mock.calls[0]!;
    expect(url).toBe('/tipos-demanda/t1');
    expect(options?.method).toBe('PATCH');
  });

  it('mostra a mensagem de erro da API quando salvar falha', async () => {
    vi.mocked(apiClient.request).mockRejectedValueOnce(new ApiError(409, 'Já existe um tipo de demanda com esse nome'));

    render(<ModalTipoDemanda modo="editar" tipo={tipoFake} onFechar={() => {}} onSalvo={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Já existe um tipo de demanda com esse nome')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Rodar os testes**

Run: `cd frontend && npx vitest run src/components/ModalTipoDemanda.test.tsx`
Expected: todos passando.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/request.ts frontend/src/components/ModalTipoDemanda.tsx frontend/src/components/ModalTipoDemanda.test.tsx
git commit -m "feat(frontend): modal de criar/editar tipo de demanda"
```

---

### Task 5: `ListaTiposDemanda`

**Files:**
- Create: `frontend/src/components/ListaTiposDemanda.tsx`
- Create: `frontend/src/components/ListaTiposDemanda.test.tsx`

**Interfaces:**
- Consome: `ModalTipoDemanda` (Task 4), `apiClient`/`ApiError`, `TipoDemandaAdmin`.
- Produz: `<ListaTiposDemanda />` (sem props).

- [ ] **Step 1: Criar `frontend/src/components/ListaTiposDemanda.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { apiClient, ApiError } from '@/services/api-client';
import { ModalTipoDemanda } from '@/components/ModalTipoDemanda';
import { Button } from '@/components/Button';
import type { TipoDemandaAdmin } from '@/types/request';

export function ListaTiposDemanda() {
  const [tipos, setTipos] = useState<TipoDemandaAdmin[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [modalAberto, setModalAberto] = useState<'criar' | TipoDemandaAdmin | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  function buscar() {
    setCarregando(true);
    setErro(false);
    apiClient
      .request<TipoDemandaAdmin[]>('/tipos-demanda/todos', { auth: true })
      .then(setTipos)
      .catch(() => setErro(true))
      .finally(() => setCarregando(false));
  }

  useEffect(buscar, []);

  async function alternarAtivo(tipo: TipoDemandaAdmin) {
    setErroAcao(null);
    try {
      const atualizado = await apiClient.request<TipoDemandaAdmin>(`/tipos-demanda/${tipo.id}/ativo`, {
        method: 'PATCH',
        auth: true,
        body: { ativo: !tipo.ativo },
      });
      setTipos((prev) => prev.map((t) => (t.id === atualizado.id ? atualizado : t)));
    } catch (err) {
      setErroAcao(err instanceof ApiError ? err.message : 'Não foi possível atualizar o status.');
    }
  }

  function handleSalvo() {
    setModalAberto(null);
    buscar();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-end">
        <Button type="button" onClick={() => setModalAberto('criar')} className="w-fit">
          + Novo tipo
        </Button>
      </div>

      {erroAcao && <p className="text-sm text-red-600">{erroAcao}</p>}
      {carregando && <p className="text-sm text-gray-500">Carregando…</p>}
      {erro && <p className="text-sm text-red-600">Não foi possível carregar os tipos de demanda.</p>}

      {!carregando && !erro && (
        <div className="overflow-x-auto rounded-card bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-600">
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Exige descrição</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {tipos.map((tipo) => (
                <tr key={tipo.id} className="border-b border-gray-100">
                  <td className="px-3 py-2 font-medium text-gray-900">{tipo.nome}</td>
                  <td className="px-3 py-2 text-gray-700">{tipo.exigeDescricaoObrigatoria ? 'Sim' : 'Não'}</td>
                  <td className="px-3 py-2">{tipo.ativo ? 'Ativo' : 'Inativo'}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => alternarAtivo(tipo)}
                        aria-label={`${tipo.ativo ? 'Desativar' : 'Ativar'} ${tipo.nome}`}
                        className="text-xs font-medium text-primary-dark hover:underline"
                      >
                        {tipo.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalAberto(tipo)}
                        aria-label={`Editar ${tipo.nome}`}
                        className="text-xs font-medium text-primary-dark hover:underline"
                      >
                        Editar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tipos.length === 0 && <p className="p-4 text-sm text-gray-500">Nenhum tipo de demanda cadastrado.</p>}
        </div>
      )}

      {modalAberto && (
        <ModalTipoDemanda
          modo={modalAberto === 'criar' ? 'criar' : 'editar'}
          tipo={modalAberto === 'criar' ? undefined : modalAberto}
          onFechar={() => setModalAberto(null)}
          onSalvo={handleSalvo}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Criar `frontend/src/components/ListaTiposDemanda.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ListaTiposDemanda } from './ListaTiposDemanda';

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient } from '@/services/api-client';

const tipoAtivo = {
  id: 't1',
  nome: 'Tapa-buraco',
  exigeDescricaoObrigatoria: false,
  ativo: true,
};

beforeEach(() => {
  vi.mocked(apiClient.request).mockReset();
});

describe('ListaTiposDemanda', () => {
  it('lista e permite desativar', async () => {
    vi.mocked(apiClient.request)
      .mockResolvedValueOnce([tipoAtivo])
      .mockResolvedValueOnce({ ...tipoAtivo, ativo: false });

    render(<ListaTiposDemanda />);

    expect(await screen.findByText('Tapa-buraco')).toBeInTheDocument();
    const [urlBusca] = vi.mocked(apiClient.request).mock.calls[0]!;
    expect(urlBusca).toBe('/tipos-demanda/todos');

    fireEvent.click(screen.getByRole('button', { name: 'Desativar Tapa-buraco' }));

    await waitFor(() => expect(screen.getByText('Inativo')).toBeInTheDocument());
    const [url, options] = vi.mocked(apiClient.request).mock.calls[1]!;
    expect(url).toBe('/tipos-demanda/t1/ativo');
    expect(options?.body).toEqual({ ativo: false });
  });

  it('abre o modal de edição pré-preenchido ao clicar em Editar', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([tipoAtivo]);

    render(<ListaTiposDemanda />);

    expect(await screen.findByText('Tapa-buraco')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Editar Tapa-buraco' }));

    expect(screen.getByText('Editar tipo de demanda')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toHaveValue('Tapa-buraco');
  });

  it('cria um novo tipo e atualiza a lista', async () => {
    vi.mocked(apiClient.request)
      .mockResolvedValueOnce([tipoAtivo])
      .mockResolvedValueOnce({ id: 't2', nome: 'Outros', exigeDescricaoObrigatoria: true, ativo: true })
      .mockResolvedValueOnce([tipoAtivo, { id: 't2', nome: 'Outros', exigeDescricaoObrigatoria: true, ativo: true }]);

    render(<ListaTiposDemanda />);
    await screen.findByText('Tapa-buraco');

    fireEvent.click(screen.getByRole('button', { name: '+ Novo tipo' }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Outros' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Outros')).toBeInTheDocument();
  });

  it('distingue os botões de ação de cada linha pelo nome acessível', async () => {
    const outroTipo = { id: 't2', nome: 'Poda de árvore', exigeDescricaoObrigatoria: false, ativo: true };
    vi.mocked(apiClient.request).mockResolvedValueOnce([tipoAtivo, outroTipo]);

    render(<ListaTiposDemanda />);

    expect(await screen.findByText('Tapa-buraco')).toBeInTheDocument();
    expect(screen.getByText('Poda de árvore')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Editar Tapa-buraco' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar Poda de árvore' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desativar Tapa-buraco' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desativar Poda de árvore' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Rodar os testes**

Run: `cd frontend && npx vitest run src/components/ListaTiposDemanda.test.tsx`
Expected: todos passando.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ListaTiposDemanda.tsx frontend/src/components/ListaTiposDemanda.test.tsx
git commit -m "feat(frontend): tabela de tipos de demanda com criar/editar/ativar"
```

---

### Task 6: Página `/painel/configuracoes`

**Files:**
- Create: `frontend/src/app/painel/configuracoes/page.tsx`
- Create: `frontend/src/app/painel/configuracoes/page.test.tsx`

**Interfaces:**
- Consome: `ListaTiposDemanda` (Task 5), `useAuth` (`frontend/src/hooks/use-auth`).

- [ ] **Step 1: Criar `frontend/src/app/painel/configuracoes/page.tsx`**

```tsx
'use client';

import { useAuth } from '@/hooks/use-auth';
import { ListaTiposDemanda } from '@/components/ListaTiposDemanda';

export default function ConfiguracoesPage() {
  const { user } = useAuth();

  if (user?.role !== 'CHEFE') {
    return <p className="text-sm text-red-600">Acesso restrito ao chefe.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-primary-dark">Configurações</h1>
      <ListaTiposDemanda />
    </div>
  );
}
```

- [ ] **Step 2: Criar `frontend/src/app/painel/configuracoes/page.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConfiguracoesPage from './page';

const useAuthMock = vi.fn();
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => useAuthMock() }));

vi.mock('@/components/ListaTiposDemanda', () => ({
  ListaTiposDemanda: () => <div>Lista de tipos de demanda</div>,
}));

describe('ConfiguracoesPage', () => {
  it('mostra o conteúdo para o chefe', () => {
    useAuthMock.mockReturnValue({ user: { id: 'chefe-1', role: 'CHEFE' } });

    render(<ConfiguracoesPage />);

    expect(screen.getByText('Lista de tipos de demanda')).toBeInTheDocument();
  });

  it('mostra mensagem de acesso negado para quem não é chefe', () => {
    useAuthMock.mockReturnValue({ user: { id: 'a1', role: 'ASSESSOR_RUA' } });

    render(<ConfiguracoesPage />);

    expect(screen.queryByText('Lista de tipos de demanda')).not.toBeInTheDocument();
    expect(screen.getByText(/acesso restrito ao chefe/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Rodar a suíte completa do frontend e o typecheck**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: todos os arquivos e testes passando, typecheck limpo.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/painel/configuracoes/page.tsx frontend/src/app/painel/configuracoes/page.test.tsx
git commit -m "feat(frontend): pagina de configuracoes / tipos de demanda"
```

---

## Verificação final (após a Task 6)

Rodar as duas suítes completas mais uma vez, sobre a árvore final do branch:

```bash
cd frontend && npx vitest run && npx tsc --noEmit
```

```bash
cd backend && npm test && npm run typecheck
```

Ambas devem passar 100% antes da revisão final de branch.
