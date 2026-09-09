# Fase 3 (parte 3) — Dashboard do Chefe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O chefe abre `/painel/dashboard` e vê, numa tela só: quantas demandas há em cada status, por bairro e por assessor responsável (em aberto), quais estão paradas há 2+ dias, e um relatório mensal de quantas demandas cada assessor de rua enviou (por status), sempre atribuído a quem criou a demanda, mesmo que ela tenha sido reatribuída depois.

**Architecture:** Mesmo padrão repository → service → controller → route das fases anteriores, com um `DashboardRepository`/`DashboardService`/router novos e isolados (não cresce `request.repository.ts`, que já é grande). Depende de um campo novo e permanente no schema (`Request.criadoPorId`) que precisa de uma migração em duas etapas (coluna opcional → backfill dos dados já existentes → coluna obrigatória) para não atribuir errado nenhuma demanda já reatribuída antes desta fase.

**Tech Stack:** Mesmo da Fase 3 partes 1-2 — Express, TypeScript, Prisma, Zod; Next.js, React, Tailwind (mesmos componentes/tokens já existentes, nenhum novo).

## Global Constraints

- Toda a funcionalidade desta fase (rotas de API e a página `/painel/dashboard`) é exclusiva de `CHEFE` — 403 para `ASSESSOR_GABINETE` e `ASSESSOR_RUA` em qualquer rota nova; a página nem aparece no menu para os demais papéis.
- "Em aberto" = status fora de `CONCLUIDA`, `ARQUIVADA`, `RECUSADA`.
- Bloco de status conta **todas** as demandas (inclusive finalizadas); bloco de bairro e de carga por assessor contam **só as em aberto**.
- "Demanda parada" = em aberto, e a mudança de status mais recente (`RequestStatusHistory` mais novo daquela demanda, ou a própria data de criação quando não há nenhum) foi há 2 dias ou mais.
- O relatório mensal de produtividade conta demandas por **quem criou** (`criadoPorId`), nunca por quem é o responsável atual — esse campo é preenchido uma vez na criação e nunca muda, mesmo com reatribuição. Só aparecem `ASSESSOR_RUA` ativos, mesmo os que não criaram nenhuma demanda no mês (aparecem com zero em tudo).
- Interface 100% em português do Brasil; sem comentários no código a não ser para documentar um porquê não óbvio.
- Toda regra de permissão é aplicada no backend, nunca só escondida no front-end.

---

## Task 1: Schema — campo `criadoPorId` (etapa opcional)

**Files:**
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Produces: `Request.criadoPorId: String | null` (por enquanto opcional) — consumido pela Task 2 (backfill) e Task 3 (gravação na criação).

- [ ] **Step 1: Adicionar o campo opcional e a relação no `model Request`**

Localize o `model Request` (por volta da linha 108) e adicione `criadoPorId`/`criadoPor` logo depois de `assessorResponsavel` (mantendo tudo o que já existe):

```prisma
  criadoPorId            String?
  criadoPor              User?         @relation("RequestCriadoPor", fields: [criadoPorId], references: [id])
```

- [ ] **Step 2: Adicionar a relação reversa no `model User`**

Localize o `model User` (por volta da linha 30) e adicione, junto das demais relações já existentes:

```prisma
  demandasCriadas      Request[]               @relation("RequestCriadoPor")
```

- [ ] **Step 3: Gerar e aplicar a migração**

Run (a partir de `backend/`, contra o banco `production`/dev do Neon já configurado em `.env`):
```bash
npx prisma migrate dev --name add_criado_por_id_opcional
```
Expected: cria uma nova pasta em `prisma/migrations/`, aplica no Neon dev, regenera o Prisma Client sem erros. A coluna nasce `NULL` para toda linha já existente — isso é esperado e será corrigido na Task 2.

- [ ] **Step 4: Confirmar que o typecheck do backend continua limpo**

