# Tela de Configurações (Fase 5, parte 2) — Design

## Contexto

O `Sidebar` já linka `/painel/configuracoes` (`somenteChefe: true`), mas a página não existe. O modelo `RequestType` (tipos de demanda: `nome`, `ativo`, `exigeDescricaoObrigatoria`) já existe no banco desde a Fase 2, mas o backend só expõe `GET /tipos-demanda`, que lista apenas os tipos ativos (usado hoje só pelo formulário de nova demanda, para qualquer papel autenticado). Não existe nenhum CRUD de tipos de demanda — hoje eles só podem ser criados/editados diretamente no banco.

Esta é a segunda das "duas telas" pedidas pelo usuário (a primeira, Assessores, foi entregue na Fase 5 parte 1 — PR #8). O objetivo é dar ao chefe uma tela de gestão dos tipos de demanda: criar novos tipos, editar nome e exigência de descrição, ativar/desativar.

## Arquitetura

Reaproveita a estrutura já existente de `request-type` (repository/controller/routes) e o padrão de camadas já estabelecido em `UserService`: repository → service (regra de negócio + auditoria) → controller → route. O endpoint público de leitura (`GET /tipos-demanda`, ativos apenas, qualquer papel autenticado) permanece inalterado — ele alimenta o formulário de nova demanda e não deve ganhar nenhuma restrição nova. Todos os endpoints de gestão (listar todos, criar, editar, ativar/desativar) são exclusivos do chefe.

Não há endpoint de exclusão: `RequestType.demandas` é uma relação obrigatória (`requestTypeId` não-nulo, sem `onDelete` explícito → `RESTRICT` no Postgres), então apagar um tipo referenciado por qualquer demanda quebraria a integridade referencial. Em vez disso, tipos são desativados — mesmo padrão já usado para usuários (nunca há exclusão de `User`, só `ativo: false`). Um tipo desativado não aparece mais no formulário de nova demanda (`GET /tipos-demanda` já filtra por `ativo: true`), mas continua existindo e sendo exibido normalmente nas demandas já criadas com ele.

## Backend

### `backend/src/repositories/request-type.repository.ts`

Interface `RequestTypeRepository` ganha 3 métodos novos, mantendo os 2 existentes (`listActive`, `findById`) intactos:

```ts
export interface RequestTypeRepository {
  listActive(): Promise<RequestTypeSummary[]>;
  findById(id: string): Promise<(RequestTypeSummary & { ativo: boolean }) | null>;
  listAll(): Promise<(RequestTypeSummary & { ativo: boolean })[]>;
  create(data: { nome: string; exigeDescricaoObrigatoria: boolean }): Promise<RequestTypeSummary & { ativo: boolean }>;
  update(
    id: string,
    data: { nome?: string; exigeDescricaoObrigatoria?: boolean },
  ): Promise<RequestTypeSummary & { ativo: boolean }>;
  setAtivo(id: string, ativo: boolean): Promise<RequestTypeSummary & { ativo: boolean }>;
}
```

- `listAll()`: `prisma.requestType.findMany({ orderBy: { nome: 'asc' }, select: {...} })`, sem filtro de `ativo` — inclui os inativos, ordenado por nome (mesmo critério de `listActive`).
- `create()`/`update()`: usam o `@unique` já existente na coluna `nome`. A violação de unicidade (Prisma error code `P2002`) é capturada e relançada como um erro de domínio reconhecível (mesmo mecanismo — checar `error.code === 'P2002'` — que `UserRepository` já não usa hoje porque a checagem de duplicidade de telefone é feita no service via `findByTelefone` antes do insert; aqui seguimos o mesmo caminho: o service verifica duplicidade antes de chamar `create`/`update`, então o repositório nunca precisa tratar `P2002` diretamente — ver seção Service).

### `backend/src/services/request-type.service.ts` (novo arquivo)

Segue exatamente o padrão de `UserService`: recebe `requestTypeRepo` e `auditLogRepo` no construtor, cada mutação primeiro verifica duplicidade de nome à mão (busca por nome via um novo método simples do repositório ou reaproveitando `listAll()` e filtrando em memória — decisão de implementação, não de design), grava o audit log, e retorna um resultado de domínio tipado:

```ts
export type CriarTipoResult =
  | { status: 'ok'; tipo: RequestTypeSummary & { ativo: boolean } }
  | { status: 'nome_duplicado' };

export type EditarTipoResult =
  | { status: 'ok'; tipo: RequestTypeSummary & { ativo: boolean } }
  | { status: 'nome_duplicado' }
  | { status: 'nao_encontrado' };

export type DefinirAtivoTipoResult =
  | { status: 'ok'; tipo: RequestTypeSummary & { ativo: boolean } }
  | { status: 'nao_encontrado' };
```

Ações de auditoria: `CRIAR_TIPO_DEMANDA`, `EDITAR_TIPO_DEMANDA`, `DEFINIR_ATIVO_TIPO_DEMANDA` — entidade `RequestType`, mesmo formato de `detalhes`/`ip`/`actorUserId` já usado em `UserService`.

Diferente de usuários, não existe "último tipo ativo" a proteger — desativar o único tipo ativo restante é permitido (o formulário de nova demanda simplesmente ficaria sem opções, o que é uma decisão operacional do chefe, não uma invariante do sistema).

### `backend/src/controllers/request-type.controller.ts`

`listar` (existente, endpoint público) fica igual. Métodos novos: `listarTodos`, `criar`, `editar`, `definirAtivo` — mesmo formato de resposta (`{ success: true, data }`) e mesmo mapeamento de erros de domínio para HTTP (`nome_duplicado` → 409, `nao_encontrado` → 404) já usado em `user.controller.ts`.

### `backend/src/validators/request-type.validators.ts` (novo arquivo)

```ts
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

export const definirAtivoTipoSchema = z.object({ ativo: z.boolean() });

export const tipoIdParamsSchema = z.object({ id: z.string().uuid() });
```

### `backend/src/routes/request-type.routes.ts`

```
GET   /tipos-demanda            auth apenas                → listar (só ativos, como hoje)
GET   /tipos-demanda/todos      auth + requireRole('CHEFE') → listarTodos
POST  /tipos-demanda            auth + requireRole('CHEFE') → criar
PATCH /tipos-demanda/:id        auth + requireRole('CHEFE') → editar
PATCH /tipos-demanda/:id/ativo  auth + requireRole('CHEFE') → definirAtivo
```

`/todos` como sufixo (não como raiz com query param) evita qualquer ambiguidade de roteamento com `GET /` e deixa claro na URL que é uma visão administrativa diferente da pública.

## Frontend

### `frontend/src/app/painel/configuracoes/page.tsx` (novo)

Idêntico em estrutura a `assessores/page.tsx`: `'use client'`, `useAuth()`, bloqueia com mensagem "Acesso restrito ao chefe." se `user?.role !== 'CHEFE'`, senão renderiza `<h1>Configurações</h1>` + `<ListaTiposDemanda />`.

### `frontend/src/components/ListaTiposDemanda.tsx` (novo)

Auto-contido (sem props), busca `GET /tipos-demanda/todos` ao montar. Tabela com colunas: Nome, Exige descrição (Sim/Não), Status (Ativo/Inativo), Ações (Editar, Ativar/Desativar). Botão "+ Novo tipo" acima da tabela abre o modal em modo criar. Cada botão de ação por linha leva `aria-label` desde a primeira versão (ex: `` `Editar ${tipo.nome}` ``, `` `${tipo.ativo ? 'Desativar' : 'Ativar'} ${tipo.nome}` ``) — aplicando a lição da revisão final da Fase 5 parte 1 de antemão, em vez de corrigir depois.

### `frontend/src/components/ModalTipoDemanda.tsx` (novo)

`<ModalTipoDemanda modo="criar"|"editar" tipo? onFechar onSalvo>` — mesmo esqueleto visual de `ModalAssessor` (overlay + painel `max-w-md`). Campos: Nome (`TextField`), "Exige descrição obrigatória" (checkbox). Em caso de nome duplicado, exibe a mensagem de erro vinda do backend verbatim (mesmo princípio de "sem duplicação de regra de negócio no frontend" já seguido em `ModalAssessor`/`ListaAssessores`).

Nenhuma mudança é necessária em `Sidebar.tsx`/`MobileNav.tsx` — o link já existe.

## Testes

Espelham a suíte da Fase 5 parte 1:
- `backend/tests/unit/request-type-service.test.ts`: criar (ok, nome duplicado), editar (ok, nome duplicado, não encontrado), definir ativo (ok, não encontrado, desativar o único tipo ativo é permitido).
- `backend/tests/integration/request-type.routes.test.ts`: estende o arquivo existente — 403 para não-chefe nos 4 endpoints novos, 200/201 nos casos de sucesso, 409 para nome duplicado, `/todos` retorna tipos inativos junto com ativos (a diferença central vs. `GET /`).
- `frontend/src/components/ListaTiposDemanda.test.tsx`, `ModalTipoDemanda.test.tsx`, `frontend/src/app/painel/configuracoes/page.test.tsx`: mesmo padrão de mocks de `apiClient` já usado nos testes de Assessores, incluindo um teste de múltiplas linhas provando que os `aria-label`s desambiguam os botões (aprendida na Fase 5 parte 1).

## Fora de escopo

- Exclusão de tipos de demanda (nunca — ver seção Arquitetura).
- Reordenar tipos manualmente (permanece ordenado por nome, A-Z).
- Qualquer configuração de conta do próprio chefe (senha, PIN, nome/telefone) — o usuário optou por deixar esta tela restrita a tipos de demanda.
