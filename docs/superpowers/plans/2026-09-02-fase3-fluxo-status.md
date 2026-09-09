# Fase 3 (parte 1) — Fluxo de Status e Protocolo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assessores de gabinete e chefe conseguem mover uma demanda pelo fluxo de trabalho real (receber, conferir, pedir informação, protocolar, andamento, concluir, recusar, arquivar), ver o histórico de cada mudança, e o chefe consegue reatribuir uma demanda para outro assessor.

**Architecture:** Mesmo padrão já estabelecido nas Fases 1-2 — repository → service → controller → route no backend, repositórios injetáveis (fakes nos testes unitários, Neon real nos testes de integração). A validação de "essa transição de status é permitida" vive num utilitário puro (`request-status.ts`), consumido tanto pelo backend (que é quem de fato garante a regra) quanto pelo front-end (só para decidir quais botões mostrar — nunca é a fonte da verdade). Toda mudança de status grava uma linha em `RequestStatusHistory` (tabela já existente desde a Fase 1); toda reatribuição grava uma linha numa nova tabela `RequestReassignmentHistory`. As duas gravações acontecem na mesma transação Prisma que atualiza a `Request`, para nunca ficar um registro sem o outro.

**Tech Stack:** Mesmo da Fase 2 — Express, TypeScript, Prisma, Zod; Next.js, React, Tailwind (mesmos componentes/tokens já existentes, nenhum novo).

## Global Constraints

- `ASSESSOR_RUA` não tem acesso a nenhuma transição de status nem à reatribuição — só visualiza (leitura) o status atual e o histórico das próprias demandas.
- `ASSESSOR_GABINETE` e `CHEFE` têm exatamente os mesmos poderes em todas as transições de status, em qualquer demanda.
- Reatribuir o assessor responsável por uma demanda é exclusivo do `CHEFE`; pode reatribuir para qualquer assessor ativo (`ASSESSOR_RUA` ou `ASSESSOR_GABINETE`).
- Transições de status válidas (nenhuma outra combinação é permitida — a tabela completa está na seção "Máquina de estados" da Task 2):
  `ENVIADA→RECEBIDA`, `RECEBIDA→EM_CONFERENCIA`, `EM_CONFERENCIA→PENDENTE_INFORMACAO`, `PENDENTE_INFORMACAO→EM_CONFERENCIA`, `EM_CONFERENCIA→PROTOCOLADA`, `PROTOCOLADA→EM_ANDAMENTO`, `EM_ANDAMENTO→CONCLUIDA`, `CONCLUIDA→ARQUIVADA`, `RECUSADA→ARQUIVADA`, e de `ENVIADA`/`RECEBIDA`/`EM_CONFERENCIA`/`PENDENTE_INFORMACAO` para `RECUSADA`.
- Transições para `PENDENTE_INFORMACAO` e `RECUSADA` exigem um motivo em texto livre (não vazio); as demais não exigem nada.
- `PROTOCOLADA` nesta fase é só uma mudança de status — não captura número de protocolo (isso fica para uma fase futura; o campo `numeroProtocolo` do schema continua sem uso).
- Ao entrar em `ARQUIVADA`, grava a data em `Request.arquivadoEm` (campo já existente no schema, sem uso até agora).
- Toda transição de status grava uma linha em `RequestStatusHistory`; toda reatribuição grava uma linha em `RequestReassignmentHistory`; as duas, na mesma transação Prisma que atualiza a `Request`.
- Botões de ação por status (nunca uma lista solta com todos os status) — evita pular etapa ou escolher um status incoerente.
- Toda regra de permissão é aplicada no backend, nunca só escondida no front-end.
- Interface 100% em português do Brasil. Front-end não acessa o banco diretamente — só fala com a API REST.
- Sem comentários no código a não ser para documentar um porquê não óbvio (mesma regra já seguida nas Fases 1-2).

---

## Task 1: Schema — tabela de histórico de reatribuição

**Files:**
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Produces: modelo `RequestReassignmentHistory` (campos: `id`, `requestId`, `assessorAnteriorId`, `assessorNovoId`, `reatribuidoPorId`, `createdAt`), consumido pela Task 4 (repositório).

- [ ] **Step 1: Adicionar as três relações reversas no `model User`**

Abra `backend/prisma/schema.prisma` e localize o `model User` (linhas ~30-49). Adicione estas três linhas junto das demais relações (depois de `notificacoes Notification[]`):

```prisma
  reatribuicoesComoAnterior RequestReassignmentHistory[] @relation("ReassignmentFrom")
  reatribuicoesComoNovo     RequestReassignmentHistory[] @relation("ReassignmentTo")
  reatribuicoesFeitas       RequestReassignmentHistory[] @relation("ReassignmentBy")
```

- [ ] **Step 2: Adicionar a relação reversa no `model Request`**

Localize o `model Request` (linhas ~105-144). Adicione esta linha junto das demais relações (depois de `consentimento PrivacyConsent?`):

```prisma
  reatribuicoes RequestReassignmentHistory[]
```

- [ ] **Step 3: Adicionar o novo modelo**

Adicione este bloco depois do `model RequestStatusHistory` existente (depois da linha 174, antes de `model InternalNote`):

```prisma
model RequestReassignmentHistory {
  id                 String   @id @default(uuid())
  requestId          String
  request            Request  @relation(fields: [requestId], references: [id])
  assessorAnteriorId String
  assessorAnterior   User     @relation("ReassignmentFrom", fields: [assessorAnteriorId], references: [id])
  assessorNovoId     String
  assessorNovo       User     @relation("ReassignmentTo", fields: [assessorNovoId], references: [id])
  reatribuidoPorId   String
  reatribuidoPor     User     @relation("ReassignmentBy", fields: [reatribuidoPorId], references: [id])
  createdAt          DateTime @default(now()) @db.Timestamptz(3)

  @@index([requestId])
  @@map("request_reassignment_history")
}
```

- [ ] **Step 4: Gerar e aplicar a migração**

Run (a partir de `backend/`, contra o banco `production`/dev do Neon já configurado em `.env`):
```bash
npx prisma migrate dev --name add_reassignment_history
```
Expected: cria uma nova pasta em `prisma/migrations/`, aplica no Neon dev, e regenera o Prisma Client sem erros.

- [ ] **Step 5: Confirmar que o typecheck do backend continua limpo**

Run: `npm run typecheck` (a partir de `backend/`)
Expected: sem erros (o Prisma Client novo já expõe `prisma.requestReassignmentHistory`).

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(backend): adiciona tabela de historico de reatribuicao de demandas"
```

---

## Task 2: Regras de transição de status

**Files:**
- Modify: `backend/src/utils/request-status.ts`
- Test: `backend/tests/unit/request-status.test.ts` (arquivo já existe, 2 testes — adicionar sem remover os existentes)

**Interfaces:**
- Consumes: `RequestStatusValue` (já existe no mesmo arquivo).
- Produces: `TRANSICOES_VALIDAS: Record<RequestStatusValue, RequestStatusValue[]>`, `transicaoValida(de, para): boolean`, `exigeMotivo(novoStatus): boolean` — consumidos pela Task 5 (service).

### Máquina de estados

| De | Para | Motivo obrigatório? |
|---|---|---|
| `ENVIADA` | `RECEBIDA` | não |
| `ENVIADA` | `RECUSADA` | sim |
| `RECEBIDA` | `EM_CONFERENCIA` | não |
| `RECEBIDA` | `RECUSADA` | sim |
| `EM_CONFERENCIA` | `PENDENTE_INFORMACAO` | sim |
| `EM_CONFERENCIA` | `PROTOCOLADA` | não |
| `EM_CONFERENCIA` | `RECUSADA` | sim |
| `PENDENTE_INFORMACAO` | `EM_CONFERENCIA` | não |
| `PENDENTE_INFORMACAO` | `RECUSADA` | sim |
| `PROTOCOLADA` | `EM_ANDAMENTO` | não |
| `EM_ANDAMENTO` | `CONCLUIDA` | não |
| `CONCLUIDA` | `ARQUIVADA` | não |
| `RECUSADA` | `ARQUIVADA` | não |

Qualquer combinação fora desta tabela (incluindo qualquer coisa envolvendo `RASCUNHO` ou `ARQUIVADA` como origem) é inválida.

- [ ] **Step 1: Escrever o teste (adicionar ao arquivo existente)**

Adicione ao final de `backend/tests/unit/request-status.test.ts` (mantendo os 2 `describe` blocks já existentes acima):

```ts
import { transicaoValida, exigeMotivo, TRANSICOES_VALIDAS } from '../../src/utils/request-status.js';

describe('transicaoValida', () => {
  it('permite cada transição da tabela de transições válidas', () => {
    for (const [de, destinos] of Object.entries(TRANSICOES_VALIDAS)) {
      for (const para of destinos) {
        expect(transicaoValida(de as never, para)).toBe(true);
      }
    }
  });

  it('bloqueia pular etapas', () => {
    expect(transicaoValida('ENVIADA', 'PROTOCOLADA')).toBe(false);
    expect(transicaoValida('EM_CONFERENCIA', 'CONCLUIDA')).toBe(false);
    expect(transicaoValida('RECEBIDA', 'ARQUIVADA')).toBe(false);
  });

  it('bloqueia qualquer transição a partir de RASCUNHO ou ARQUIVADA', () => {
    expect(transicaoValida('RASCUNHO', 'ENVIADA')).toBe(false);
    expect(transicaoValida('ARQUIVADA', 'CONCLUIDA')).toBe(false);
  });

  it('bloqueia recusar depois de protocolada', () => {
    expect(transicaoValida('PROTOCOLADA', 'RECUSADA')).toBe(false);
    expect(transicaoValida('EM_ANDAMENTO', 'RECUSADA')).toBe(false);
  });
});