Run: `npm run typecheck` (a partir de `backend/`)
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(backend): adiciona criadoPorId opcional a demanda"
```

---

## Task 2: Backfill de `criadoPorId` e migração final (coluna obrigatória)

**Files:**
- Create: `backend/prisma/backfill-criado-por-id.ts`
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Consumes: `Request.criadoPorId` (Task 1, ainda opcional).
- Produces: `Request.criadoPorId: String` (obrigatório a partir desta task) — consumido pela Task 3.

Esta task não tem ciclo de teste próprio (é uma migração de dados rodada uma única vez) — a Task 4 e a Task 6 cobrem o resultado com testes de integração.

- [ ] **Step 1: Escrever o script de backfill**

Crie `backend/prisma/backfill-criado-por-id.ts`:

```ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const demandas = await prisma.request.findMany({
    where: { criadoPorId: null },
    select: { id: true, assessorResponsavelId: true },
  });

  console.log(`${demandas.length} demanda(s) sem criadoPorId encontradas.`);

  let atualizadas = 0;
  for (const demanda of demandas) {
    const primeiraReatribuicao = await prisma.requestReassignmentHistory.findFirst({
      where: { requestId: demanda.id },
      orderBy: { createdAt: 'asc' },
      select: { assessorAnteriorId: true },
    });

    const criadoPorId = primeiraReatribuicao?.assessorAnteriorId ?? demanda.assessorResponsavelId;

    await prisma.request.update({
      where: { id: demanda.id },
      data: { criadoPorId },
    });
    atualizadas++;
  }

  console.log(`${atualizadas} demanda(s) atualizadas.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (erro) => {
    console.error(erro);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 2: Rodar o backfill contra o banco de dev**

Run (a partir de `backend/`): `npx tsx prisma/backfill-criado-por-id.ts`
Expected: imprime quantas demandas foram encontradas e atualizadas (pode ser zero, se não houver nenhuma demanda ainda no banco de dev — tudo bem, o script só não faz nada nesse caso).

- [ ] **Step 3: Rodar o mesmo backfill contra o banco de teste**

O banco de teste (`.env.test`) é uma branch Neon separada — o backfill de dev não alcança ele. Run com as variáveis de ambiente do arquivo de teste (ajuste conforme o shell — no PowerShell/bash, carregue `.env.test` antes, ou rode diretamente com as variáveis exportadas):
```bash
cd backend && DATABASE_URL="$(grep DATABASE_URL .env.test | cut -d= -f2- | tr -d '\"')" DIRECT_URL="$(grep DIRECT_URL .env.test | cut -d= -f2- | tr -d '\"')" npx tsx prisma/backfill-criado-por-id.ts
```
Expected: mesma saída, contra o banco de teste. Se o comando acima não funcionar no seu shell, carregue `.env.test` manualmente e rode `npx tsx prisma/backfill-criado-por-id.ts` normalmente — o objetivo é só garantir que as variáveis de ambiente apontem para o banco de teste nessa execução específica.

- [ ] **Step 4: Confirmar que não sobrou nenhuma linha com `criadoPorId` nulo**

Run (a partir de `backend/`, contra o banco de dev): um `node -e` rápido ou uma query direta confirmando `SELECT COUNT(*) FROM requests WHERE "criadoPorId" IS NULL` retorna 0. Repita contra o banco de teste. Se algum banco ainda tiver linhas nulas, o Step 5 (tornar a coluna obrigatória) vai falhar — não prossiga até confirmar zero.

- [ ] **Step 5: Tornar a coluna obrigatória**

Em `backend/prisma/schema.prisma`, altere o campo adicionado na Task 1:

```prisma
  criadoPorId            String
  criadoPor              User          @relation("RequestCriadoPor", fields: [criadoPorId], references: [id])
```

(Removendo os dois `?` — o resto da linha continua igual.)

Run:
```bash
npx prisma migrate dev --name torna_criado_por_id_obrigatorio
```
Expected: cria uma nova migração alterando a coluna para `NOT NULL`, aplica sem erro no Neon dev (só funciona se o Step 4 já confirmou zero linhas nulas nesse banco).

- [ ] **Step 6: Aplicar a mesma migração no banco de teste**

Run (a partir de `backend/`, com as variáveis de ambiente apontando para `.env.test`, mesmo padrão do Step 3):
```bash
npx prisma migrate deploy
```
Expected: aplica as migrações pendentes (incluindo a desta task) no banco de teste sem erro.

- [ ] **Step 7: Rodar a suíte completa do backend**

Run: `cd backend && npm test && npm run typecheck`
Expected: tudo passando (nenhum código ainda usa `criadoPorId` como obrigatório — só o schema mudou; a Task 3 é quem começa a gravá-lo na criação).

- [ ] **Step 8: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations backend/prisma/backfill-criado-por-id.ts
git commit -m "feat(backend): backfill e torna criadoPorId obrigatorio"
```

---

## Task 3: Repositórios — gravar `criadoPorId` e filtrar usuários por papel

**Files:**
- Modify: `backend/src/repositories/request.repository.ts`
- Modify: `backend/src/repositories/user.repository.ts`
- Modify: `backend/tests/integration/request.repository.test.ts` (arquivo já existe — adicionar sem remover os testes existentes)
- Modify: `backend/tests/integration/repositories.test.ts` (arquivo já existe — adicionar sem remover os testes existentes, é onde os testes de `UserRepository` já vivem)

**Interfaces:**
- Produces: `RequestRepository.create()` agora grava `criadoPorId` (mesmo valor de `assessorResponsavelId` no momento da criação); `UserRepository.list(filter?: { ativo?: boolean; role?: UserRoleValue })` — consumidos pela Task 5 (repositório do dashboard).

- [ ] **Step 1: Escrever os testes**

Adicione ao final de `backend/tests/integration/request.repository.test.ts` (reusando `inputBase`, `fotoBase`, `assessorId`, `requestRepo`, `prisma` já existentes no topo do arquivo):

```ts
describe('RequestRepository.create — criadoPorId', () => {
  it('grava criadoPorId igual a assessorResponsavelId no momento da criação', async () => {
    const criado = await requestRepo.create(inputBase({ codigoInterno: 'GD-criador-1' }), [fotoBase]);

    const linha = await prisma.request.findUniqueOrThrow({ where: { id: criado.id } });
    expect(linha.criadoPorId).toBe(assessorId);
  });

  it('criadoPorId não muda depois de uma reatribuição', async () => {
    const criado = await requestRepo.create(inputBase({ codigoInterno: 'GD-criador-2' }), [fotoBase]);
    const novoAssessor = await prisma.user.create({
      data: { nome: 'Novo Assessor', telefone: '+5534999996500', role: 'ASSESSOR_GABINETE' },
    });

    await requestRepo.reatribuir(criado.id, novoAssessor.id, novoAssessor.id);

    const linha = await prisma.request.findUniqueOrThrow({ where: { id: criado.id } });
    expect(linha.criadoPorId).toBe(assessorId);
    expect(linha.assessorResponsavelId).toBe(novoAssessor.id);
  });
});
```

Adicione ao final de `backend/tests/integration/repositories.test.ts`, dentro (ou logo após) do `describe('UserRepository', ...)` já existente — leia o arquivo primeiro para confirmar como os usuários de teste já são criados nesse arquivo e reaproveite o mesmo padrão:

```ts
describe('UserRepository.list — filtro por papel', () => {
  it('filtra só por role quando informado', async () => {
    await userRepo.create({ nome: 'Rua Um', telefone: '+5534999996600', role: 'ASSESSOR_RUA' });
    await userRepo.create({ nome: 'Gabinete Um', telefone: '+5534999996601', role: 'ASSESSOR_GABINETE' });

    const resultado = await userRepo.list({ role: 'ASSESSOR_RUA' });

    expect(resultado.every((u) => u.role === 'ASSESSOR_RUA')).toBe(true);
    expect(resultado.some((u) => u.nome === 'Rua Um')).toBe(true);
    expect(resultado.some((u) => u.nome === 'Gabinete Um')).toBe(false);
  });

  it('combina filtro de role com filtro de ativo', async () => {
    const criado = await userRepo.create({ nome: 'Rua Inativo', telefone: '+5534999996602', role: 'ASSESSOR_RUA' });
    await userRepo.setAtivo(criado.id, false);
    await userRepo.create({ nome: 'Rua Ativo', telefone: '+5534999996603', role: 'ASSESSOR_RUA' });

    const resultado = await userRepo.list({ role: 'ASSESSOR_RUA', ativo: true });

    expect(resultado.some((u) => u.nome === 'Rua Ativo')).toBe(true);
    expect(resultado.some((u) => u.nome === 'Rua Inativo')).toBe(false);
  });
});
```

(Ajuste o nome da variável do repositório — `userRepo` — para o que o arquivo já usa, se for diferente; leia o arquivo antes de escrever.)

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/integration/request.repository.test.ts tests/integration/repositories.test.ts`
Expected: FAIL — `criadoPorId` continua `null` (Step 3 ainda não grava), e `UserRepository.list` ainda não aceita `role`.

- [ ] **Step 3: Implementar**

Em `backend/src/repositories/request.repository.ts`, no `CriarRequestInput`, adicione o campo (depois de `assessorResponsavelId`):

```ts
  criadoPorId: string;
```

No método `create()`, adicione `criadoPorId: input.criadoPorId` ao objeto `data` do `prisma.request.create` (junto de `assessorResponsavelId: input.assessorResponsavelId`).

Em `backend/src/repositories/user.repository.ts`, atualize a assinatura de `list` na interface `UserRepository`:

```ts
  list(filter?: { ativo?: boolean; role?: UserRoleValue }): Promise<PublicUser[]>;
```

E a implementação:

```ts
    async list(filter) {
      const users = await prisma.user.findMany({
        where: {
          ...(filter?.ativo === undefined ? {} : { ativo: filter.ativo }),
          ...(filter?.role === undefined ? {} : { role: filter.role }),
        },
        orderBy: { nome: 'asc' },
      });
      return users.map(toPublicUser);
    },
```

- [ ] **Step 4: Ajustar quem chama `RequestRepository.create` para passar `criadoPorId`**

`RequestService.criar()` (em `backend/src/services/request.service.ts`) monta o objeto passado para `requestRepo.create` — localize onde `assessorResponsavelId: input.assessorResponsavelId` é passado e adicione `criadoPorId: input.assessorResponsavelId` logo ao lado (mesmo valor — no momento da criação, quem cria é sempre o responsável inicial).

Como `CriarRequestInput` da Task 3 agora exige `criadoPorId`, confirme que o typecheck do backend acusaria isso se você esquecesse este passo — rode o Step 6 abaixo para garantir.

- [ ] **Step 5: Estender o fake de `RequestRepository` (Task 5 do dashboard vai precisar de dados reais, mas os testes unitários de `RequestService` que já existem quebram sem isso)**

Em `backend/tests/helpers/fakes.ts`, dentro de `createFakeRequestRepo`, o objeto `detalhe` montado em `create()` não expõe `criadoPorId` hoje porque `RequestDetail` não tinha esse campo. Adicione `criadoPorId: string` a `RequestSummary` (em `backend/src/repositories/request.repository.ts`, já que `RequestDetail extends RequestSummary`) e ao `toDetail()` do mesmo arquivo (`criadoPorId: row.criadoPorId`), e ao objeto `detalhe` dentro do fake em `fakes.ts` (`criadoPorId: input.criadoPorId`). Isso é necessário porque os testes unitários existentes de `RequestService.criar` (Fase 2) chamam `requestRepo.create` através do fake — sem este campo no tipo e no fake, o typecheck quebra.

- [ ] **Step 6: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/integration/request.repository.test.ts tests/integration/repositories.test.ts && npm run typecheck`
Expected: PASS (todos os testes já existentes + os 4 novos), typecheck limpo.

- [ ] **Step 7: Rodar toda a suíte do backend**

Run: `cd backend && npm test`
Expected: tudo passando (os testes de `RequestService.criar` da Fase 2, que usam o fake, continuam passando com o campo novo).

- [ ] **Step 8: Commit**

```bash
git add backend/src/repositories/request.repository.ts backend/src/repositories/user.repository.ts backend/src/services/request.service.ts backend/tests/helpers/fakes.ts backend/tests/integration/request.repository.test.ts backend/tests/integration/repositories.test.ts
git commit -m "feat(backend): grava criadoPorId na criacao e filtro de papel em UserRepository.list"
```

---

## Task 4: Repositório do dashboard — resumo (status, bairro, carga, paradas)

**Files:**
- Create: `backend/src/repositories/dashboard.repository.ts`
- Test: `backend/tests/integration/dashboard.repository.test.ts`

**Interfaces:**
- Consumes: `RequestStatusValue` (já existe); tabelas `Request`/`RequestStatusHistory` já populadas pela Task 3.
- Produces: `DashboardRepository.resumo()`, tipos `ResumoDashboard`, `ContagemStatus`, `ContagemBairro`, `ContagemAssessor`, `DemandaParada` — consumidos pela Task 6 (service).

- [ ] **Step 1: Escrever o teste**

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createDashboardRepository } from '../../src/repositories/dashboard.repository.js';
import { createRequestRepository, type CriarRequestInput } from '../../src/repositories/request.repository.js';

