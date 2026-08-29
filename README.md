# Gabinete Digital

Sistema web para gerenciamento de demandas de um gabinete parlamentar, substituindo os
formulários de papel preenchidos pelos assessores durante atendimentos de rua.

Este repositório é construído em fases. Specs e planos de cada fase ficam em
[`docs/superpowers/`](docs/superpowers).

- Fase 1 (esta) — Fundação: schema completo, autenticação por telefone+PIN, papéis.
- Fase 2 — Demandas + fotos (ViaCEP, Cloudinary, listagem/filtros).
- Fase 3 — Painel, status e relatórios.
- Fase 4 — PWA offline + notificações.
- Fase 5 — Deploy em produção (Vercel + Render + Neon + Cloudinary) e testes finais.

## Estrutura

- `backend/` — API REST em Node.js + Express + TypeScript + Prisma.
- `frontend/` — Next.js (App Router) + TypeScript + Tailwind CSS.

## Rodando localmente

Pré-requisitos: Node.js LTS, uma conexão com um banco PostgreSQL (Neon ou local).

Este projeto ainda não tem um banco de dados configurado. Escolha uma opção:

- **Neon** (recomendado, mesma tecnologia da produção): crie um projeto em
  [console.neon.tech](https://console.neon.tech), use a branch padrão (`main`) como
  banco de desenvolvimento, e crie uma segunda branch (ex: `test`) para os testes.
  Copie as duas connection strings.
- **Postgres local**: use qualquer instância PostgreSQL 14+ já instalada (ou via Docker,
  se disponível: `docker run -e POSTGRES_PASSWORD=gabinete -p 5432:5432 postgres:16-alpine`),
  criando dois bancos (dev e teste).

Depois:

1. Backend:
   ```bash
   cd backend
   cp .env.example .env   # cole a connection string de dev em DATABASE_URL e gere segredos JWT aleatórios
   npm install
   npx prisma migrate dev --name init   # cria as migrações e aplica no banco de dev
   npx tsx prisma/seed.ts               # cria os assuntos iniciais
   npm run dev                          # http://localhost:3001
   ```
2. Frontend (em outro terminal):
   ```bash
   cd frontend
   cp .env.example .env
   npm install
   npm run dev                          # http://localhost:3000
   ```
3. Acesse `http://localhost:3000` — você será redirecionado para `/login`.

### Criando o primeiro chefe

Igual descrito no seed: rode com as três variáveis de ambiente definidas.

```bash
cd backend
SEED_CHEFE_TELEFONE="+5534999990000" SEED_CHEFE_NOME="Seu Nome" SEED_CHEFE_PIN="482913" npx tsx prisma/seed.ts
```

Nunca use esses dados em produção com um PIN previsível — troque o PIN pelo próprio sistema assim que possível.

## Rodando os testes

```bash
# backend — parte roda sem banco (services com fakes, utils), parte precisa de DATABASE_URL
# apontando para o banco de teste (nunca o de dev/produção)
cd backend && DATABASE_URL="<connection string do banco de TESTE>" npm test

# frontend — não depende de backend nem de banco
cd frontend && npm test
```

**Estado atual (fim da Fase 1):** nenhum banco foi configurado neste ambiente de
desenvolvimento ainda. Todo o código do backend foi implementado e verificado via
`tsc --noEmit` e testes unitários com repositórios falsos (in-memory); os testes de
integração que dependem de um Postgres real estão escritos mas não foram executados.
Antes do primeiro uso real, configure um `DATABASE_URL` (Neon ou local), rode
`npx prisma migrate dev --name init` para gerar e aplicar a primeira migração, e então
rode a suíte de testes de integração do backend para confirmar que tudo passa contra um
banco de verdade.

## Dívida técnica conhecida

- **`next@14.2.x` com 2 advisories de severidade alta e sem correção na linha 14.x.** A única
  remediação é o upgrade major para Next 15/16, que está fora do escopo da Fase 1. Decisão
  deliberada de adiar (não é um descuido): reavaliar e fazer o upgrade em uma fase posterior,
  antes do deploy de produção da Fase 5.

## Variáveis de ambiente

Ver `backend/.env.example` e `frontend/.env.example`. Em produção (Fase 5), `DATABASE_URL`
aponta para o Neon, `CLOUDINARY_*` para o Cloudinary, e `FRONTEND_URL`/`NEXT_PUBLIC_API_URL`
para os domínios reais na Vercel e no Render.

Nessa topologia o frontend e o backend ficam em domínios diferentes, então `COOKIE_SAME_SITE`
precisa ser `"none"` em produção — com `"lax"` o navegador não envia o cookie de refresh nas
chamadas cross-site e o login não sobrevive a um reload.

## Privacidade e LGPD

O texto definitivo do aviso de privacidade e a base legal para tratamento de dados devem ser
revisados pelo responsável jurídico ou encarregado de proteção de dados da Câmara antes de
qualquer uso com dados reais. Esta fase não coleta dados de solicitantes — isso começa na
Fase 2.
