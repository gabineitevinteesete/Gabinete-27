# Auditoria de criação/edição de demanda — Design

## Contexto

A revisão de conformidade LGPD (`docs/superpowers/specs/2026-09-10-lgpd-revisao-conformidade.md`) encontrou que o sistema já tem uma tabela de auditoria (`AuditLog`) bem estruturada, usada para ações administrativas (criar/editar usuários, criar/editar tipos de demanda, mudanças de escala) — mas **não cobre criar ou editar uma demanda**, que é exatamente onde ficam os dados pessoais dos cidadãos. Hoje, se depois de um incidente for preciso responder "quem acessou/alterou os dados desse cidadão, e quando?", a resposta é parcial: `RequestStatusHistory` mostra quem mudou o status, `RequestReassignmentHistory` mostra reatribuições, mas nada registra quem criou ou editou os dados de contato/endereço/descrição de uma demanda.

Este documento cobre fechar essa lacuna: `CRIAR_DEMANDA` e `EDITAR_DEMANDA` passam a ser gravados em `AuditLog`, mesmo padrão já usado por `UserService` e `RequestTypeService`.

## Arquitetura

`RequestService` ganha `auditLogRepo: AuditLogRepository` como dependência obrigatória do construtor (mesmo padrão de `UserService`/`RequestTypeService`). Depois que `criar()` grava a demanda com sucesso (`requestRepo.create(...)`), o service grava `auditLogRepo.record({ actorUserId, acao: 'CRIAR_DEMANDA', entidade: 'Request', entidadeId: demanda.id, ip })`. Depois que `editar()` grava com sucesso (`requestRepo.update(...)`), grava `EDITAR_DEMANDA` da mesma forma.

Nenhum dos dois grava `detalhes` (o que mudou) — mantém consistência deliberada com `EDITAR_USUARIO` e `EDITAR_TIPO_DEMANDA`, que também não gravam essa informação hoje. O registro já cumpre o propósito de rastreabilidade (quem, quando, em qual demanda) via `entidadeId`; adicionar um diff de campos seria uma melhoria maior, fora do escopo desta lacuna específica, e melhor abordada de uma vez para os três services quando/se for feita.

`ip` chega ao service do mesmo jeito que em `UserController`/`RequestTypeController`: o controller chama `getClientIp(req)` e passa adiante. `criar()` já recebe um objeto de input único (`CriarDemandaInput`) — `ip?: string` entra nele. `editar(id, input, usuario)` recebe parâmetros separados — ganha um 4º parâmetro `ip?: string`.

## Fora de escopo

- `mudarStatus()` e `reatribuir()` já têm tabelas de histórico dedicadas (`RequestStatusHistory`, `RequestReassignmentHistory`) — não precisam de `AuditLog` duplicado.
- Não existe endpoint de exclusão de demanda hoje, então não há `EXCLUIR_DEMANDA` a implementar.
- Gravar `detalhes` (diff de campos) em qualquer um dos `EDITAR_*` existentes no projeto — é uma melhoria maior, tratada à parte se algum dia for priorizada.
- Auditoria de leitura/visualização (`buscarPorId`, `listar`) — como o diagnóstico LGPD original já observou, registrar toda visualização é mais custoso (gera muito volume) e não é o padrão esperado para um sistema deste porte; criar/editar é o que importa.

## Impacto em código existente

`auditLogRepo` como dependência obrigatória do construtor de `RequestService` exige atualizar todo lugar que o constrói diretamente:

- `backend/src/app.ts` — wiring de produção, já tem `auditLogRepo` disponível (usado por `userService`/`requestTypeService`).
- `backend/tests/unit/request-service-criar.test.ts` — 1 ponto de construção (`buildService()`).
- `backend/tests/unit/request-service-consultas.test.ts` — 5 pontos de construção (`buildService()` + 4 inline em testes que customizam `requestTypeRepo`).

Todos usam o fake já existente `createFakeAuditLogRepo()` (`backend/tests/helpers/fakes.ts`) — nenhuma fake nova precisa ser criada.

## Testes

- Testes unitários novos em `request-service-criar.test.ts` (grava `CRIAR_DEMANDA` com o `actorUserId` certo) e em `request-service-consultas.test.ts`, dentro do `describe('RequestService.editar', ...)` existente (grava `EDITAR_DEMANDA` com o `actorUserId` de quem editou, não de quem criou).
- Nenhum teste de integração novo é necessário além de confirmar que a suíte completa continua passando — o comportamento HTTP não muda (nenhuma resposta da API muda de formato), só um efeito colateral novo no banco.