const prisma = new PrismaClient();
const dashboardRepo = createDashboardRepository(prisma);
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
    data: { nome: 'Assessor Teste', telefone: '+5534999995100', role: 'ASSESSOR_RUA' },
  });
  assessorId = assessor.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

function inputBase(overrides: Partial<CriarRequestInput> = {}): CriarRequestInput {
  return {
    codigoInterno: 'GD-dash-0001',
    solicitanteNome: 'Maria Solicitante',
    solicitanteTelefone: '+5534999990000',
    tituloResumido: 'Buraco na rua',
    descricao: 'Buraco grande',
    requestTypeId: tipoId,
    assessorResponsavelId: assessorId,
    criadoPorId: assessorId,
    autorizacaoDados: true,
    bairro: 'Centro',
    ...overrides,
  };
}

const fotoBase = { url: 'https://cdn.example/a.jpg', publicId: 'a', larguraPx: 800, alturaPx: 600, bytes: 12345 };

describe('DashboardRepository.resumo — status', () => {
  it('conta todas as demandas por status, inclusive finalizadas', async () => {
    const d1 = await requestRepo.create(inputBase({ codigoInterno: 'GD-dash-1' }), [fotoBase]);
    await requestRepo.create(inputBase({ codigoInterno: 'GD-dash-2' }), [fotoBase]);
    await requestRepo.updateStatus(d1.id, 'RECEBIDA', assessorId);

    const resumo = await dashboardRepo.resumo();

    const enviada = resumo.porStatus.find((s) => s.status === 'ENVIADA');
    const recebida = resumo.porStatus.find((s) => s.status === 'RECEBIDA');
    expect(enviada?.quantidade).toBe(1);
    expect(recebida?.quantidade).toBe(1);
  }, 20000);
});

describe('DashboardRepository.resumo — bairro e carga por assessor', () => {
  it('conta só demandas em aberto, agrupadas por bairro e por assessor', async () => {
    const outroAssessor = await prisma.user.create({
      data: { nome: 'Outro Assessor', telefone: '+5534999995200', role: 'ASSESSOR_RUA' },
    });
    const aberta = await requestRepo.create(
      inputBase({ codigoInterno: 'GD-dash-3', bairro: 'Vila Nova', assessorResponsavelId: outroAssessor.id, criadoPorId: outroAssessor.id }),
      [fotoBase],
    );
    const finalizada = await requestRepo.create(inputBase({ codigoInterno: 'GD-dash-4', bairro: 'Vila Nova' }), [fotoBase]);
    await requestRepo.updateStatus(finalizada.id, 'RECEBIDA', assessorId);
    await requestRepo.updateStatus(finalizada.id, 'EM_CONFERENCIA', assessorId);
    await requestRepo.updateStatus(finalizada.id, 'PROTOCOLADA', assessorId);
    await requestRepo.updateStatus(finalizada.id, 'EM_ANDAMENTO', assessorId);
    await requestRepo.updateStatus(finalizada.id, 'CONCLUIDA', assessorId);

    const resumo = await dashboardRepo.resumo();

    const vilaNova = resumo.porBairro.find((b) => b.bairro === 'Vila Nova');
    expect(vilaNova?.quantidade).toBe(1); // só a `aberta`, a `finalizada` está CONCLUIDA
    const cargaOutroAssessor = resumo.porAssessor.find((a) => a.assessorId === outroAssessor.id);
    expect(cargaOutroAssessor?.quantidade).toBe(1);
    const vilaNovaComFinalizada = resumo.porBairro.find((b) => b.bairro === 'Vila Nova');
    expect(vilaNovaComFinalizada?.quantidade).not.toBe(2); // a finalizada não deve ser contada
    expect(aberta.bairro).toBe('Vila Nova');
  }, 30000);
});

