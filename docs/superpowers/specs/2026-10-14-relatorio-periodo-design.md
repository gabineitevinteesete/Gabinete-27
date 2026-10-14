# Relatório por período (PDF) — Design

## Contexto

O chefe já tem o dashboard (situação de hoje) e a exportação em planilha. Falta um **relatório de período** para apresentar ou arquivar: quantas demandas entraram entre duas datas e como elas se distribuem. Gera PDF pelo próprio navegador (imprimir → "Salvar como PDF"), sem biblioteca nova.

## Backend

- `GET /dashboard/relatorio?de=AAAA-MM-DD&ate=AAAA-MM-DD`, só `CHEFE` (já protegido pelo `router.use(auth, soChefe)` do dashboard).
- Validação (zod): `de` e `ate` obrigatórios no formato `AAAA-MM-DD` e datas reais; `ate >= de`; período de no máximo 366 dias (inclusive). Erro → 400 com mensagem em português.
- Período em horário de Brasília (UTC-3, sem horário de verão desde 2019): início = `de` 00:00 (-03:00), fim exclusivo = dia seguinte a `ate` 00:00 (-03:00). Conta as demandas **criadas** (`createdAt`) nesse intervalo.
- Resposta (`data`): `{ de, ate, total, porStatus, porTipo, porBairro, porAssessor }`.
  - `porStatus`: todos os status na ordem do fluxo (mesmo as zeradas) com `{ status, quantidade }` — status **atual** das demandas criadas no período.
  - `porTipo`, `porBairro` (nulo vira "Sem bairro"), `porAssessor` (responsável atual): `{ nome..., quantidade }`, do maior para o menor, só quantidade > 0.
- Só números e nomes de tipo/bairro/assessor: **sem** dados de cidadãos. Não grava auditoria (nada pessoal sai).

## Frontend

- Página `/painel/relatorio` (só chefe; outros veem "Acesso restrito ao chefe."): campos **De** e **Até** (padrão: do dia 1º do mês atual até hoje), busca ao mudar quando o período é válido; mensagens de período inválido/grande demais; carregando e erro.
- Conteúdo: título "Relatório de demandas", período por extenso, total, e quatro tabelas (Por status, Por tipo, Por bairro — 15 maiores e "Outros" somados —, Por assessor), com rodapé "Gerado em {data e hora} por {nome do chefe}".
- Botão **Imprimir / salvar em PDF** (`window.print()`). Estilo de impressão (`print:`): some a barra lateral, o menu do celular, o sino e a barra de pendentes, e os controles da página; sem fundo colorido, tabelas com bordas simples, quebra de página evitada dentro das tabelas.
- Acesso: item "Relatório" no menu lateral (chefe) e cartão em `/painel/mais` (celular).

## Testes

Backend: unit do período (limites de dia em UTC-3, 1 dia, virada de mês/ano), validador (formato, `ate < de`, mais de 366 dias, datas inexistentes como 31/02) e integração da rota (403 para não chefe, 401, contagens corretas com demandas dentro e fora do intervalo, na fronteira da meia-noite de Brasília, "Sem bairro", ordem e zeros em `porStatus`). Frontend: página (restrição ao chefe, busca com o período padrão, período inválido sem chamada, tabelas, "Outros" nos bairros, botão de impressão chama `window.print`), item no menu e cartão em `/painel/mais`.

## Fora de escopo

Gráficos, filtros extras (tipo, bairro), comparação entre períodos, geração de PDF no servidor, envio por e-mail.
