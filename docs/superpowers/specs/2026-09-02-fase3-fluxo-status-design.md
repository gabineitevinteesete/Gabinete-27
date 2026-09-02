# Fase 3 (parte 1) — Fluxo de status e protocolo: design

## Contexto

Fase 2 (Demandas + fotos) está completa e mergeada: assessores criam, listam, veem e
editam demandas com 2-4 fotos. Toda demanda hoje nasce com status `ENVIADA` e nunca sai
dali — não existe forma de protocolar, marcar em andamento, concluir, recusar ou
arquivar. Esta fase entrega exatamente isso: o fluxo de trabalho que o gabinete usa no
dia a dia para processar as demandas depois que elas chegam.

A Fase 3 completa (conforme mapeado no spec da Fase 2) também inclui observações
internas e um dashboard/relatórios agregados — esses ficam como sub-projetos
independentes, a serem desenhados depois. Este documento cobre só o fluxo de
status/protocolo e a reatribuição de demandas entre assessores.

O schema Prisma já tem tudo que esta fase precisa, sem migração: o enum `RequestStatus`
(`RASCUNHO`, `ENVIADA`, `RECEBIDA`, `EM_CONFERENCIA`, `PENDENTE_INFORMACAO`,
`PROTOCOLADA`, `EM_ANDAMENTO`, `CONCLUIDA`, `ARQUIVADA`, `RECUSADA`) e o modelo
`RequestStatusHistory` (`statusAnterior`, `statusNovo`, `usuarioId`, `observacao`,
`createdAt`) já existem desde a Fase 1, só nunca foram usados.

## Máquina de estados

```
ENVIADA → RECEBIDA → EM_CONFERENCIA ⇄ PENDENTE_INFORMACAO
                            │
                            ▼
                       PROTOCOLADA → EM_ANDAMENTO → CONCLUIDA
                            │                             │
                            ▼                             ▼
                        RECUSADA  ────────────────────► ARQUIVADA
                                                            ▲
                                                            │
                                                     (a partir de CONCLUIDA também)
```

Transições válidas, cada uma um botão de ação específico (nunca uma lista solta de
todos os status — evita pular etapa ou escolher um status incoerente por engano):

| De | Para | Exige |
|---|---|---|
| `ENVIADA` | `RECEBIDA` | — |
| `RECEBIDA` | `EM_CONFERENCIA` | — |
| `EM_CONFERENCIA` | `PENDENTE_INFORMACAO` | motivo (texto livre, obrigatório) |
| `PENDENTE_INFORMACAO` | `EM_CONFERENCIA` | — (informação resolvida) |
| `EM_CONFERENCIA` | `PROTOCOLADA` | — (sem número de protocolo nesta fase, ver "Fora de escopo") |
| `ENVIADA`, `RECEBIDA`, `EM_CONFERENCIA`, `PENDENTE_INFORMACAO` | `RECUSADA` | motivo (texto livre, obrigatório) |
| `PROTOCOLADA` | `EM_ANDAMENTO` | — |
| `EM_ANDAMENTO` | `CONCLUIDA` | — |
| `CONCLUIDA` ou `RECUSADA` | `ARQUIVADA` | — (ação opcional, não automática) |

Qualquer outra transição não listada aqui retorna 400. `RASCUNHO` não é alcançável
nesta fase (reservado para o PWA offline, Fase 4).

Toda transição grava uma linha em `RequestStatusHistory` (`statusAnterior`,
`statusNovo`, `usuarioId` do usuário autenticado, `observacao` com o motivo quando
houver, `createdAt`). Essa tabela alimenta a linha do tempo da tela de detalhe — não há
"desfazer" nesta fase: uma transição errada precisa de uma nova transição pra frente
(ex: recusar) para corrigir; não existe caminho de volta no meio do fluxo além do
`PENDENTE_INFORMACAO ⇄ EM_CONFERENCIA` já mapeado.

## Permissões

- `ASSESSOR_RUA`: sem mudança desta fase — continua sem nenhum acesso às transições de
  status; só vê o status atual e a linha do tempo (somente leitura) das próprias
  demandas.
- `ASSESSOR_GABINETE` e `CHEFE`: têm exatamente os mesmos poderes em todas as
  transições de status listadas acima, em qualquer demanda.
- **Reatribuição de demanda** (trocar `assessorResponsavelId`): exclusiva do `CHEFE`.
  Pode reatribuir para qualquer assessor ativo, de qualquer papel (`ASSESSOR_RUA` ou
  `ASSESSOR_GABINETE`). Reatribuir não muda o status da demanda; grava seu próprio
  registro (ver "Dados" abaixo) e não usa `RequestStatusHistory` (que é só pra status).