describe('DashboardRepository.resumo — demandas paradas', () => {
  it('lista demandas em aberto sem mudança de status há 2+ dias, usando createdAt quando nunca mudou', async () => {
    const antiga = await requestRepo.create(inputBase({ codigoInterno: 'GD-dash-5' }), [fotoBase]);
    await prisma.request.update({
      where: { id: antiga.id },
      data: { createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
    });
    await requestRepo.create(inputBase({ codigoInterno: 'GD-dash-6' }), [fotoBase]);

    const resumo = await dashboardRepo.resumo();

    const parada = resumo.paradas.find((p) => p.codigoInterno === 'GD-dash-5');
    const recente = resumo.paradas.find((p) => p.codigoInterno === 'GD-dash-6');
    expect(parada).toBeTruthy();
    expect(parada?.diasParada).toBeGreaterThanOrEqual(5);
    expect(recente).toBeUndefined();
  }, 20000);

  it('usa a data da mudança de status mais recente quando existe histórico', async () => {
    const demanda = await requestRepo.create(inputBase({ codigoInterno: 'GD-dash-7' }), [fotoBase]);
    await prisma.request.update({
      where: { id: demanda.id },
      data: { createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
    });
    await requestRepo.updateStatus(demanda.id, 'RECEBIDA', assessorId);
    await prisma.requestStatusHistory.updateMany({
      where: { requestId: demanda.id },
      data: { createdAt: new Date() },
    });

    const resumo = await dashboardRepo.resumo();

    const item = resumo.paradas.find((p) => p.codigoInterno === 'GD-dash-7');
    expect(item).toBeUndefined(); // mudou de status agora, não está parada
  }, 20000);

  it('não inclui demandas finalizadas mesmo se antigas', async () => {
    const demanda = await requestRepo.create(inputBase({ codigoInterno: 'GD-dash-8' }), [fotoBase]);
    await prisma.request.update({
      where: { id: demanda.id },
      data: { createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    });
    await requestRepo.updateStatus(demanda.id, 'RECUSADA', assessorId, 'Duplicado');

    const resumo = await dashboardRepo.resumo();

    expect(resumo.paradas.find((p) => p.codigoInterno === 'GD-dash-8')).toBeUndefined();
  }, 20000);
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/integration/dashboard.repository.test.ts`
Expected: FAIL — `../../src/repositories/dashboard.repository.js` não existe.

- [ ] **Step 3: Implementar**

Crie `backend/src/repositories/dashboard.repository.ts`:

```ts
import type { PrismaClient } from '@prisma/client';
import type { RequestStatusValue } from '../utils/request-status.js';

const STATUS_FINALIZADOS: readonly RequestStatusValue[] = ['CONCLUIDA', 'ARQUIVADA', 'RECUSADA'];
const TODOS_STATUS: readonly RequestStatusValue[] = [
  'RASCUNHO', 'ENVIADA', 'RECEBIDA', 'EM_CONFERENCIA', 'PENDENTE_INFORMACAO',
  'PROTOCOLADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'ARQUIVADA', 'RECUSADA',
];
const DIAS_PARA_CONSIDERAR_PARADA = 2;

export interface ContagemStatus {
  status: RequestStatusValue;
  quantidade: number;
}

export interface ContagemBairro {
  bairro: string;
  quantidade: number;
}

export interface ContagemAssessor {
  assessorId: string;
  assessorNome: string;
  quantidade: number;
}

export interface DemandaParada {
  id: string;
  codigoInterno: string;
  tituloResumido: string;
  assessorResponsavelNome: string;
  status: RequestStatusValue;
  diasParada: number;
}

export interface ResumoDashboard {
  porStatus: ContagemStatus[];
  porBairro: ContagemBairro[];
  porAssessor: ContagemAssessor[];
  paradas: DemandaParada[];
}

export interface DashboardRepository {
  resumo(): Promise<ResumoDashboard>;
}

export function createDashboardRepository(prisma: PrismaClient): DashboardRepository {
  return {
    async resumo() {
      const [porStatusRaw, abertas] = await Promise.all([
        prisma.request.groupBy({ by: ['status'], _count: true }),
        prisma.request.findMany({
          where: { status: { notIn: STATUS_FINALIZADOS as RequestStatusValue[] } },
          select: {
            id: true,
            codigoInterno: true,
            tituloResumido: true,
            bairro: true,
            status: true,
            createdAt: true,
            assessorResponsavelId: true,
            assessorResponsavel: { select: { nome: true } },
            historico: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
          },
        }),
      ]);

      const porStatus: ContagemStatus[] = TODOS_STATUS.map((status) => ({
        status,
        quantidade: porStatusRaw.find((r) => r.status === status)?._count ?? 0,
      }));

      const bairroMap = new Map<string, number>();
      const assessorMap = new Map<string, { nome: string; quantidade: number }>();
      const paradas: DemandaParada[] = [];
      const agora = Date.now();

      for (const demanda of abertas) {
        const bairro = demanda.bairro ?? 'Sem bairro';
        bairroMap.set(bairro, (bairroMap.get(bairro) ?? 0) + 1);

        const atual = assessorMap.get(demanda.assessorResponsavelId);
        assessorMap.set(demanda.assessorResponsavelId, {
          nome: demanda.assessorResponsavel.nome,
          quantidade: (atual?.quantidade ?? 0) + 1,
        });

        const dataReferencia = demanda.historico[0]?.createdAt ?? demanda.createdAt;
        const diasParada = Math.floor((agora - dataReferencia.getTime()) / (24 * 60 * 60 * 1000));
        if (diasParada >= DIAS_PARA_CONSIDERAR_PARADA) {
          paradas.push({
            id: demanda.id,
            codigoInterno: demanda.codigoInterno,
            tituloResumido: demanda.tituloResumido,
            assessorResponsavelNome: demanda.assessorResponsavel.nome,
            status: demanda.status as RequestStatusValue,
            diasParada,
          });
        }
      }

      return {
        porStatus,
        porBairro: Array.from(bairroMap.entries()).map(([bairro, quantidade]) => ({ bairro, quantidade })),
        porAssessor: Array.from(assessorMap.entries()).map(([assessorId, v]) => ({
          assessorId,
          assessorNome: v.nome,
          quantidade: v.quantidade,
        })),
        paradas: paradas.sort((a, b) => b.diasParada - a.diasParada),
      };
    },
  };
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/integration/dashboard.repository.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Rodar o typecheck**

Run: `cd backend && npm run typecheck`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add backend/src/repositories/dashboard.repository.ts backend/tests/integration/dashboard.repository.test.ts
git commit -m "feat(backend): repositorio do resumo do dashboard"
```

---

## Task 5: Repositório do dashboard — produtividade dos assessores de rua

**Files:**
- Modify: `backend/src/repositories/dashboard.repository.ts`
- Modify: `backend/tests/integration/dashboard.repository.test.ts` (arquivo criado na Task 4 — adicionar sem remover os testes existentes)

**Interfaces:**
- Consumes: `UserRepository.list({ role, ativo })` (Task 3).
- Produces: `DashboardRepository.produtividadeAssessores(mesInicio, mesFim)`, tipo `ProdutividadeAssessor` — consumidos pela Task 6 (service).

- [ ] **Step 1: Escrever o teste**

Adicione ao final de `backend/tests/integration/dashboard.repository.test.ts`:

```ts
describe('DashboardRepository.produtividadeAssessores', () => {
  it('conta por status as demandas que cada assessor de rua criou no período, mesmo reatribuídas', async () => {
    const rua2 = await prisma.user.create({
      data: { nome: 'Rua Dois', telefone: '+5534999995300', role: 'ASSESSOR_RUA' },
    });
    const gabinete = await prisma.user.create({
      data: { nome: 'Gabinete Um', telefone: '+5534999995301', role: 'ASSESSOR_GABINETE' },
    });

    const d1 = await requestRepo.create(inputBase({ codigoInterno: 'GD-prod-1' }), [fotoBase]);
    await requestRepo.updateStatus(d1.id, 'RECEBIDA', assessorId);
    await requestRepo.reatribuir(d1.id, gabinete.id, gabinete.id); // criadoPorId continua sendo assessorId
    await requestRepo.create(inputBase({ codigoInterno: 'GD-prod-2', assessorResponsavelId: rua2.id, criadoPorId: rua2.id }), [fotoBase]);

    const inicio = new Date();
    inicio.setDate(1);
    inicio.setHours(0, 0, 0, 0);
    const fim = new Date(inicio);
    fim.setMonth(fim.getMonth() + 1);

    const resultado = await dashboardRepo.produtividadeAssessores(inicio, fim);

    const linhaAssessor = resultado.find((r) => r.assessorId === assessorId);
    expect(linhaAssessor?.total).toBe(1);
    expect(linhaAssessor?.porStatus.RECEBIDA).toBe(1);
    const linhaRua2 = resultado.find((r) => r.assessorId === rua2.id);
    expect(linhaRua2?.total).toBe(1);
    expect(resultado.find((r) => r.assessorId === gabinete.id)).toBeUndefined();
  }, 30000);

  it('inclui assessores de rua ativos sem nenhuma demanda no período, com zero em tudo', async () => {
    const semDemandas = await prisma.user.create({
      data: { nome: 'Rua Sem Demandas', telefone: '+5534999995302', role: 'ASSESSOR_RUA' },
    });

    const inicio = new Date();
    inicio.setDate(1);
    inicio.setHours(0, 0, 0, 0);
    const fim = new Date(inicio);
    fim.setMonth(fim.getMonth() + 1);

    const resultado = await dashboardRepo.produtividadeAssessores(inicio, fim);

    const linha = resultado.find((r) => r.assessorId === semDemandas.id);
    expect(linha?.total).toBe(0);
  }, 20000);

  it('não conta demandas criadas fora do período', async () => {
    const d1 = await requestRepo.create(inputBase({ codigoInterno: 'GD-prod-3' }), [fotoBase]);
    await prisma.request.update({
      where: { id: d1.id },
      data: { createdAt: new Date('2020-01-01') },
    });

    const inicio = new Date();
    inicio.setDate(1);
    inicio.setHours(0, 0, 0, 0);
    const fim = new Date(inicio);
    fim.setMonth(fim.getMonth() + 1);

    const resultado = await dashboardRepo.produtividadeAssessores(inicio, fim);

    const linha = resultado.find((r) => r.assessorId === assessorId);
    expect(linha?.total).toBe(0);
  }, 20000);
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/integration/dashboard.repository.test.ts`
Expected: FAIL — `dashboardRepo.produtividadeAssessores` não existe.

- [ ] **Step 3: Implementar**

Em `backend/src/repositories/dashboard.repository.ts`, adicione ao topo do arquivo:

```ts
import type { UserRoleValue } from '../utils/jwt.js';
```

Adicione esta interface, junto das demais:

```ts
export interface ProdutividadeAssessor {
  assessorId: string;
  assessorNome: string;
  porStatus: Record<RequestStatusValue, number>;
  total: number;
}
```

Adicione `produtividadeAssessores` à interface `DashboardRepository`:

```ts
  produtividadeAssessores(mesInicio: Date, mesFim: Date): Promise<ProdutividadeAssessor[]>;
```

E a implementação, dentro do objeto retornado por `createDashboardRepository`, depois de `resumo`:

```ts
    async produtividadeAssessores(mesInicio, mesFim) {
      const assessoresRua = await prisma.user.findMany({
        where: { role: 'ASSESSOR_RUA' as UserRoleValue, ativo: true },
        select: { id: true, nome: true },
        orderBy: { nome: 'asc' },
      });

      const contagens = await prisma.request.groupBy({
        by: ['criadoPorId', 'status'],
        where: {
          createdAt: { gte: mesInicio, lt: mesFim },
          criadoPor: { role: 'ASSESSOR_RUA' as UserRoleValue },
        },
        _count: true,
      });

      return assessoresRua.map((assessor) => {
        const porStatus = Object.fromEntries(TODOS_STATUS.map((status) => [status, 0])) as Record<
          RequestStatusValue,
          number
        >;
        let total = 0;
        for (const linha of contagens) {
          if (linha.criadoPorId === assessor.id) {
            porStatus[linha.status as RequestStatusValue] = linha._count;
            total += linha._count;
          }
        }
        return { assessorId: assessor.id, assessorNome: assessor.nome, porStatus, total };
      });
    },
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/integration/dashboard.repository.test.ts`
Expected: PASS (5 testes já existentes + 3 novos = 8).

- [ ] **Step 5: Rodar toda a suíte do backend**

Run: `cd backend && npm test && npm run typecheck`
Expected: tudo passando.

- [ ] **Step 6: Commit**

```bash
git add backend/src/repositories/dashboard.repository.ts backend/tests/integration/dashboard.repository.test.ts
git commit -m "feat(backend): repositorio de produtividade dos assessores de rua"
```

---

## Task 6: Service, controller, rotas e wiring no app

**Files:**
- Create: `backend/src/services/dashboard.service.ts`
- Create: `backend/src/controllers/dashboard.controller.ts`
- Create: `backend/src/routes/dashboard.routes.ts`
- Create: `backend/src/validators/dashboard.validators.ts`
- Modify: `backend/src/app.ts`

**Interfaces:**
- Consumes: `DashboardRepository` (Tasks 4-5); `requireRole` (Fase 1, já existe).
- Produces: `GET /dashboard/resumo`, `GET /dashboard/produtividade-assessores`.

Esta task não tem ciclo de teste próprio (é fiação entre peças já testadas) — a Task 7 cobre as rotas com testes de integração.

- [ ] **Step 1: Validador do parâmetro de mês**

Crie `backend/src/validators/dashboard.validators.ts`:

```ts
import { z } from 'zod';

export const produtividadeQuerySchema = z.object({
  mes: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});
```

- [ ] **Step 2: Service**

Crie `backend/src/services/dashboard.service.ts`:

```ts
import type { DashboardRepository, ResumoDashboard, ProdutividadeAssessor } from '../repositories/dashboard.repository.js';

export class DashboardService {
  private dashboardRepo: DashboardRepository;

  constructor(deps: { dashboardRepo: DashboardRepository }) {
    this.dashboardRepo = deps.dashboardRepo;
  }

  async resumo(): Promise<ResumoDashboard> {
    return this.dashboardRepo.resumo();
  }

  /** `mes` no formato "YYYY-MM"; sem valor, usa o mês corrente. */
  async produtividadeAssessores(mes?: string): Promise<ProdutividadeAssessor[]> {
    const referencia = mes ? new Date(`${mes}-01T00:00:00.000Z`) : new Date();
    const mesInicio = new Date(Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth(), 1));
    const mesFim = new Date(Date.UTC(referencia.getUTCFullYear(), referencia.getUTCMonth() + 1, 1));
    return this.dashboardRepo.produtividadeAssessores(mesInicio, mesFim);
  }
}
```

- [ ] **Step 3: Controller**

Crie `backend/src/controllers/dashboard.controller.ts`:

```ts
import type { Request, Response } from 'express';
import type { DashboardService } from '../services/dashboard.service.js';
import { produtividadeQuerySchema } from '../validators/dashboard.validators.js';

export function createDashboardController(dashboardService: DashboardService) {
  return {
    async resumo(_req: Request, res: Response) {
      const resumo = await dashboardService.resumo();
      res.json({ success: true, data: resumo });
    },

    async produtividadeAssessores(req: Request, res: Response) {
      const { mes } = produtividadeQuerySchema.parse(req.query);
      const resultado = await dashboardService.produtividadeAssessores(mes);
      res.json({ success: true, data: resultado });
    },
  };
}
```

- [ ] **Step 4: Rotas**

Crie `backend/src/routes/dashboard.routes.ts`:

```ts
import { Router } from 'express';
import type { DashboardService } from '../services/dashboard.service.js';
import type { UserRepository } from '../repositories/user.repository.js';
import { createDashboardController } from '../controllers/dashboard.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireRole } from '../middlewares/require-role.js';

function asyncHandler(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next);
}

export function createDashboardRouter(deps: { dashboardService: DashboardService; userRepo: UserRepository }): Router {
  const router = Router();
  const controller = createDashboardController(deps.dashboardService);
  const auth = authenticate({ userRepo: deps.userRepo });
  const soChefe = requireRole('CHEFE');

  router.use(auth, soChefe);
  router.get('/resumo', asyncHandler(controller.resumo));
  router.get('/produtividade-assessores', asyncHandler(controller.produtividadeAssessores));

  return router;
}
```

- [ ] **Step 5: Wiring no app**

Em `backend/src/app.ts`, adicione aos imports:

```ts
import { createDashboardRepository } from './repositories/dashboard.repository.js';
import { DashboardService } from './services/dashboard.service.js';
import { createDashboardRouter } from './routes/dashboard.routes.js';
```

Depois da linha que cria `internalNoteService`, adicione:

```ts
  const dashboardRepo = createDashboardRepository(prisma);
  const dashboardService = new DashboardService({ dashboardRepo });
```

E adicione a linha do router, junto das demais `app.use(...)`:

```ts
  app.use('/dashboard', createDashboardRouter({ dashboardService, userRepo }));
```

- [ ] **Step 6: Confirmar que a suíte completa continua passando**

Run: `cd backend && npm test && npm run typecheck`
Expected: tudo passando.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/dashboard.service.ts backend/src/controllers/dashboard.controller.ts backend/src/routes/dashboard.routes.ts backend/src/validators/dashboard.validators.ts backend/src/app.ts
git commit -m "feat(backend): rotas do dashboard do chefe"
```

---

## Task 7: Testes de integração das rotas do dashboard

**Files:**
- Create: `backend/tests/integration/dashboard.routes.test.ts`

**Interfaces:**
- Consumes: as duas rotas da Task 6.

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

async function loginComoAssessor(role: 'ASSESSOR_RUA' | 'ASSESSOR_GABINETE' | 'CHEFE' = 'CHEFE', telefone = '+5534999995400') {
  const assessor = await testPrisma.user.create({
    data: { nome: 'Usuario Teste', telefone, role, ativo: true, pinDefinido: true, pinHash: await hash('482913') },
  });
  const login = await request(app).post('/auth/login').send({ telefone, pin: '482913' });
  return { assessor, accessToken: login.body.data.accessToken as string };
}

describe('GET /dashboard/resumo', () => {
  it('chefe recebe os 4 blocos', async () => {
    const { accessToken } = await loginComoAssessor('CHEFE');

    const res = await request(app).get('/dashboard/resumo').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.porStatus).toBeInstanceOf(Array);
    expect(res.body.data.porBairro).toBeInstanceOf(Array);
    expect(res.body.data.porAssessor).toBeInstanceOf(Array);
    expect(res.body.data.paradas).toBeInstanceOf(Array);
  }, 30000);

  it('bloqueia assessor de gabinete com 403', async () => {
    const { accessToken } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999995401');

    const res = await request(app).get('/dashboard/resumo').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(403);
  }, 30000);

  it('bloqueia assessor de rua com 403', async () => {
    const { accessToken } = await loginComoAssessor('ASSESSOR_RUA', '+5534999995402');

    const res = await request(app).get('/dashboard/resumo').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(403);
  }, 30000);
});

describe('GET /dashboard/produtividade-assessores', () => {
  it('chefe recebe a lista de assessores de rua com contagens', async () => {
    const { accessToken } = await loginComoAssessor('CHEFE', '+5534999995403');
    await testPrisma.user.create({
      data: { nome: 'Assessor Rua', telefone: '+5534999995404', role: 'ASSESSOR_RUA' },
    });

    const res = await request(app).get('/dashboard/produtividade-assessores').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.some((a: { assessorNome: string }) => a.assessorNome === 'Assessor Rua')).toBe(true);
  }, 30000);

  it('aceita o parâmetro mes no formato YYYY-MM', async () => {
    const { accessToken } = await loginComoAssessor('CHEFE', '+5534999995405');

    const res = await request(app)
      .get('/dashboard/produtividade-assessores?mes=2026-01')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
  }, 30000);

  it('rejeita um mes em formato inválido com 400', async () => {
    const { accessToken } = await loginComoAssessor('CHEFE', '+5534999995406');

    const res = await request(app)
      .get('/dashboard/produtividade-assessores?mes=janeiro')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
  }, 30000);

  it('bloqueia assessor de gabinete e de rua com 403', async () => {
    const { accessToken: tokenGabinete } = await loginComoAssessor('ASSESSOR_GABINETE', '+5534999995407');
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999995408');

    const resGabinete = await request(app).get('/dashboard/produtividade-assessores').set('Authorization', `Bearer ${tokenGabinete}`);
    const resRua = await request(app).get('/dashboard/produtividade-assessores').set('Authorization', `Bearer ${tokenRua}`);

    expect(resGabinete.status).toBe(403);
    expect(resRua.status).toBe(403);
  }, 30000);
});
```

- [ ] **Step 2: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/integration/dashboard.routes.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 3: Rodar toda a suíte do backend**

Run: `cd backend && npm test && npm run typecheck`
Expected: tudo passando.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/integration/dashboard.routes.test.ts
git commit -m "test(backend): cobertura de integracao das rotas do dashboard"
```

---

## Task 8: Front-end — tipos compartilhados

**Files:**
- Modify: `frontend/src/types/request.ts`

**Interfaces:**
- Produces: `ContagemStatus`, `ContagemBairro`, `ContagemAssessor`, `DemandaParada`, `ResumoDashboard`, `ProdutividadeAssessor` — consumidos pelas Tasks 10-11.

- [ ] **Step 1: Adicionar os tipos**

Adicione ao final de `frontend/src/types/request.ts`:

```ts
export interface ContagemStatus {
  status: RequestStatusValue;
  quantidade: number;
}

export interface ContagemBairro {
  bairro: string;
  quantidade: number;
}

export interface ContagemAssessor {
  assessorId: string;
  assessorNome: string;
  quantidade: number;
}

export interface DemandaParada {
  id: string;
  codigoInterno: string;
  tituloResumido: string;
  assessorResponsavelNome: string;
  status: RequestStatusValue;
  diasParada: number;
}

export interface ResumoDashboard {
  porStatus: ContagemStatus[];
  porBairro: ContagemBairro[];
  porAssessor: ContagemAssessor[];
  paradas: DemandaParada[];
}

export interface ProdutividadeAssessor {
  assessorId: string;
  assessorNome: string;
  porStatus: Record<RequestStatusValue, number>;
  total: number;
}
```

- [ ] **Step 2: Rodar o typecheck do front-end**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/request.ts
git commit -m "feat(frontend): tipos compartilhados do dashboard"
```

---

## Task 9: Front-end — filtro por assessor na listagem de demandas

**Files:**
- Modify: `frontend/src/app/painel/demandas/page.tsx`
- Modify: `frontend/src/app/painel/demandas/page.test.tsx` (arquivo já existe — adicionar sem remover os testes existentes)

**Interfaces:**
- Produces: a listagem de demandas passa a ler `assessorResponsavelId` da URL, além de `bairro`/`status` que já lia — necessário para os links do bloco "carga por assessor" (Task 10) funcionarem.

O backend já aceita `assessorResponsavelId` como filtro em `GET /demandas` desde a Fase 2 — só falta o front-end ler esse parâmetro da URL de entrada e aplicá-lo, mesmo padrão já usado para `status`.

- [ ] **Step 1: Escrever o teste**

Adicione ao `describe('DemandasPage', ...)` já existente em `frontend/src/app/painel/demandas/page.test.tsx`:

```tsx
  it('lê assessorResponsavelId da URL de entrada e aplica no filtro', async () => {
    const paramsOriginais = window.location.search;
    window.history.replaceState({}, '', '/painel/demandas?assessorResponsavelId=assessor-123');

    vi.mocked(apiClient.request).mockResolvedValueOnce({ items: [], total: 0, pagina: 1, tamanhoPagina: 20 });

    render(<DemandasPage />);

    await waitFor(() => expect(apiClient.request).toHaveBeenCalledTimes(1));
    const [url] = vi.mocked(apiClient.request).mock.calls[0]!;
    expect(url).toContain('assessorResponsavelId=assessor-123');

    window.history.replaceState({}, '', `/painel/demandas${paramsOriginais}`);
  });
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run src/app/painel/demandas/page.test.tsx`
Expected: FAIL — a página ainda não lê `assessorResponsavelId` de lugar nenhum.

- [ ] **Step 3: Implementar**

Em `frontend/src/app/painel/demandas/page.tsx`, adicione ao import do topo:

```tsx
import { useSearchParams } from 'next/navigation';
```

Dentro do componente, logo no início (antes dos `useState`), adicione:

```tsx
  const searchParams = useSearchParams();
  const assessorResponsavelIdInicial = searchParams.get('assessorResponsavelId') ?? '';
```

Adicione um estado novo, junto de `bairro`/`status`:

```tsx
  const [assessorResponsavelId] = useState(assessorResponsavelIdInicial);
```

No `useEffect` que monta os `params` e busca a API, adicione:

```tsx
    if (assessorResponsavelId) params.set('assessorResponsavelId', assessorResponsavelId);
```

(na lista de dependências do `useEffect`, adicione `assessorResponsavelId` junto de `pagina, bairroBuscado, status` — mesmo que esse valor nunca mude depois do carregamento inicial nesta fase, mantém a mesma disciplina do restante do array de dependências.)

Não é necessário adicionar nenhum campo novo na tela — esse filtro só é preenchido por um link vindo de fora (o dashboard), não editável diretamente nesta página.

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run src/app/painel/demandas/page.test.tsx`
Expected: PASS (todos os testes já existentes + 1 novo).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/painel/demandas/page.tsx frontend/src/app/painel/demandas/page.test.tsx
git commit -m "feat(frontend): listagem de demandas le assessorResponsavelId da URL"
```

---

## Task 10: Front-end — componente do resumo (blocos 1-4)

**Files:**
- Create: `frontend/src/components/ResumoDashboard.tsx`
- Test: `frontend/src/components/ResumoDashboard.test.tsx`

**Interfaces:**
- Consumes: `apiClient` (Fase 1); `STATUS_LABEL` (Fase 3); `ResumoDashboard`/`RequestStatusValue` (Task 8).
- Produces: `<ResumoDashboard />` — consumido pela Task 12.

- [ ] **Step 1: Escrever o teste**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResumoDashboard } from './ResumoDashboard';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient } from '@/services/api-client';

const resumoFake = {
  porStatus: [
    { status: 'ENVIADA', quantidade: 3 },
    { status: 'PROTOCOLADA', quantidade: 5 },
  ],
  porBairro: [{ bairro: 'Centro', quantidade: 2 }],
  porAssessor: [{ assessorId: 'a1', assessorNome: 'Ana', quantidade: 4 }],
  paradas: [
    { id: 'd1', codigoInterno: 'GD-1', tituloResumido: 'Buraco', assessorResponsavelNome: 'Ana', status: 'EM_CONFERENCIA', diasParada: 3 },
  ],
};

beforeEach(() => {
  vi.mocked(apiClient.request).mockReset();
});

describe('ResumoDashboard', () => {
  it('mostra os 4 blocos com os dados carregados', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce(resumoFake);

    render(<ResumoDashboard />);

    expect(await screen.findByText('Centro')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText(/GD-1/)).toBeInTheDocument();
    expect(screen.getByText(/3 dias/)).toBeInTheDocument();
  });

  it('cada contagem é um link para a listagem já filtrada', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce(resumoFake);

    render(<ResumoDashboard />);
    await screen.findByText('Centro');

    expect(screen.getByRole('link', { name: /Centro/ })).toHaveAttribute('href', '/painel/demandas?bairro=Centro');
    expect(screen.getByRole('link', { name: /Ana/ })).toHaveAttribute('href', '/painel/demandas?assessorResponsavelId=a1');
  });

  it('mostra mensagem quando não há demandas paradas', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({ ...resumoFake, paradas: [] });

    render(<ResumoDashboard />);

    expect(await screen.findByText(/nenhuma demanda parada/i)).toBeInTheDocument();
  });

  it('mostra erro quando a API rejeita', async () => {
    vi.mocked(apiClient.request).mockRejectedValueOnce(new Error('falhou'));

    render(<ResumoDashboard />);

    expect(await screen.findByText(/não foi possível carregar/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run src/components/ResumoDashboard.test.tsx`
Expected: FAIL — `./ResumoDashboard` não existe.

- [ ] **Step 3: Implementar**

Crie `frontend/src/components/ResumoDashboard.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/services/api-client';
import { STATUS_LABEL } from '@/lib/request-status';
import type { ResumoDashboard as ResumoDashboardData } from '@/types/request';

function Barra({ label, quantidade, maximo, href }: { label: string; quantidade: number; maximo: number; href: string }) {
  const percentual = maximo === 0 ? 0 : Math.round((quantidade / maximo) * 100);
  return (
    <div className="mb-2">
      <div className="flex justify-between text-sm">
        <Link href={href} className="text-primary-dark hover:underline">
          {label}
        </Link>
        <span className="font-medium">{quantidade}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-gray-100">
        <div className="h-2 rounded-full bg-primary" style={{ width: `${percentual}%` }} />
      </div>
    </div>
  );
}

export function ResumoDashboard() {
  const [dados, setDados] = useState<ResumoDashboardData | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    apiClient
      .request<ResumoDashboardData>('/dashboard/resumo', { auth: true })
      .then(setDados)
      .catch(() => setErro(true))
      .finally(() => setCarregando(false));
  }, []);

  if (carregando) return <p className="text-sm text-gray-500">Carregando…</p>;
  if (erro || !dados) return <p className="text-sm text-red-600">Não foi possível carregar o resumo.</p>;

  const maximoStatus = Math.max(1, ...dados.porStatus.map((s) => s.quantidade));
  const maximoBairro = Math.max(1, ...dados.porBairro.map((b) => b.quantidade));
  const maximoAssessor = Math.max(1, ...dados.porAssessor.map((a) => a.quantidade));

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="rounded-card bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-primary-dark">Status das demandas</h2>
        {dados.porStatus.map((item) => (
          <Barra
            key={item.status}
            label={STATUS_LABEL[item.status]}
            quantidade={item.quantidade}
            maximo={maximoStatus}
            href={`/painel/demandas?status=${item.status}`}
          />
        ))}
      </div>

      <div className="rounded-card bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-primary-dark">Demandas por bairro</h2>
        {dados.porBairro.map((item) => (
          <Barra
            key={item.bairro}
            label={item.bairro}
            quantidade={item.quantidade}
            maximo={maximoBairro}
            href={`/painel/demandas?bairro=${encodeURIComponent(item.bairro)}`}
          />
        ))}
      </div>

      <div className="rounded-card bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-primary-dark">Carga por assessor responsável</h2>
        {dados.porAssessor.map((item) => (
          <Barra
            key={item.assessorId}
            label={item.assessorNome}
            quantidade={item.quantidade}
            maximo={maximoAssessor}
            href={`/painel/demandas?assessorResponsavelId=${item.assessorId}`}
          />
        ))}
      </div>

      <div className="rounded-card bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-primary-dark">Demandas paradas (2+ dias)</h2>
        {dados.paradas.length === 0 && <p className="text-sm text-gray-500">Nenhuma demanda parada.</p>}
        <ul className="flex flex-col gap-2">
          {dados.paradas.map((item) => (
            <li key={item.id}>
              <Link href={`/painel/demandas/${item.id}`} className="block rounded-xl border border-gray-200 p-2 text-sm hover:bg-gray-50">
                <p className="font-medium text-gray-900">{item.codigoInterno} — {item.tituloResumido}</p>
                <p className="text-xs text-gray-600">
                  {item.assessorResponsavelNome} — {STATUS_LABEL[item.status]} — {item.diasParada} dias parada
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run src/components/ResumoDashboard.test.tsx`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ResumoDashboard.tsx frontend/src/components/ResumoDashboard.test.tsx
git commit -m "feat(frontend): componente de resumo do dashboard"
```

---

## Task 11: Front-end — tabela de produtividade dos assessores de rua

**Files:**
- Create: `frontend/src/components/ProdutividadeAssessores.tsx`
- Test: `frontend/src/components/ProdutividadeAssessores.test.tsx`

**Interfaces:**
- Consumes: `apiClient` (Fase 1); `STATUS_LABEL` (Fase 3); `ProdutividadeAssessor` (Task 8).
- Produces: `<ProdutividadeAssessores />` — consumido pela Task 12.

- [ ] **Step 1: Escrever o teste**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProdutividadeAssessores } from './ProdutividadeAssessores';

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient } from '@/services/api-client';

function assessorFake(overrides: Record<string, unknown> = {}) {
  return {
    assessorId: 'a1',
    assessorNome: 'Ana',
    porStatus: { RASCUNHO: 0, ENVIADA: 3, RECEBIDA: 0, EM_CONFERENCIA: 0, PENDENTE_INFORMACAO: 0, PROTOCOLADA: 2, EM_ANDAMENTO: 0, CONCLUIDA: 0, ARQUIVADA: 0, RECUSADA: 0 },
    total: 5,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(apiClient.request).mockReset();
});

describe('ProdutividadeAssessores', () => {
  it('mostra a tabela com nome, contagens por status e total', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([assessorFake()]);

    render(<ProdutividadeAssessores />);

    expect(await screen.findByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('refaz a busca quando o mês muda', async () => {
    vi.mocked(apiClient.request).mockResolvedValue([assessorFake()]);

    render(<ProdutividadeAssessores />);
    await waitFor(() => expect(apiClient.request).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText(/mês/i), { target: { value: '2026-01' } });

    await waitFor(() => expect(apiClient.request).toHaveBeenCalledTimes(2));
    const [url] = vi.mocked(apiClient.request).mock.calls[1]!;
    expect(url).toContain('mes=2026-01');
  });

  it('mostra mensagem quando não há assessores de rua ativos', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([]);

    render(<ProdutividadeAssessores />);

    expect(await screen.findByText(/nenhum assessor de rua/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run src/components/ProdutividadeAssessores.test.tsx`
Expected: FAIL — `./ProdutividadeAssessores` não existe.

- [ ] **Step 3: Implementar**

Crie `frontend/src/components/ProdutividadeAssessores.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/services/api-client';
import { STATUS_LABEL } from '@/lib/request-status';
import type { ProdutividadeAssessor, RequestStatusValue } from '@/types/request';

function mesAtual(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}

const ORDEM_STATUS: RequestStatusValue[] = [
  'ENVIADA', 'RECEBIDA', 'EM_CONFERENCIA', 'PENDENTE_INFORMACAO',
  'PROTOCOLADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'ARQUIVADA', 'RECUSADA',
];

export function ProdutividadeAssessores() {
  const [mes, setMes] = useState(mesAtual());
  const [dados, setDados] = useState<ProdutividadeAssessor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    setCarregando(true);
    setErro(false);
    apiClient
      .request<ProdutividadeAssessor[]>(`/dashboard/produtividade-assessores?mes=${mes}`, { auth: true })
      .then(setDados)
      .catch(() => setErro(true))
      .finally(() => setCarregando(false));
  }, [mes]);

  return (
    <div className="rounded-card bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-primary-dark">Produtividade dos assessores de rua</h2>
        <div>
          <label htmlFor="mes-produtividade" className="mr-2 text-xs font-medium text-gray-600">
            Mês
          </label>
          <input
            id="mes-produtividade"
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="rounded-xl border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
      </div>

      {carregando && <p className="text-sm text-gray-500">Carregando…</p>}
      {erro && <p className="text-sm text-red-600">Não foi possível carregar a produtividade.</p>}
      {!carregando && !erro && dados.length === 0 && (
        <p className="text-sm text-gray-500">Nenhum assessor de rua ativo.</p>
      )}

      {!carregando && !erro && dados.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-600">
                <th className="py-2 pr-3">Assessor</th>
                {ORDEM_STATUS.map((status) => (
                  <th key={status} className="px-2 py-2 text-right">{STATUS_LABEL[status]}</th>
                ))}
                <th className="py-2 pl-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {dados.map((assessor) => (
                <tr key={assessor.assessorId} className="border-b border-gray-100">
                  <td className="py-2 pr-3 font-medium text-gray-900">{assessor.assessorNome}</td>
                  {ORDEM_STATUS.map((status) => (
                    <td key={status} className="px-2 py-2 text-right text-gray-700">{assessor.porStatus[status]}</td>
                  ))}
                  <td className="py-2 pl-3 text-right font-medium text-gray-900">{assessor.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run src/components/ProdutividadeAssessores.test.tsx`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ProdutividadeAssessores.tsx frontend/src/components/ProdutividadeAssessores.test.tsx
git commit -m "feat(frontend): tabela de produtividade dos assessores de rua"
```

---

## Task 12: Front-end — página do dashboard, navegação e verificação final

**Files:**
- Create: `frontend/src/app/painel/dashboard/page.tsx`
- Test: `frontend/src/app/painel/dashboard/page.test.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/components/MobileNav.tsx`

**Interfaces:**
- Consumes: `ResumoDashboard` (Task 10), `ProdutividadeAssessores` (Task 11), `useAuth` (Fase 1).

- [ ] **Step 1: Escrever o teste da página**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DashboardPage from './page';

const useAuthMock = vi.fn();
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => useAuthMock() }));

vi.mock('@/components/ResumoDashboard', () => ({
  ResumoDashboard: () => <div>Resumo do dashboard</div>,
}));
vi.mock('@/components/ProdutividadeAssessores', () => ({
  ProdutividadeAssessores: () => <div>Tabela de produtividade</div>,
}));

describe('DashboardPage', () => {
  it('mostra o conteúdo para o chefe', () => {
    useAuthMock.mockReturnValue({ user: { id: 'chefe-1', role: 'CHEFE' } });

    render(<DashboardPage />);

    expect(screen.getByText('Resumo do dashboard')).toBeInTheDocument();
    expect(screen.getByText('Tabela de produtividade')).toBeInTheDocument();
  });

  it('mostra mensagem de acesso negado para quem não é chefe', () => {
    useAuthMock.mockReturnValue({ user: { id: 'gabinete-1', role: 'ASSESSOR_GABINETE' } });

    render(<DashboardPage />);

    expect(screen.queryByText('Resumo do dashboard')).not.toBeInTheDocument();
    expect(screen.getByText(/acesso restrito ao chefe/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run "src/app/painel/dashboard/page.test.tsx"`
Expected: FAIL — `./page` não existe.

- [ ] **Step 3: Implementar a página**

Crie `frontend/src/app/painel/dashboard/page.tsx`:

```tsx
'use client';

import { useAuth } from '@/hooks/use-auth';
import { ResumoDashboard } from '@/components/ResumoDashboard';
import { ProdutividadeAssessores } from '@/components/ProdutividadeAssessores';

export default function DashboardPage() {
  const { user } = useAuth();

  if (user?.role !== 'CHEFE') {
    return <p className="text-sm text-red-600">Acesso restrito ao chefe.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-primary-dark">Dashboard</h1>
      <ResumoDashboard />
      <ProdutividadeAssessores />
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run "src/app/painel/dashboard/page.test.tsx"`
Expected: PASS (2 testes).

- [ ] **Step 5: Adicionar o link na navegação**

Em `frontend/src/components/Sidebar.tsx` e `frontend/src/components/MobileNav.tsx`, adicione um item à lista `ITENS` de cada arquivo, logo depois de `{ href: '/painel/demandas', label: 'Demandas' }`:

```tsx
  { href: '/painel/dashboard', label: 'Dashboard', somenteChefe: true },
```

(A filtragem por `somenteChefe` já existe em ambos os componentes — não precisa mudar mais nada.)

- [ ] **Step 6: Verificação final — suíte completa do front-end, build, e suíte completa do backend**

Run: `cd frontend && npx vitest run && npx tsc --noEmit && npm run build`
Expected: tudo passando, build conclui sem erros.

Run: `cd backend && npm test && npm run typecheck`
Expected: tudo passando (garantia de que nada quebrou nesta fase).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/painel/dashboard frontend/src/components/Sidebar.tsx frontend/src/components/MobileNav.tsx
git commit -m "feat(frontend): pagina do dashboard e link de navegacao para o chefe"
```