describe('exigeMotivo', () => {
  it('exige motivo para PENDENTE_INFORMACAO e RECUSADA', () => {
    expect(exigeMotivo('PENDENTE_INFORMACAO')).toBe(true);
    expect(exigeMotivo('RECUSADA')).toBe(true);
  });

  it('não exige motivo para as demais transições', () => {
    expect(exigeMotivo('RECEBIDA')).toBe(false);
    expect(exigeMotivo('PROTOCOLADA')).toBe(false);
    expect(exigeMotivo('ARQUIVADA')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/unit/request-status.test.ts`
Expected: FAIL — `transicaoValida`, `exigeMotivo`, `TRANSICOES_VALIDAS` não existem.

- [ ] **Step 3: Implementar**

Adicione ao final de `backend/src/utils/request-status.ts` (sem remover o que já existe):

```ts
export const TRANSICOES_VALIDAS: Record<RequestStatusValue, RequestStatusValue[]> = {
  RASCUNHO: [],
  ENVIADA: ['RECEBIDA', 'RECUSADA'],
  RECEBIDA: ['EM_CONFERENCIA', 'RECUSADA'],
  EM_CONFERENCIA: ['PENDENTE_INFORMACAO', 'PROTOCOLADA', 'RECUSADA'],
  PENDENTE_INFORMACAO: ['EM_CONFERENCIA', 'RECUSADA'],
  PROTOCOLADA: ['EM_ANDAMENTO'],
  EM_ANDAMENTO: ['CONCLUIDA'],
  CONCLUIDA: ['ARQUIVADA'],
  ARQUIVADA: [],
  RECUSADA: ['ARQUIVADA'],
};

export function transicaoValida(de: RequestStatusValue, para: RequestStatusValue): boolean {
  return TRANSICOES_VALIDAS[de].includes(para);
}

const STATUS_QUE_EXIGEM_MOTIVO: readonly RequestStatusValue[] = ['PENDENTE_INFORMACAO', 'RECUSADA'];

export function exigeMotivo(novoStatus: RequestStatusValue): boolean {
  return (STATUS_QUE_EXIGEM_MOTIVO as RequestStatusValue[]).includes(novoStatus);
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/unit/request-status.test.ts`
Expected: PASS (2 testes já existentes + 6 novos = 8 testes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/request-status.ts backend/tests/unit/request-status.test.ts
git commit -m "feat(backend): regras de transicao de status da demanda"
```

---

## Task 3: Repositório — status, histórico e reatribuição

**Files:**
- Modify: `backend/src/repositories/request.repository.ts`
- Modify: `backend/tests/helpers/fakes.ts` (estender `createFakeRequestRepo`)
- Test: `backend/tests/integration/request.repository.test.ts` (arquivo já existe — adicionar sem remover os testes existentes)

**Interfaces:**
- Consumes: `TRANSICOES_VALIDAS`/`RequestStatusValue` (Task 2, só o tipo — a validação em si é responsabilidade do service, não do repositório).
- Produces: `RequestRepository.updateStatus(id, novoStatus, usuarioId, motivo?)`, `RequestRepository.listarHistoricoStatus(id)`, `RequestRepository.reatribuir(id, novoAssessorId, reatribuidoPorId)`, tipo `HistoricoStatusItem` — consumidos pela Task 5 (service).

- [ ] **Step 1: Escrever o teste (adicionar ao arquivo existente)**

Adicione ao final de `backend/tests/integration/request.repository.test.ts`. O arquivo já expõe, no escopo do módulo, `prisma`, `requestRepo`, `tipoId`, `assessorId` (preenchidos no `beforeEach`), a função `inputBase(overrides?)` e a constante `fotoBase` — use exatamente esses, sem recriar setup novo. Como `codigoInterno` é `@unique` e o `beforeEach` já limpa as tabelas antes de cada teste, basta um `codigoInterno` diferente por `it()` (não precisa ser diferente entre `describe` blocks).

```ts
describe('RequestRepository.updateStatus', () => {
  it('atualiza o status e grava uma linha no histórico', async () => {
    const criado = await requestRepo.create(inputBase({ codigoInterno: 'GD-status-1' }), [fotoBase]);

    const atualizada = await requestRepo.updateStatus(criado.id, 'RECEBIDA', assessorId);

    expect(atualizada.status).toBe('RECEBIDA');
    const historico = await prisma.requestStatusHistory.findMany({ where: { requestId: criado.id } });
    expect(historico).toHaveLength(1);
    expect(historico[0]?.statusAnterior).toBe('ENVIADA');
    expect(historico[0]?.statusNovo).toBe('RECEBIDA');
    expect(historico[0]?.usuarioId).toBe(assessorId);
    expect(historico[0]?.observacao).toBeNull();
  });

  // 1 create + 3 updateStatus em sequência contra o Neon real; mesmo raciocínio dos testes
  // de paginação acima (timeout ampliado só aqui, não globalmente).
  it('grava o motivo quando informado', async () => {
    const criado = await requestRepo.create(inputBase({ codigoInterno: 'GD-status-2' }), [fotoBase]);
    await requestRepo.updateStatus(criado.id, 'RECEBIDA', assessorId);
    await requestRepo.updateStatus(criado.id, 'EM_CONFERENCIA', assessorId);

    await requestRepo.updateStatus(criado.id, 'PENDENTE_INFORMACAO', assessorId, 'Falta o telefone do solicitante');

    const historico = await prisma.requestStatusHistory.findMany({
      where: { requestId: criado.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(historico).toHaveLength(3);
    expect(historico[2]?.observacao).toBe('Falta o telefone do solicitante');
  }, 20000);

  it('grava arquivadoEm ao entrar em ARQUIVADA', async () => {
    const criado = await requestRepo.create(inputBase({ codigoInterno: 'GD-status-3' }), [fotoBase]);
    await requestRepo.updateStatus(criado.id, 'RECUSADA', assessorId, 'Duplicado');

    await requestRepo.updateStatus(criado.id, 'ARQUIVADA', assessorId);

    const linha = await prisma.request.findUniqueOrThrow({ where: { id: criado.id } });
    expect(linha.arquivadoEm).not.toBeNull();
  });
});

describe('RequestRepository.listarHistoricoStatus', () => {
  it('lista o histórico mais recente primeiro, com o nome de quem alterou', async () => {
    const criado = await requestRepo.create(inputBase({ codigoInterno: 'GD-hist-1' }), [fotoBase]);
    await requestRepo.updateStatus(criado.id, 'RECEBIDA', assessorId);
    await requestRepo.updateStatus(criado.id, 'EM_CONFERENCIA', assessorId);

    const historico = await requestRepo.listarHistoricoStatus(criado.id);

    expect(historico).toHaveLength(2);
    expect(historico[0]?.statusNovo).toBe('EM_CONFERENCIA');
    expect(historico[1]?.statusNovo).toBe('RECEBIDA');
    expect(historico[0]?.usuarioNome).toBe('Assessor Teste');
  }, 20000);

  it('retorna lista vazia para uma demanda sem mudança de status', async () => {
    const criado = await requestRepo.create(inputBase({ codigoInterno: 'GD-hist-2' }), [fotoBase]);

    const historico = await requestRepo.listarHistoricoStatus(criado.id);

    expect(historico).toEqual([]);
  });
});

describe('RequestRepository.reatribuir', () => {
  it('atualiza o assessor responsável e grava uma linha no histórico de reatribuição', async () => {
    const criado = await requestRepo.create(inputBase({ codigoInterno: 'GD-reatrib-1' }), [fotoBase]);
    const novoAssessor = await prisma.user.create({
      data: { nome: 'Novo Assessor', telefone: '+5534999996300', role: 'ASSESSOR_GABINETE' },
    });
    const chefe = await prisma.user.create({
      data: { nome: 'Chefe Teste', telefone: '+5534999996400', role: 'CHEFE' },
    });

    const atualizada = await requestRepo.reatribuir(criado.id, novoAssessor.id, chefe.id);

    expect(atualizada.assessorResponsavelId).toBe(novoAssessor.id);
    const historico = await prisma.requestReassignmentHistory.findMany({ where: { requestId: criado.id } });
    expect(historico).toHaveLength(1);
    expect(historico[0]?.assessorAnteriorId).toBe(assessorId);
    expect(historico[0]?.assessorNovoId).toBe(novoAssessor.id);
    expect(historico[0]?.reatribuidoPorId).toBe(chefe.id);
  });
});
```

`inputBase()` sem override de `assessorResponsavelId` sempre usa `assessorId` (o assessor criado no `beforeEach`) — é por isso que os testes acima podem comparar direto contra `assessorId`.

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/integration/request.repository.test.ts`
Expected: FAIL — `updateStatus`, `listarHistoricoStatus`, `reatribuir` não existem em `RequestRepository`.

- [ ] **Step 3: Implementar**

Em `backend/src/repositories/request.repository.ts`:

Adicione ao final do bloco de imports:
```ts
import type { RequestStatusValue } from '../utils/request-status.js';
```
(já deve existir — confirme antes de duplicar o import).

Adicione esta interface junto das demais (depois de `Paginacao`):
```ts
export interface HistoricoStatusItem {
  id: string;
  statusAnterior: RequestStatusValue | null;
  statusNovo: RequestStatusValue;
  usuarioId: string;
  usuarioNome: string;
  observacao: string | null;
  createdAt: Date;
}
```

Adicione estas três assinaturas à interface `RequestRepository` (depois de `update`):
```ts
  updateStatus(id: string, novoStatus: RequestStatusValue, usuarioId: string, motivo?: string): Promise<RequestDetail>;
  listarHistoricoStatus(id: string): Promise<HistoricoStatusItem[]>;
  reatribuir(id: string, novoAssessorId: string, reatribuidoPorId: string): Promise<RequestDetail>;
```

Adicione estas três implementações dentro do objeto retornado por `createRequestRepository`, depois de `update` (mantendo a vírgula final do método anterior):

```ts
    async updateStatus(id, novoStatus, usuarioId, motivo) {
      return prisma.$transaction(async (tx) => {
        const atual = await tx.request.findUniqueOrThrow({ where: { id } });
        await tx.requestStatusHistory.create({
          data: {
            requestId: id,
            statusAnterior: atual.status,
            statusNovo: novoStatus,
            usuarioId,
            observacao: motivo,
          },
        });
        const atualizado = await tx.request.update({
          where: { id },
          data: {
            status: novoStatus,
            ...(novoStatus === 'ARQUIVADA' ? { arquivadoEm: new Date() } : {}),
          },
          include: INCLUDE_DETALHE,
        });
        return toDetail(atualizado);
      });
    },

    async listarHistoricoStatus(id) {
      const rows = await prisma.requestStatusHistory.findMany({
        where: { requestId: id },
        include: { usuario: { select: { nome: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map((row) => ({
        id: row.id,
        statusAnterior: row.statusAnterior as RequestStatusValue | null,
        statusNovo: row.statusNovo as RequestStatusValue,
        usuarioId: row.usuarioId,
        usuarioNome: row.usuario.nome,
        observacao: row.observacao,
        createdAt: row.createdAt,
      }));
    },

    async reatribuir(id, novoAssessorId, reatribuidoPorId) {
      return prisma.$transaction(async (tx) => {
        const atual = await tx.request.findUniqueOrThrow({ where: { id } });
        await tx.requestReassignmentHistory.create({
          data: {
            requestId: id,
            assessorAnteriorId: atual.assessorResponsavelId,
            assessorNovoId: novoAssessorId,
            reatribuidoPorId,
          },
        });
        const atualizado = await tx.request.update({
          where: { id },
          data: { assessorResponsavelId: novoAssessorId },
          include: INCLUDE_DETALHE,
        });
        return toDetail(atualizado);
      });
    },
```

- [ ] **Step 4: Estender o fake para os testes unitários (Task 5 vai precisar)**

Em `backend/tests/helpers/fakes.ts`, dentro de `createFakeRequestRepo`, adicione um array interno para o histórico e as três novas funções. Adicione perto do topo da função (junto de `const created` e `const store`):

```ts
  const historicoStatus: { requestId: string; statusAnterior: string | null; statusNovo: string; usuarioId: string; observacao: string | null; createdAt: Date }[] = [];
  const historicoReatribuicao: { requestId: string; assessorAnteriorId: string; assessorNovoId: string; reatribuidoPorId: string; createdAt: Date }[] = [];
```

E adicione estes três métodos ao objeto retornado, depois de `update`:

```ts
    async updateStatus(id, novoStatus, usuarioId, motivo) {
      const existente = store.find((r) => r.id === id);
      if (!existente) throw new Error('Request não encontrada (fake)');
      historicoStatus.push({
        requestId: id,
        statusAnterior: existente.status,
        statusNovo: novoStatus,
        usuarioId,
        observacao: motivo ?? null,
        createdAt: new Date(),
      });
      existente.status = novoStatus;
      return existente;
    },
    async listarHistoricoStatus(id) {
      return historicoStatus
        .filter((h) => h.requestId === id)
        .slice()
        .reverse()
        .map((h, i) => ({
          id: `historico-${id}-${i}`,
          statusAnterior: h.statusAnterior as never,
          statusNovo: h.statusNovo as never,
          usuarioId: h.usuarioId,
          usuarioNome: 'Usuário Fake',
          observacao: h.observacao,
          createdAt: h.createdAt,
        }));
    },
    async reatribuir(id, novoAssessorId, reatribuidoPorId) {
      const existente = store.find((r) => r.id === id);
      if (!existente) throw new Error('Request não encontrada (fake)');
      historicoReatribuicao.push({
        requestId: id,
        assessorAnteriorId: existente.assessorResponsavelId,
        assessorNovoId: novoAssessorId,
        reatribuidoPorId,
        createdAt: new Date(),
      });
      existente.assessorResponsavelId = novoAssessorId;
      return existente;
    },
```

- [ ] **Step 5: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/integration/request.repository.test.ts`
Expected: PASS (todos os testes já existentes + os 6 novos).

- [ ] **Step 6: Rodar o typecheck**

Run: `cd backend && npm run typecheck`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add backend/src/repositories/request.repository.ts backend/tests/helpers/fakes.ts backend/tests/integration/request.repository.test.ts
git commit -m "feat(backend): repositorio grava mudanca de status e reatribuicao com historico"
```

---

## Task 4: Service — mudar status, histórico e reatribuir

**Files:**
- Modify: `backend/src/services/request.service.ts`
- Modify: `backend/tests/unit/request-service-consultas.test.ts` (o `buildService()` precisa passar a fornecer `userRepo`)
- Modify: `backend/tests/unit/request-service-criar.test.ts` (mesmo ajuste no `buildService()`, se esse arquivo também construir `RequestService` diretamente — confira antes de editar)
- Test: `backend/tests/unit/request-service-consultas.test.ts` (adicionar novos casos)

**Interfaces:**
- Consumes: `transicaoValida`, `exigeMotivo` (Task 2); `RequestRepository.updateStatus/listarHistoricoStatus/reatribuir`, `HistoricoStatusItem` (Task 3); `UserRepository.findById` (Fase 1, já existe).
- Produces: `RequestService.mudarStatus`, `RequestService.reatribuir`, `RequestService.listarHistoricoStatus`, tipos `MudarStatusResultado`, `ReatribuirResultado`, `HistoricoStatusResultado` — consumidos pela Task 6 (controller).

**Nota importante:** `RequestService` passa a exigir `userRepo` no construtor. Isso quebra qualquer teste que já construa `new RequestService({...})` sem esse campo — passe `createFakeUserRepo()` (já existe em `fakes.ts`) nesses lugares.

- [ ] **Step 1: Escrever o teste**

Primeiro, leia `backend/tests/unit/request-service-consultas.test.ts` e `backend/tests/unit/request-service-criar.test.ts` para localizar cada `buildService()` (ou equivalente) que faz `new RequestService({ requestRepo, requestTypeRepo, photoUploader })`. Em cada um, adicione `userRepo` ao objeto:

```ts
import { createFakeRequestTypeRepo, createFakeRequestRepo, createFakePhotoUploader, createFakeUserRepo } from '../helpers/fakes.js';

function buildService() {
  const requestTypeRepo = createFakeRequestTypeRepo([
    { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true },
  ]);
  const requestRepo = createFakeRequestRepo();
  const photoUploader = createFakePhotoUploader();
  const userRepo = createFakeUserRepo([
    { id: 'gabinete-1', nome: 'Gabinete', telefone: '+5534988880001', role: 'ASSESSOR_GABINETE', ativo: true, pinDefinido: true, pinHash: null, createdAt: new Date(), updatedAt: new Date() },
  ]);
  const service = new RequestService({ requestRepo, requestTypeRepo, photoUploader, userRepo });
  return { service, requestRepo, userRepo };
}
```

Ajuste o seed de `userRepo` conforme o que cada teste específico já usa como ids de usuário (mantenha os existentes funcionando — o objetivo aqui é só satisfazer o novo campo obrigatório do construtor, não mudar o comportamento dos testes já existentes).

Depois, adicione ao final de `backend/tests/unit/request-service-consultas.test.ts`:

```ts
describe('RequestService.mudarStatus', () => {
  it('avança o status quando a transição é válida', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-eu');

    const resultado = await service.mudarStatus(demanda.id, 'RECEBIDA', undefined, 'gabinete-1');

    expect(resultado.status).toBe('ok');
    if (resultado.status === 'ok') {
      expect(resultado.demanda.status).toBe('RECEBIDA');
    }
  });

  it('rejeita uma transição fora da máquina de estados', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-eu');

    const resultado = await service.mudarStatus(demanda.id, 'PROTOCOLADA', undefined, 'gabinete-1');

    expect(resultado.status).toBe('transicao_invalida');
  });

  it('exige motivo para PENDENTE_INFORMACAO', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-eu');
    await service.mudarStatus(demanda.id, 'RECEBIDA', undefined, 'gabinete-1');
    await service.mudarStatus(demanda.id, 'EM_CONFERENCIA', undefined, 'gabinete-1');

    const semMotivo = await service.mudarStatus(demanda.id, 'PENDENTE_INFORMACAO', undefined, 'gabinete-1');
    expect(semMotivo.status).toBe('motivo_obrigatorio');

    const comMotivo = await service.mudarStatus(demanda.id, 'PENDENTE_INFORMACAO', 'Falta telefone', 'gabinete-1');
    expect(comMotivo.status).toBe('ok');
  });

  it('retorna nao_encontrada para um id inexistente', async () => {
    const { service } = buildService();
    const resultado = await service.mudarStatus('id-inexistente', 'RECEBIDA', undefined, 'gabinete-1');
    expect(resultado.status).toBe('nao_encontrada');
  });
});

describe('RequestService.listarHistoricoStatus', () => {
  it('assessor de rua vê o histórico da própria demanda', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-eu');
    await service.mudarStatus(demanda.id, 'RECEBIDA', undefined, 'gabinete-1');

    const resultado = await service.listarHistoricoStatus(demanda.id, { id: 'user-eu', role: 'ASSESSOR_RUA' });

    expect(resultado.status).toBe('ok');
    if (resultado.status === 'ok') {
      expect(resultado.historico).toHaveLength(1);
    }
  });

  it('assessor de rua não vê o histórico de demanda de outro', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-outro');

    const resultado = await service.listarHistoricoStatus(demanda.id, { id: 'user-eu', role: 'ASSESSOR_RUA' });

    expect(resultado.status).toBe('sem_permissao');
  });
});

describe('RequestService.reatribuir', () => {
  it('reatribui para um assessor ativo', async () => {
    const { service, requestRepo, userRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-original');
    await userRepo.create({ nome: 'Novo Assessor', telefone: '+5534988880002', role: 'ASSESSOR_RUA' });
    const novoAssessor = userRepo.users.find((u) => u.nome === 'Novo Assessor')!;

    const resultado = await service.reatribuir(demanda.id, novoAssessor.id, 'chefe-1');

    expect(resultado.status).toBe('ok');
    if (resultado.status === 'ok') {
      expect(resultado.demanda.assessorResponsavelId).toBe(novoAssessor.id);
    }
  });

  it('rejeita reatribuir para um assessor inexistente', async () => {
    const { service, requestRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-original');

    const resultado = await service.reatribuir(demanda.id, 'id-que-nao-existe', 'chefe-1');

    expect(resultado.status).toBe('assessor_invalido');
  });

  it('rejeita reatribuir para um assessor inativo', async () => {
    const { service, requestRepo, userRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-original');
    await userRepo.create({ nome: 'Assessor Inativo', telefone: '+5534988880003', role: 'ASSESSOR_RUA' });
    const inativo = userRepo.users.find((u) => u.nome === 'Assessor Inativo')!;
    await userRepo.setAtivo(inativo.id, false);

    const resultado = await service.reatribuir(demanda.id, inativo.id, 'chefe-1');

    expect(resultado.status).toBe('assessor_invalido');
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/unit/request-service-consultas.test.ts tests/unit/request-service-criar.test.ts`
Expected: FAIL — `mudarStatus`, `listarHistoricoStatus`, `reatribuir` não existem em `RequestService`; construtor exige `userRepo`.

- [ ] **Step 3: Implementar**

Em `backend/src/services/request.service.ts`:

No topo, adicione aos imports:
```ts
import type { UserRepository } from '../repositories/user.repository.js';
import type { HistoricoStatusItem } from '../repositories/request.repository.js';
import { transicaoValida, exigeMotivo, podeEditarComoAssessorDeRua, type RequestStatusValue } from '../utils/request-status.js';
```
(a linha de `podeEditarComoAssessorDeRua` já existe — só adicione `transicaoValida, exigeMotivo, type RequestStatusValue` ao mesmo import em vez de duplicar a linha.)

Adicione estes tipos, junto dos demais `*Resultado` já existentes:
```ts
export type MudarStatusResultado =
  | { status: 'ok'; demanda: DemandaDetalhe }
  | { status: 'nao_encontrada' }
  | { status: 'transicao_invalida' }
  | { status: 'motivo_obrigatorio' };

export type ReatribuirResultado =
  | { status: 'ok'; demanda: DemandaDetalhe }
  | { status: 'nao_encontrada' }
  | { status: 'assessor_invalido' };

export type HistoricoStatusResultado =
  | { status: 'ok'; historico: HistoricoStatusItem[] }
  | { status: 'nao_encontrada' }
  | { status: 'sem_permissao' };
```

Modifique a classe: adicione o campo e o parâmetro do construtor:
```ts
export class RequestService {
  private requestRepo: RequestRepository;
  private requestTypeRepo: RequestTypeRepository;
  private photoUploader: PhotoUploader;
  private userRepo: UserRepository;

  constructor(deps: {
    requestRepo: RequestRepository;
    requestTypeRepo: RequestTypeRepository;
    photoUploader: PhotoUploader;
    userRepo: UserRepository;
  }) {
    this.requestRepo = deps.requestRepo;
    this.requestTypeRepo = deps.requestTypeRepo;
    this.photoUploader = deps.photoUploader;
    this.userRepo = deps.userRepo;
  }
```

Adicione estes três métodos ao final da classe, antes do `}` de fechamento:

```ts
  async mudarStatus(
    id: string,
    novoStatus: RequestStatusValue,
    motivo: string | undefined,
    usuarioId: string,
  ): Promise<MudarStatusResultado> {
    const demanda = await this.requestRepo.findById(id);
    if (!demanda) return { status: 'nao_encontrada' };
    if (!transicaoValida(demanda.status, novoStatus)) return { status: 'transicao_invalida' };
    if (exigeMotivo(novoStatus) && !motivo?.trim()) return { status: 'motivo_obrigatorio' };

    const atualizado = await this.requestRepo.updateStatus(id, novoStatus, usuarioId, motivo);
    return { status: 'ok', demanda: this.comFotosAssinadas(atualizado) };
  }

  async listarHistoricoStatus(id: string, usuario: UsuarioAutenticado): Promise<HistoricoStatusResultado> {
    const demanda = await this.requestRepo.findById(id);
    if (!demanda) return { status: 'nao_encontrada' };
    if (usuario.role === 'ASSESSOR_RUA' && demanda.assessorResponsavelId !== usuario.id) {
      return { status: 'sem_permissao' };
    }
    const historico = await this.requestRepo.listarHistoricoStatus(id);
    return { status: 'ok', historico };
  }

  async reatribuir(id: string, novoAssessorId: string, reatribuidoPorId: string): Promise<ReatribuirResultado> {
    const demanda = await this.requestRepo.findById(id);
    if (!demanda) return { status: 'nao_encontrada' };

    const novoAssessor = await this.userRepo.findById(novoAssessorId);
    if (!novoAssessor || !novoAssessor.ativo) return { status: 'assessor_invalido' };

    const atualizado = await this.requestRepo.reatribuir(id, novoAssessorId, reatribuidoPorId);
    return { status: 'ok', demanda: this.comFotosAssinadas(atualizado) };
  }
```

Note que `podeEditarComoAssessorDeRua` já é importado (usado em `editar`) — o import consolidado do Step 3 acima substitui a linha de import antiga, não duplica.

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/unit/request-service-consultas.test.ts tests/unit/request-service-criar.test.ts`
Expected: PASS (todos os testes já existentes + os 10 novos).

- [ ] **Step 5: Rodar toda a suíte do backend**

Run: `cd backend && npm test && npm run typecheck`
Expected: tudo passando (o construtor de `RequestService` mudou — qualquer outro lugar que o construa direto, como `app.ts`, ainda vai ser ajustado na Task 6; se algum outro teste quebrar por causa disso, ele será corrigido na Task 6, não aqui — confirme que a quebra é exatamente essa e nenhuma outra).

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/request.service.ts backend/tests/unit/request-service-consultas.test.ts backend/tests/unit/request-service-criar.test.ts
git commit -m "feat(backend): RequestService.mudarStatus, reatribuir e listarHistoricoStatus"
```

---

## Task 5: Validadores

**Files:**
- Modify: `backend/src/validators/request.validators.ts`
- Test: `backend/tests/unit/request-validators.test.ts` (arquivo já existe — adicionar sem remover os testes existentes)

**Interfaces:**
- Produces: `mudarStatusSchema`, `reatribuirSchema` — consumidos pela Task 6 (controller).

- [ ] **Step 1: Escrever o teste**

Adicione ao final de `backend/tests/unit/request-validators.test.ts`:

```ts
import { mudarStatusSchema, reatribuirSchema } from '../../src/validators/request.validators.js';

describe('mudarStatusSchema', () => {
  it('aceita novoStatus sem motivo', () => {
    const resultado = mudarStatusSchema.safeParse({ novoStatus: 'RECEBIDA' });
    expect(resultado.success).toBe(true);
  });

  it('aceita novoStatus com motivo', () => {
    const resultado = mudarStatusSchema.safeParse({ novoStatus: 'RECUSADA', motivo: 'Duplicado' });
    expect(resultado.success).toBe(true);
  });

  it('rejeita um status fora do enum', () => {
    const resultado = mudarStatusSchema.safeParse({ novoStatus: 'INEXISTENTE' });
    expect(resultado.success).toBe(false);
  });

  it('rejeita quando novoStatus não é informado', () => {
    const resultado = mudarStatusSchema.safeParse({});
    expect(resultado.success).toBe(false);
  });
});

describe('reatribuirSchema', () => {
  it('aceita um uuid válido', () => {
    const resultado = reatribuirSchema.safeParse({ novoAssessorId: '11111111-1111-1111-1111-111111111111' });
    expect(resultado.success).toBe(true);
  });

  it('rejeita um id que não é uuid', () => {
    const resultado = reatribuirSchema.safeParse({ novoAssessorId: 'nao-e-um-uuid' });
    expect(resultado.success).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/unit/request-validators.test.ts`
Expected: FAIL — `mudarStatusSchema`, `reatribuirSchema` não existem.

- [ ] **Step 3: Implementar**

Adicione ao final de `backend/src/validators/request.validators.ts` (o arquivo já tem `statusEnum` definido perto do topo — reuse-o, não redeclare):

```ts
export const mudarStatusSchema = z.object({
  novoStatus: statusEnum,
  motivo: z.string().optional(),
});

export const reatribuirSchema = z.object({
  novoAssessorId: z.string().uuid(),
});
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/unit/request-validators.test.ts`
Expected: PASS (todos os testes já existentes + 6 novos).

- [ ] **Step 5: Commit**

```bash
git add backend/src/validators/request.validators.ts backend/tests/unit/request-validators.test.ts
git commit -m "feat(backend): validadores para mudar status e reatribuir demanda"
```

---

## Task 6: Controller, rotas e wiring no app

**Files:**
- Modify: `backend/src/controllers/request.controller.ts`
- Modify: `backend/src/routes/request.routes.ts`
- Modify: `backend/src/app.ts`

**Interfaces:**
- Consumes: `RequestService.mudarStatus/listarHistoricoStatus/reatribuir` (Task 4); `mudarStatusSchema`/`reatribuirSchema` (Task 5); `requireRole` (Fase 1, já existe em `backend/src/middlewares/require-role.ts`).
- Produces: `PATCH /demandas/:id/status`, `GET /demandas/:id/historico-status`, `PATCH /demandas/:id/reatribuir`.

Esta task não tem ciclo de teste próprio (é só fiação entre as peças já testadas nas Tasks 3-5) — a Task 7 cobre as rotas com testes de integração de ponta a ponta.

- [ ] **Step 1: Controller**

Em `backend/src/controllers/request.controller.ts`, adicione ao import do topo (`mudarStatusSchema, reatribuirSchema`):

```ts
import { criarDemandaSchema, editarDemandaSchema, listarDemandasQuerySchema, demandaIdParamsSchema, mudarStatusSchema, reatribuirSchema } from '../validators/request.validators.js';
```

Adicione estes três métodos ao objeto retornado por `createRequestController`, depois de `editar` (mantendo a vírgula do método anterior):

```ts
    async mudarStatus(req: Request, res: Response) {
      const { id } = demandaIdParamsSchema.parse(req.params);
      const dados = mudarStatusSchema.parse(req.body);
      const resultado = await requestService.mudarStatus(id, dados.novoStatus, dados.motivo, req.user!.id);
      if (resultado.status === 'nao_encontrada') throw new HttpError(404, 'Demanda não encontrada');
      if (resultado.status === 'transicao_invalida') throw new HttpError(400, 'Transição de status inválida');
      if (resultado.status === 'motivo_obrigatorio') {
        throw new HttpError(400, 'É necessário informar o motivo para esta transição');
      }
      res.json({ success: true, data: resultado.demanda });
    },

    async historicoStatus(req: Request, res: Response) {
      const { id } = demandaIdParamsSchema.parse(req.params);
      const resultado = await requestService.listarHistoricoStatus(id, req.user!);
      if (resultado.status === 'nao_encontrada') throw new HttpError(404, 'Demanda não encontrada');
      if (resultado.status === 'sem_permissao') throw new HttpError(403, 'Você não tem acesso a esta demanda');
      res.json({ success: true, data: resultado.historico });
    },

    async reatribuir(req: Request, res: Response) {
      const { id } = demandaIdParamsSchema.parse(req.params);
      const dados = reatribuirSchema.parse(req.body);
      const resultado = await requestService.reatribuir(id, dados.novoAssessorId, req.user!.id);
      if (resultado.status === 'nao_encontrada') throw new HttpError(404, 'Demanda não encontrada');
      if (resultado.status === 'assessor_invalido') throw new HttpError(400, 'Assessor inválido ou inativo');
      res.json({ success: true, data: resultado.demanda });
    },
```

(O nome do parâmetro na assinatura de `createRequestController(requestService: RequestService)` já existe — os três métodos acima usam essa mesma variável `requestService` do closure, igual aos métodos já existentes.)

- [ ] **Step 2: Rotas**

Em `backend/src/routes/request.routes.ts`, adicione ao import:

```ts
import { requireRole } from '../middlewares/require-role.js';
```

Adicione estas três linhas depois de `router.patch('/:id', auth, asyncHandler(controller.editar));`:

```ts
  router.patch('/:id/status', auth, requireRole('ASSESSOR_GABINETE', 'CHEFE'), asyncHandler(controller.mudarStatus));
  router.get('/:id/historico-status', auth, asyncHandler(controller.historicoStatus));
  router.patch('/:id/reatribuir', auth, requireRole('CHEFE'), asyncHandler(controller.reatribuir));
```

- [ ] **Step 3: Wiring no app**

Em `backend/src/app.ts`, `RequestService` agora exige `userRepo` no construtor (Task 4). Atualize a linha:

```ts
  const requestService = new RequestService({ requestRepo, requestTypeRepo, photoUploader });
```

para:

```ts
  const requestService = new RequestService({ requestRepo, requestTypeRepo, photoUploader, userRepo });
```

(`userRepo` já existe nesse escopo, declarado logo acima — nenhum import novo necessário.)

- [ ] **Step 4: Confirmar que a suíte completa continua passando**

Run: `cd backend && npm test && npm run typecheck`
Expected: tudo passando — nenhuma rota nova tem teste ainda (isso é a Task 7), mas nada deve quebrar.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/request.controller.ts backend/src/routes/request.routes.ts backend/src/app.ts
git commit -m "feat(backend): rotas de mudar status, historico e reatribuir demanda"
```

---

## Task 7: Testes de integração das novas rotas

**Files:**
- Modify: `backend/tests/integration/request.routes.test.ts` (arquivo já existe — adicionar sem remover os testes existentes)

**Interfaces:**
- Consumes: as três rotas da Task 6.

- [ ] **Step 1: Escrever os testes**

Leia o topo do arquivo primeiro (helpers já existentes: `loginComoAssessor`, `criarTipo`, `camposBase`, `fotoValida`) e reuse-os. Adicione ao final do arquivo:

```ts
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
    const { accessToken: tokenChefe } = await loginComoAssessor('CHEFE' as never, '+5534999998013');
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
    const { accessToken: tokenChefe } = await loginComoAssessor('CHEFE' as never, '+5534999998018');

    const res = await request(app)
      .patch(`/demandas/${demanda.id}/reatribuir`)
      .set('Authorization', `Bearer ${tokenChefe}`)
      .send({ novoAssessorId: '11111111-1111-1111-1111-111111111111' });

    expect(res.status).toBe(400);
  }, 30000); // Neon real via rede.
});
```

Se `loginComoAssessor` (helper já existente no arquivo) tiver a assinatura de papel restrita a `'ASSESSOR_RUA' | 'ASSESSOR_GABINETE'` (confira antes — a Task de referência mostrou exatamente essa assinatura), ajuste a própria função para aceitar também `'CHEFE'` em vez de usar o `as never` acima (que é só um jeito de não travar caso você não consiga editar o helper por algum motivo — prefira sempre a correção real: alargar o tipo do parâmetro `role` do helper).

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/integration/request.routes.test.ts`
Expected: FAIL — rotas ainda não existiam antes da Task 6 (nesse ponto do plano já existem; a falha aqui, se houver, deve ser por ajuste fino de asserção, não por rota ausente — se a Task 6 foi seguida corretamente, é esperado já começar passando; rode mesmo assim para confirmar).

- [ ] **Step 3: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/integration/request.routes.test.ts`
Expected: PASS (todos os testes já existentes + 10 novos).

- [ ] **Step 4: Rodar toda a suíte do backend**

Run: `cd backend && npm test && npm run typecheck`
Expected: tudo passando.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/integration/request.routes.test.ts
git commit -m "test(backend): cobertura de integracao para status, historico e reatribuicao"
```

---

## Task 8: Front-end — tipos e rótulos de status compartilhados

**Files:**
- Modify: `frontend/src/types/request.ts`
- Modify: `frontend/src/lib/request-status.ts`
- Modify: `frontend/src/app/painel/demandas/page.tsx` (troca o `STATUS_LABEL` local pelo importado — sem mudar comportamento)
- Test: nenhum (constantes e tipos puros; cobertos indiretamente pelos testes dos componentes das próximas tasks)

**Interfaces:**
- Produces: `HistoricoStatusItem` (tipo, em `types/request.ts`); `TRANSICOES_VALIDAS`, `STATUS_LABEL`, `exigeMotivo` (em `lib/request-status.ts`) — consumidos pelas Tasks 9-11.

- [ ] **Step 1: Tipo do histórico**

Adicione ao final de `frontend/src/types/request.ts`:

```ts
export interface HistoricoStatusItem {
  id: string;
  statusAnterior: RequestStatusValue | null;
  statusNovo: RequestStatusValue;
  usuarioId: string;
  usuarioNome: string;
  observacao: string | null;
  createdAt: string;
}
```

- [ ] **Step 2: Regras de transição e rótulos compartilhados**

`frontend/src/lib/request-status.ts` já existe (criado na Fase 2, só com `STATUS_ANTES_DE_PROTOCOLAR`). Adicione ao final:

```ts
export const TRANSICOES_VALIDAS: Record<RequestStatusValue, RequestStatusValue[]> = {
  RASCUNHO: [],
  ENVIADA: ['RECEBIDA', 'RECUSADA'],
  RECEBIDA: ['EM_CONFERENCIA', 'RECUSADA'],
  EM_CONFERENCIA: ['PENDENTE_INFORMACAO', 'PROTOCOLADA', 'RECUSADA'],
  PENDENTE_INFORMACAO: ['EM_CONFERENCIA', 'RECUSADA'],
  PROTOCOLADA: ['EM_ANDAMENTO'],
  EM_ANDAMENTO: ['CONCLUIDA'],
  CONCLUIDA: ['ARQUIVADA'],
  ARQUIVADA: [],
  RECUSADA: ['ARQUIVADA'],
};

const STATUS_QUE_EXIGEM_MOTIVO: readonly RequestStatusValue[] = ['PENDENTE_INFORMACAO', 'RECUSADA'];

export function exigeMotivo(novoStatus: RequestStatusValue): boolean {
  return (STATUS_QUE_EXIGEM_MOTIVO as RequestStatusValue[]).includes(novoStatus);
}

export const STATUS_LABEL: Record<RequestStatusValue, string> = {
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

export const ACAO_LABEL: Record<RequestStatusValue, string> = {
  RASCUNHO: '',
  ENVIADA: '',
  RECEBIDA: 'Marcar como recebida',
  EM_CONFERENCIA: 'Voltar para conferência',
  PENDENTE_INFORMACAO: 'Pedir informação',
  PROTOCOLADA: 'Protocolar',
  EM_ANDAMENTO: 'Marcar em andamento',
  CONCLUIDA: 'Concluir',
  ARQUIVADA: 'Arquivar',
  RECUSADA: 'Recusar',
};
```

`ACAO_LABEL` é o texto do botão de ação para chegar naquele status (diferente de `STATUS_LABEL`, que é o rótulo do status em si — ex: o botão para chegar em `RECEBIDA` diz "Marcar como recebida", mas a etiqueta do status já recebido diz só "Recebida").

Confira o topo do arquivo: se `RequestStatusValue` não estiver importado ainda em `lib/request-status.ts`, adicione:
```ts
import type { RequestStatusValue } from '@/types/request';
```

- [ ] **Step 3: Trocar o `STATUS_LABEL` duplicado em `demandas/page.tsx`**

Em `frontend/src/app/painel/demandas/page.tsx`, remova a constante `STATUS_LABEL` local (linhas 8-19) e adicione ao import já existente de `@/lib/request-status`:

```ts
import { STATUS_LABEL } from '@/lib/request-status';
```

(Se esse arquivo ainda não importar nada de `@/lib/request-status`, adicione a linha de import inteira. O resto do arquivo já usa `STATUS_LABEL[demanda.status]` — não precisa mudar mais nada ali.)

- [ ] **Step 4: Rodar a suíte do front-end**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: tudo passando, sem erros de tipo (o teste de `demandas/page.test.tsx` já existente continua verde, já que o valor de `STATUS_LABEL` não mudou, só a origem).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/request.ts frontend/src/lib/request-status.ts frontend/src/app/painel/demandas/page.tsx
git commit -m "feat(frontend): tipos e rotulos compartilhados do fluxo de status"
```

---

## Task 9: Front-end — componente de ações de status

**Files:**
- Create: `frontend/src/components/StatusActions.tsx`
- Test: `frontend/src/components/StatusActions.test.tsx`

**Interfaces:**
- Consumes: `apiClient`/`ApiError` (Fase 1); `TRANSICOES_VALIDAS`, `ACAO_LABEL`, `exigeMotivo` (Task 8); `RequestStatusValue` (Fase 2, já existe em `types/request.ts`).
- Produces: `<StatusActions demandaId={string} statusAtual={RequestStatusValue} onStatusAlterado={(demanda) => void} />` — consumido pela Task 12.

- [ ] **Step 1: Escrever o teste**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StatusActions } from './StatusActions';

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient } from '@/services/api-client';

beforeEach(() => {
  vi.mocked(apiClient.request).mockReset();
});

describe('StatusActions', () => {
  it('mostra um botão para cada transição válida do status atual', () => {
    render(<StatusActions demandaId="d1" statusAtual="EM_CONFERENCIA" onStatusAlterado={() => {}} />);

    expect(screen.getByRole('button', { name: 'Pedir informação' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Protocolar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recusar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Concluir' })).not.toBeInTheDocument();
  });

  it('não mostra nenhum botão quando o status não tem transições (ARQUIVADA)', () => {
    render(<StatusActions demandaId="d1" statusAtual="ARQUIVADA" onStatusAlterado={() => {}} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('chama a API direto para uma transição que não exige motivo', async () => {
    const onStatusAlterado = vi.fn();
    vi.mocked(apiClient.request).mockResolvedValueOnce({ id: 'd1', status: 'RECEBIDA' });
    render(<StatusActions demandaId="d1" statusAtual="ENVIADA" onStatusAlterado={onStatusAlterado} />);

    fireEvent.click(screen.getByRole('button', { name: 'Marcar como recebida' }));

    await waitFor(() => expect(onStatusAlterado).toHaveBeenCalledWith({ id: 'd1', status: 'RECEBIDA' }));
    expect(apiClient.request).toHaveBeenCalledWith('/demandas/d1/status', {
      method: 'PATCH',
      auth: true,
      body: { novoStatus: 'RECEBIDA', motivo: undefined },
    });
  });

  it('abre uma caixa de motivo para RECUSADA e só envia depois de confirmado', async () => {
    const onStatusAlterado = vi.fn();
    vi.mocked(apiClient.request).mockResolvedValueOnce({ id: 'd1', status: 'RECUSADA' });
    render(<StatusActions demandaId="d1" statusAtual="ENVIADA" onStatusAlterado={onStatusAlterado} />);

    fireEvent.click(screen.getByRole('button', { name: 'Recusar' }));
    expect(apiClient.request).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/motivo/i), { target: { value: 'Duplicado' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() => expect(onStatusAlterado).toHaveBeenCalled());
    expect(apiClient.request).toHaveBeenCalledWith('/demandas/d1/status', {
      method: 'PATCH',
      auth: true,
      body: { novoStatus: 'RECUSADA', motivo: 'Duplicado' },
    });
  });

  it('não confirma a transição com motivo se a caixa estiver vazia', async () => {
    render(<StatusActions demandaId="d1" statusAtual="ENVIADA" onStatusAlterado={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Recusar' }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    expect(apiClient.request).not.toHaveBeenCalled();
  });

  it('mostra erro quando a API rejeita', async () => {
    const { ApiError } = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
    vi.mocked(apiClient.request).mockRejectedValueOnce(new ApiError(400, 'Transição de status inválida'));
    render(<StatusActions demandaId="d1" statusAtual="ENVIADA" onStatusAlterado={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Marcar como recebida' }));

    expect(await screen.findByText('Transição de status inválida')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run src/components/StatusActions.test.tsx`
Expected: FAIL — `./StatusActions` não existe.

- [ ] **Step 3: Implementar**

```tsx
'use client';

import { useState } from 'react';
import { apiClient, ApiError } from '@/services/api-client';
import { TRANSICOES_VALIDAS, ACAO_LABEL, exigeMotivo } from '@/lib/request-status';
import type { RequestStatusValue } from '@/types/request';

interface StatusActionsProps {
  demandaId: string;
  statusAtual: RequestStatusValue;
  onStatusAlterado: (demanda: { id: string; status: RequestStatusValue }) => void;
}

export function StatusActions({ demandaId, statusAtual, onStatusAlterado }: StatusActionsProps) {
  const [transicaoPendente, setTransicaoPendente] = useState<RequestStatusValue | null>(null);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const transicoes = TRANSICOES_VALIDAS[statusAtual];

  async function confirmar(novoStatus: RequestStatusValue, motivoInformado?: string) {
    setErro(null);
    setEnviando(true);
    try {
      const demanda = await apiClient.request<{ id: string; status: RequestStatusValue }>(
        `/demandas/${demandaId}/status`,
        { method: 'PATCH', auth: true, body: { novoStatus, motivo: motivoInformado } },
      );
      setTransicaoPendente(null);
      setMotivo('');
      onStatusAlterado(demanda);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível mudar o status. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  function clicarAcao(novoStatus: RequestStatusValue) {
    if (exigeMotivo(novoStatus)) {
      setErro(null);
      setTransicaoPendente(novoStatus);
      return;
    }
    void confirmar(novoStatus);
  }

  function confirmarComMotivo() {
    if (!transicaoPendente || !motivo.trim()) return;
    void confirmar(transicaoPendente, motivo.trim());
  }

  if (transicoes.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {transicoes.map((novoStatus) => (
          <button
            key={novoStatus}
            type="button"
            disabled={enviando}
            onClick={() => clicarAcao(novoStatus)}
            className="rounded-xl bg-secondary px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ACAO_LABEL[novoStatus]}
          </button>
        ))}
      </div>

      {transicaoPendente && (
        <div className="flex flex-col gap-2 rounded-xl border border-gray-300 p-3">
          <label htmlFor="motivo-transicao" className="text-sm font-medium text-gray-700">
            Motivo
          </label>
          <textarea
            id="motivo-transicao"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={enviando || !motivo.trim()}
              onClick={confirmarComMotivo}
              className="rounded-xl bg-secondary px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Confirmar
            </button>
            <button
              type="button"
              disabled={enviando}
              onClick={() => {
                setTransicaoPendente(null);
                setMotivo('');
              }}
              className="rounded-xl border border-primary px-4 py-2 text-sm font-medium text-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {erro && <p className="text-sm text-red-600">{erro}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run src/components/StatusActions.test.tsx`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/StatusActions.tsx frontend/src/components/StatusActions.test.tsx
git commit -m "feat(frontend): componente de acoes de mudanca de status"
```

---

## Task 10: Front-end — linha do tempo do histórico de status

**Files:**
- Create: `frontend/src/components/HistoricoStatus.tsx`
- Test: `frontend/src/components/HistoricoStatus.test.tsx`

**Interfaces:**
- Consumes: `apiClient` (Fase 1); `STATUS_LABEL` (Task 8); `HistoricoStatusItem` (Task 8).
- Produces: `<HistoricoStatus demandaId={string} />` — consumido pela Task 12.

- [ ] **Step 1: Escrever o teste**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HistoricoStatus } from './HistoricoStatus';

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient } from '@/services/api-client';

beforeEach(() => {
  vi.mocked(apiClient.request).mockReset();
});

describe('HistoricoStatus', () => {
  it('lista cada mudança de status com quem fez e o motivo quando houver', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([
      {
        id: 'h2', statusAnterior: 'EM_CONFERENCIA', statusNovo: 'PENDENTE_INFORMACAO',
        usuarioId: 'u1', usuarioNome: 'Ana', observacao: 'Falta telefone', createdAt: '2026-09-02T10:00:00.000Z',
      },
      {
        id: 'h1', statusAnterior: 'RECEBIDA', statusNovo: 'EM_CONFERENCIA',
        usuarioId: 'u2', usuarioNome: 'Carlos', observacao: null, createdAt: '2026-09-01T10:00:00.000Z',
      },
    ]);

    render(<HistoricoStatus demandaId="d1" />);

    expect(await screen.findByText(/Ana/)).toBeInTheDocument();
    expect(screen.getByText(/Pendente de informação/)).toBeInTheDocument();
    expect(screen.getByText('Falta telefone')).toBeInTheDocument();
    expect(screen.getByText(/Em conferência/)).toBeInTheDocument();
  });

  it('mostra mensagem quando não há histórico ainda', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([]);
    render(<HistoricoStatus demandaId="d1" />);
    expect(await screen.findByText(/nenhuma mudança de status/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run src/components/HistoricoStatus.test.tsx`
Expected: FAIL — `./HistoricoStatus` não existe.

- [ ] **Step 3: Implementar**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/services/api-client';
import { STATUS_LABEL } from '@/lib/request-status';
import type { HistoricoStatusItem } from '@/types/request';

export function HistoricoStatus({ demandaId }: { demandaId: string }) {
  const [itens, setItens] = useState<HistoricoStatusItem[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    apiClient
      .request<HistoricoStatusItem[]>(`/demandas/${demandaId}/historico-status`, { auth: true })
      .then(setItens)
      .catch(() => setItens([]))
      .finally(() => setCarregando(false));
  }, [demandaId]);

  if (carregando) return <p className="text-sm text-gray-500">Carregando histórico…</p>;

  if (itens.length === 0) {
    return <p className="text-sm text-gray-500">Nenhuma mudança de status ainda.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {itens.map((item) => (
        <li key={item.id} className="rounded-xl border border-gray-200 p-3 text-sm">
          <p className="text-gray-900">
            <span className="font-medium">{item.usuarioNome}</span> mudou para{' '}
            <span className="font-medium">{STATUS_LABEL[item.statusNovo]}</span>
          </p>
          <p className="text-xs text-gray-500">{new Date(item.createdAt).toLocaleString('pt-BR')}</p>
          {item.observacao && <p className="mt-1 text-gray-700">{item.observacao}</p>}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run src/components/HistoricoStatus.test.tsx`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/HistoricoStatus.tsx frontend/src/components/HistoricoStatus.test.tsx
git commit -m "feat(frontend): linha do tempo do historico de status"
```

---

## Task 11: Front-end — reatribuir demanda (chefe)

**Files:**
- Create: `frontend/src/components/ReatribuirDemanda.tsx`
- Test: `frontend/src/components/ReatribuirDemanda.test.tsx`

**Interfaces:**
- Consumes: `apiClient`/`ApiError` (Fase 1); `PublicUser` (Fase 1, `@/types/auth`); `GET /usuarios` (Fase 1, já existe, só `CHEFE`).
- Produces: `<ReatribuirDemanda demandaId={string} assessorAtualId={string} onReatribuido={(demanda) => void} />` — consumido pela Task 12, renderizado só quando `user.role === 'CHEFE'`.

- [ ] **Step 1: Escrever o teste**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReatribuirDemanda } from './ReatribuirDemanda';

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient } from '@/services/api-client';

const usuarios = [
  { id: 'u1', nome: 'Ana', telefone: '+5534988880001', role: 'ASSESSOR_RUA', ativo: true, pinDefinido: true },
  { id: 'u2', nome: 'Bruno', telefone: '+5534988880002', role: 'ASSESSOR_GABINETE', ativo: true, pinDefinido: true },
];

beforeEach(() => {
  vi.mocked(apiClient.request).mockReset();
  vi.mocked(apiClient.request).mockResolvedValueOnce(usuarios);
});

describe('ReatribuirDemanda', () => {
  it('lista os assessores ativos, exceto o atual', async () => {
    render(<ReatribuirDemanda demandaId="d1" assessorAtualId="u1" onReatribuido={() => {}} />);

    expect(await screen.findByText('Bruno')).toBeInTheDocument();
    expect(screen.queryByText('Ana')).not.toBeInTheDocument();
  });

  it('reatribui ao escolher um assessor e confirmar', async () => {
    const onReatribuido = vi.fn();
    vi.mocked(apiClient.request).mockResolvedValueOnce({ id: 'd1', assessorResponsavelId: 'u2' });
    render(<ReatribuirDemanda demandaId="d1" assessorAtualId="u1" onReatribuido={onReatribuido} />);

    fireEvent.change(await screen.findByLabelText(/reatribuir/i), { target: { value: 'u2' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() => expect(onReatribuido).toHaveBeenCalledWith({ id: 'd1', assessorResponsavelId: 'u2' }));
    expect(apiClient.request).toHaveBeenLastCalledWith('/demandas/d1/reatribuir', {
      method: 'PATCH',
      auth: true,
      body: { novoAssessorId: 'u2' },
    });
  });

  it('mostra erro quando a API rejeita', async () => {
    const { ApiError } = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
    vi.mocked(apiClient.request).mockRejectedValueOnce(new ApiError(400, 'Assessor inválido ou inativo'));
    render(<ReatribuirDemanda demandaId="d1" assessorAtualId="u1" onReatribuido={() => {}} />);

    fireEvent.change(await screen.findByLabelText(/reatribuir/i), { target: { value: 'u2' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    expect(await screen.findByText('Assessor inválido ou inativo')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run src/components/ReatribuirDemanda.test.tsx`
Expected: FAIL — `./ReatribuirDemanda` não existe.

- [ ] **Step 3: Implementar**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { apiClient, ApiError } from '@/services/api-client';
import type { PublicUser } from '@/types/auth';

interface ReatribuirDemandaProps {
  demandaId: string;
  assessorAtualId: string;
  onReatribuido: (demanda: { id: string; assessorResponsavelId: string }) => void;
}

export function ReatribuirDemanda({ demandaId, assessorAtualId, onReatribuido }: ReatribuirDemandaProps) {
  const [assessores, setAssessores] = useState<PublicUser[]>([]);
  const [selecionadoId, setSelecionadoId] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    apiClient
      .request<PublicUser[]>('/usuarios?ativo=true', { auth: true })
      .then((lista) => setAssessores(lista.filter((u) => u.id !== assessorAtualId)))
      .catch(() => setAssessores([]));
  }, [assessorAtualId]);

  async function confirmar() {
    if (!selecionadoId) return;
    setErro(null);
    setEnviando(true);
    try {
      const demanda = await apiClient.request<{ id: string; assessorResponsavelId: string }>(
        `/demandas/${demandaId}/reatribuir`,
        { method: 'PATCH', auth: true, body: { novoAssessorId: selecionadoId } },
      );
      onReatribuido(demanda);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível reatribuir. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="reatribuir-assessor" className="text-xs font-medium text-gray-600">
        Reatribuir para
      </label>
      <select
        id="reatribuir-assessor"
        value={selecionadoId}
        onChange={(e) => setSelecionadoId(e.target.value)}
        className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="">Selecione um assessor</option>
        {assessores.map((assessor) => (
          <option key={assessor.id} value={assessor.id}>
            {assessor.nome}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!selecionadoId || enviando}
        onClick={confirmar}
        className="w-fit rounded-xl border border-primary px-4 py-2 text-sm font-medium text-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        Confirmar reatribuição
      </button>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run src/components/ReatribuirDemanda.test.tsx`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ReatribuirDemanda.tsx frontend/src/components/ReatribuirDemanda.test.tsx
git commit -m "feat(frontend): componente de reatribuicao de demanda para o chefe"
```

---

## Task 12: Front-end — integrar tudo na tela de detalhe

**Files:**
- Modify: `frontend/src/app/painel/demandas/[id]/page.tsx`
- Modify: `frontend/src/app/painel/demandas/[id]/page.test.tsx` (arquivo já existe — adicionar sem remover os testes existentes)

**Interfaces:**
- Consumes: `StatusActions` (Task 9), `HistoricoStatus` (Task 10), `ReatribuirDemanda` (Task 11).

- [ ] **Step 1: Escrever o teste**

Leia o arquivo de teste existente primeiro (já tem mocks de `next/navigation`, `next/link`, `@/hooks/use-auth`, `@/services/api-client`, e a função `demandaFake(overrides)`). Adicione aos mocks já existentes:

```tsx
vi.mock('@/components/StatusActions', () => ({
  StatusActions: ({ statusAtual }: { statusAtual: string }) => <div>Ações de status ({statusAtual})</div>,
}));
vi.mock('@/components/HistoricoStatus', () => ({
  HistoricoStatus: () => <div>Histórico de status</div>,
}));
vi.mock('@/components/ReatribuirDemanda', () => ({
  ReatribuirDemanda: () => <div>Reatribuir demanda</div>,
}));
```

Adicione estes casos ao `describe('DemandaDetalhePage', ...)` já existente:

```tsx
  it('mostra as ações de status e o histórico para gabinete', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'gabinete-1', role: 'ASSESSOR_GABINETE' } });
    vi.mocked(apiClient.request).mockResolvedValueOnce(demandaFake());

    render(<DemandaDetalhePage />);

    expect(await screen.findByText(/Ações de status/)).toBeInTheDocument();
    expect(screen.getByText('Histórico de status')).toBeInTheDocument();
  });

  it('não mostra ações de status para assessor de rua', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'user-dono', role: 'ASSESSOR_RUA' } });
    vi.mocked(apiClient.request).mockResolvedValueOnce(demandaFake());

    render(<DemandaDetalhePage />);
    await screen.findByText('Buraco na rua');

    expect(screen.queryByText(/Ações de status/)).not.toBeInTheDocument();
    expect(screen.getByText('Histórico de status')).toBeInTheDocument();
  });

  it('mostra reatribuir só para o chefe', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'chefe-1', role: 'CHEFE' } });
    vi.mocked(apiClient.request).mockResolvedValueOnce(demandaFake());

    render(<DemandaDetalhePage />);

    expect(await screen.findByText('Reatribuir demanda')).toBeInTheDocument();
  });

  it('não mostra reatribuir para gabinete', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'gabinete-1', role: 'ASSESSOR_GABINETE' } });
    vi.mocked(apiClient.request).mockResolvedValueOnce(demandaFake());

    render(<DemandaDetalhePage />);
    await screen.findByText('Buraco na rua');

    expect(screen.queryByText('Reatribuir demanda')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run "src/app/painel/demandas/[id]/page.test.tsx"`
Expected: FAIL — a página ainda não renderiza `StatusActions`/`HistoricoStatus`/`ReatribuirDemanda`.

- [ ] **Step 3: Implementar**

Em `frontend/src/app/painel/demandas/[id]/page.tsx`, adicione aos imports:

```tsx
import { StatusActions } from '@/components/StatusActions';
import { HistoricoStatus } from '@/components/HistoricoStatus';
import { ReatribuirDemanda } from '@/components/ReatribuirDemanda';
```

O componente já tem `podeEditar` calculado a partir de `user?.role`. Adicione, logo abaixo dessa constante:

```tsx
  const podeMudarStatus = user?.role === 'ASSESSOR_GABINETE' || user?.role === 'CHEFE';
  const ehChefe = user?.role === 'CHEFE';
```

No JSX, depois do bloco `<div>` de "Assessor responsável" (último bloco antes do `</div>` de fechamento do container principal) e antes do fechamento do componente, adicione:

```tsx
      {podeMudarStatus && (
        <StatusActions
          demandaId={demanda.id}
          statusAtual={demanda.status}
          onStatusAlterado={(atualizado) => setDemanda({ ...demanda, status: atualizado.status })}
        />
      )}

      {ehChefe && (
        <ReatribuirDemanda
          demandaId={demanda.id}
          assessorAtualId={demanda.assessorResponsavelId}
          onReatribuido={(atualizado) =>
            setDemanda({ ...demanda, assessorResponsavelId: atualizado.assessorResponsavelId })
          }
        />
      )}

      <div>
        <p className="text-xs font-medium text-gray-600">Histórico</p>
        <HistoricoStatus demandaId={demanda.id} />
      </div>
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run "src/app/painel/demandas/[id]/page.test.tsx"`
Expected: PASS (todos os testes já existentes + 4 novos).

- [ ] **Step 5: Rodar toda a suíte do front-end**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: tudo passando.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/painel/demandas/\[id\]/page.tsx "frontend/src/app/painel/demandas/[id]/page.test.tsx"
git commit -m "feat(frontend): integra acoes de status, historico e reatribuicao na tela de detalhe"
```

---

## Task 13: Front-end — filtro por status na listagem

**Files:**
- Modify: `frontend/src/app/painel/demandas/page.tsx`
- Modify: `frontend/src/app/painel/demandas/page.test.tsx` (arquivo já existe — adicionar sem remover os testes existentes)

**Interfaces:**
- Consumes: `STATUS_LABEL` (Task 8, já importado nesta página desde a Task 8).

- [ ] **Step 1: Escrever o teste**

Adicione ao `describe('DemandasPage', ...)` já existente:

```tsx
  it('refaz a busca quando o filtro de status muda', async () => {
    vi.mocked(apiClient.request).mockResolvedValue({ items: [], total: 0, pagina: 1, tamanhoPagina: 20 });

    render(<DemandasPage />);
    await waitFor(() => expect(apiClient.request).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'RECEBIDA' } });

    await waitFor(() => expect(apiClient.request).toHaveBeenCalledTimes(2));
    const [url] = vi.mocked(apiClient.request).mock.calls[1]!;
    expect(url).toContain('status=RECEBIDA');
  });
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run src/app/painel/demandas/page.test.tsx`
Expected: FAIL — não existe campo com label "status" na página ainda.

- [ ] **Step 3: Implementar**

Em `frontend/src/app/painel/demandas/page.tsx`, adicione um estado novo junto de `bairro`/`bairroBuscado`:

```tsx
  const [status, setStatus] = useState('');
```

No `useEffect` que monta os `params` e busca a API, adicione:

```tsx
    if (status) params.set('status', status);
```

(na lista de dependências do `useEffect`, adicione `status` junto de `pagina, bairroBuscado`.)

No JSX, logo depois do `<div className="max-w-xs">` do filtro de bairro, adicione:

```tsx
      <div className="max-w-xs">
        <label htmlFor="filtro-status" className="text-xs font-medium text-gray-600">
          Status
        </label>
        <select
          id="filtro-status"
          value={status}
          onChange={(e) => {
            setPagina(1);
            setStatus(e.target.value);
          }}
          className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">Todos</option>
          {Object.entries(STATUS_LABEL).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </select>
      </div>
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run src/app/painel/demandas/page.test.tsx`
Expected: PASS (todos os testes já existentes + 1 novo).

- [ ] **Step 5: Rodar toda a suíte do front-end, o build de produção, e a suíte completa do backend**

Run: `cd frontend && npx vitest run && npx tsc --noEmit && npm run build`
Expected: tudo passando, build conclui sem erros.

Run: `cd backend && npm test && npm run typecheck`
Expected: tudo passando (garantia de que nada quebrou nesta fase).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/painel/demandas/page.tsx frontend/src/app/painel/demandas/page.test.tsx
git commit -m "feat(frontend): filtro por status na listagem de demandas"
```