- Toda regra de permissão é aplicada no backend, nunca só escondida no front-end.

## Dados

Nenhuma migração de schema para o fluxo de status (a tabela `RequestStatusHistory` já
existe e cobre o necessário).

Para a reatribuição, é necessário registrar quem reatribuiu, quando, e de quem para
quem — isso não existe ainda no schema. Nova tabela:

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

## API

Todas as rotas abaixo exigem autenticação; as regras de permissão da seção acima se
aplicam.

- `PATCH /demandas/:id/status` — corpo `{ novoStatus: RequestStatus; motivo?: string }`.
  Valida que a transição de `status` atual para `novoStatus` é uma das listadas na
  tabela de transições válidas; retorna 400 se não for. Valida que `motivo` está
  presente (não vazio) quando a transição exige (`PENDENTE_INFORMACAO`, `RECUSADA`);
  retorna 400 se faltar. Grava a transição em `RequestStatusHistory` e atualiza
  `Request.status`, na mesma transação Prisma. Só `ASSESSOR_GABINETE`/`CHEFE`; 403 para
  `ASSESSOR_RUA`.
- `GET /demandas/:id/historico-status` — lista `RequestStatusHistory` da demanda,
  ordenada por `createdAt`, incluindo o nome de quem fez cada mudança (join com
  `User`). Mesma regra de "dono" da Fase 2 para quem pode ver (se `ASSESSOR_RUA` só vê
  a própria demanda, só vê o histórico da própria demanda também).
- `PATCH /demandas/:id/reatribuir` — corpo `{ novoAssessorId: string }`. Só `CHEFE`
  (403 para os demais papéis, incluindo `ASSESSOR_GABINETE`). Valida que
  `novoAssessorId` existe e está `ativo`. Atualiza `Request.assessorResponsavelId` e
  grava em `RequestReassignmentHistory`, na mesma transação.
- `GET /demandas` — adiciona filtro `status` aos filtros já existentes (bairro, etc.).

## Front-end

- **`/painel/demandas/[id]`** (tela de detalhe, já existente): para `ASSESSOR_GABINETE`
  e `CHEFE`, mostra os botões de ação válidos para o status atual da demanda (conforme
  tabela de transições). Botões que exigem motivo (`PENDENTE_INFORMACAO`, `RECUSADA`)
  abrem uma caixa de texto antes de confirmar a transição. Chefe também vê um seletor
  para reatribuir o assessor responsável.
- **Linha do tempo**: nova seção na tela de detalhe, abaixo dos dados da demanda,
  listando cada entrada de `RequestStatusHistory` (quem, quando, de→para, motivo se
  houver), mais recente primeiro. Visível para todos que podem ver a demanda
  (`ASSESSOR_RUA` só a das próprias).
- **`/painel/demandas`** (listagem, já existente): novo filtro por status, ao lado do
  filtro de bairro já existente — um seletor com os 10 valores do enum.

## Testes

Mesmo padrão TDD já estabelecido, contra o Neon real:

- Unitários: função de validação de transição (cada combinação válida permitida, cada
  combinação inválida rejeitada), regra de motivo obrigatório por transição.
- Integração: `PATCH /demandas/:id/status` para cada transição válida (grava
  `RequestStatusHistory`, atualiza `Request.status`), transição inválida retorna 400,
  transição sem motivo obrigatório retorna 400, `ASSESSOR_RUA` recebe 403;
  `GET /demandas/:id/historico-status` retorna a lista ordenada corretamente, respeita
  a regra de dono; `PATCH /demandas/:id/reatribuir` só `CHEFE` consegue (403 para
  `ASSESSOR_GABINETE` e `ASSESSOR_RUA`), atualiza `assessorResponsavelId`, grava
  `RequestReassignmentHistory`, rejeita `novoAssessorId` inexistente ou inativo;
  `GET /demandas` filtra corretamente por `status`.

## Fora de escopo desta fase

Número de protocolo (o campo `numeroProtocolo` continua existindo no schema desde a
Fase 1, mas não é preenchido nesta fase — protocolar aqui é só uma mudança de status;
capturar o número vindo do site da prefeitura fica para uma fase futura). Caixa de
justificativa para CEP/telefone ausente na tela de cadastro (é um ajuste separado na
tela de nova demanda da Fase 2, não faz parte deste fluxo de status). Observações
internas, notificações, dashboard/relatórios agregados, exportação em PDF, PWA offline
— cada um fica como seu próprio sub-projeto a desenhar depois. Desfazer uma transição
já feita (não existe "voltar" além do `PENDENTE_INFORMACAO ⇄ EM_CONFERENCIA` mapeado).
