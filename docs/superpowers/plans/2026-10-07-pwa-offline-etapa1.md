# PWA e rascunho offline da Nova demanda (Etapa 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instalar o app no celular e guardar a "Nova demanda" no aparelho até haver sinal.

**Architecture:** Só frontend. Camada de dados em `lib/` (fila IndexedDB + sincronização), hook `useFilaOffline`, e a UI (tela nova, barra e página de pendentes, sair com confirmação). PWA via manifest + service worker simples. `AuthProvider` passa a tolerar abrir sem rede.

**Tech Stack:** Next.js 14/React/TypeScript/Tailwind; Vitest + Testing Library; `fake-indexeddb` (devDependency, só testes).

Design de referência: `docs/superpowers/specs/2026-10-07-pwa-offline-etapa1-design.md` (contém todos os valores exatos: nomes de chaves, textos, regras de cache).

## Global Constraints

- Só frontend; nenhum arquivo de `backend/` muda.
- Textos exatos: "Demanda salva no celular. Será enviada quando houver sinal."; "N demanda(s) aguardando envio"; "Nenhuma demanda pendente."; confirmação do sair e do descartar conforme a spec.
- Chaves de `localStorage`: `gd:usuario`, `gd:tipos-demanda`. IndexedDB: banco `gabinete-digital`, store `demandas-pendentes`.
- O service worker nunca cacheia chamadas à API nem métodos diferentes de GET; só é registrado em produção.
- Cada item da fila só é visto/enviado pelo `usuarioId` que o criou.
- Erro de rede = exceção que NÃO é `ApiError`; `ApiError` = o servidor respondeu.

---

### Task 1: Fila offline e sincronização (`lib/`)
**Files:** Create `frontend/src/lib/fila-offline.ts`, `fila-offline.test.ts`, `sincronizar-fila.ts`, `sincronizar-fila.test.ts`; modify `frontend/package.json` (+ `fake-indexeddb`).
- [ ] Testes + implementação conforme seções 3 e 4 da spec (sem o hook). Commit.

### Task 2: Hook e UI de pendentes
**Files:** Create `hooks/use-fila-offline.ts(x)` (+ teste), `components/BarraPendentes.tsx` (+ teste), `app/painel/demandas/pendentes/page.tsx` (+ teste); modify `app/painel/layout.tsx`, `components/BotaoSair.tsx` (+ teste).
- [ ] Seções 4 (hook) e 6 da spec. Commit.

### Task 3: Tela Nova demanda e sessão offline
**Files:** Modify `app/painel/demandas/nova/page.tsx` e seu teste, `hooks/use-auth.tsx` e seu teste.
- [ ] Seções 2 e 5 da spec. Commit.

### Task 4: PWA instalável
**Files:** Create `public/manifest.webmanifest`, `public/icons/*`, `public/sw.js`, `components/RegistrarServiceWorker.tsx` (+ teste); modify `app/layout.tsx`.
- [ ] Seção 1 da spec. Verificar com `next build` + `next start` (manifest 200, `sw.js` 200). Commit.

## Verificação final
`cd frontend && npx vitest run && npx tsc --noEmit && npx next build`.
