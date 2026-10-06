# Exportar demandas em planilha (CSV) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O chefe baixa em CSV as demandas que batem com os filtros da lista.

**Architecture:** Backend ganha `GET /demandas/exportar` (só chefe) que reaproveita `RequestService.listar()`, gera o CSV com um util novo e grava auditoria. Frontend ganha `apiClient.requestBlob` e o componente `ExportarDemandas`, usado em `demandas/page.tsx` com a mesma string de filtros da lista.

**Tech Stack:** Express/TypeScript/Vitest (backend); Next.js/React/Vitest (frontend).

Design de referência: `docs/superpowers/specs/2026-10-07-exportar-demandas-design.md` (contém colunas, limite, regras de CSV e de auditoria — valores exatos vêm de lá).

## Global Constraints

- Só o chefe exporta: `requireRole('CHEFE')` na rota e botão oculto para outros papéis.
- `LIMITE_EXPORTACAO = 5000`; mensagem de erro exata: `Muitos resultados (N). O limite é de 5000 linhas; refine os filtros.`
- Colunas, nesta ordem: `Código;Título;Tipo;Status;Bairro;Solicitante;Assessor responsável;Criada em`. Sem telefone/endereço/descrição.
- CSV: separador `;`, `\r\n`, BOM `﻿`, proteção contra fórmula (`=`, `+`, `-`, `@`, tab, CR → prefixo `'`).
- Auditoria: `acao: 'EXPORTAR_DEMANDAS'`, `detalhes: { quantidade }` (sem filtros), só em caso de sucesso.
- Testes de integração usam o Neon real (rodar o arquivo isolado; reexecutar se houver falha de conexão).

---

### Task 1: Backend — rota de exportação

**Files:**
- Create: `backend/src/utils/csv.ts`, `backend/tests/unit/csv.test.ts`, `backend/tests/unit/request-service-exportar.test.ts`
- Modify: `backend/src/utils/request-status.ts` (`STATUS_ROTULO`), `backend/src/services/request.service.ts` (`exportar`), `backend/src/validators/request.validators.ts` (`exportarDemandasQuerySchema`), `backend/src/controllers/request.controller.ts` (`exportar`), `backend/src/routes/request.routes.ts`, `backend/tests/integration/request.routes.test.ts`

- [ ] **Step 1:** Escrever os testes (util CSV: célula simples, `;`/aspas/quebra de linha entre aspas, fórmula com `'`, BOM e `\r\n`; service: CSV com cabeçalho e linha, auditoria sem filtros, `limite_excedido` sem auditoria e sem arquivo, filtro de status; rota: 403 assessor, 401 sem token, 200 chefe com `text/csv`, BOM, código da demanda, sem telefone, e linha `EXPORTAR_DEMANDAS` no `auditLog`).
- [ ] **Step 2:** Implementar util, `STATUS_ROTULO` (mesma tabela de `frontend/src/lib/request-status.ts`, com comentário de sincronia), service, validator, controller e rota (`/exportar` antes de `/:id`).
- [ ] **Step 3:** Rodar `cd backend && npx vitest run tests/unit/csv.test.ts tests/unit/request-service-exportar.test.ts tests/integration/request.routes.test.ts` e `npx tsc --noEmit`.
- [ ] **Step 4:** Commit `feat(backend): rota de exportacao de demandas em CSV (so chefe)`.

### Task 2: Frontend — botão Exportar planilha

**Files:**
- Modify: `frontend/src/services/api-client.ts`, `frontend/src/services/api-client.test.ts`, `frontend/src/app/painel/demandas/page.tsx`, `frontend/src/app/painel/demandas/page.test.tsx`
- Create: `frontend/src/components/ExportarDemandas.tsx`, `frontend/src/components/ExportarDemandas.test.tsx`

- [ ] **Step 1:** `api-client`: extrair `fetchComRenovacao` (refresh em 401) usado por `request` e pelo novo `requestBlob`; testes: blob com token, refresh em 401, erro com mensagem do backend.
- [ ] **Step 2:** `ExportarDemandas` + testes (oculto para não-chefe; clique chama `requestBlob('/demandas/exportar?<filtros>')` e dispara o download `demandas-AAAA-MM-DD.csv`; botão desabilitado e "Exportando…" durante; erro em texto vermelho).
- [ ] **Step 3:** `page.tsx`: montar `filtros` no render e usar em fetch + `<ExportarDemandas filtros={filtros} />`; `page.test.tsx`: mockar o componente expondo `data-filtros` e testar que a string não tem `pagina`/`tamanhoPagina` e reflete os filtros.
- [ ] **Step 4:** `cd frontend && npx vitest run && npx tsc --noEmit`.
- [ ] **Step 5:** Commit `feat(frontend): botao Exportar planilha na lista de demandas (chefe)`.
