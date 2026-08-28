# Fase 1 — Fundação: design

## Contexto

Sistema "Gabinete Digital": substitui formulários de papel usados por assessores de um
gabinete parlamentar durante atendimentos de rua. Projeto novo e independente (não
reaproveita o projeto anterior em `gabinetedigital-app`, que usava Supabase — esta versão
usa Neon + Prisma + Express, conforme decisão do usuário).

Entrega dividida em 5 fases, cada uma com spec → plano → implementação própria:

1. **Fundação** (este documento) — schema completo, autenticação, papéis, estrutura de pastas.
2. Demandas + fotos — formulário, ViaCEP, upload Cloudinary, listagem/filtros/paginação.
3. Painel, status e relatórios — dashboard, fluxo de status/histórico, observações internas, PDF.
4. PWA offline + notificações — rascunho local, sincronização, notificações internas.
5. Deploy + testes finais — Vercel, Render, Neon, Cloudinary, seeds, testes, README.

Esta fase entrega apenas autenticação e a fundação de dados/infra. Nenhuma tela ou rota de
demandas é implementada aqui — mas o schema Prisma já nasce completo (todas as entidades),
para evitar migrações dolorosas depois.

## Arquitetura

Monorepo com duas pastas independentes na raiz:

- `frontend/` — Next.js (App Router) + TypeScript. Deploy: Vercel.
- `backend/` — Node.js + Express + TypeScript. Deploy: Render. Consome PostgreSQL via Prisma.

O frontend nunca acessa o banco diretamente — só fala com a API REST do backend via
`NEXT_PUBLIC_API_URL`. Banco: PostgreSQL no Neon. Fotos (fases futuras): Cloudinary.

### Backend — estrutura de pastas

```
backend/src/
  routes/        # definição de rotas por domínio (auth.routes.ts, users.routes.ts, ...)
  controllers/   # recebe request/response, chama services
  services/      # regras de negócio (authService, userService)
  middlewares/   # auth (JWT), role guard, error handler, rate limit
  validators/    # schemas Zod por rota
  repositories/  # acesso a dados via Prisma (isola o Prisma do resto da app)
  config/        # env, cliente Prisma, cliente Cloudinary (fase futura)
  utils/         # hash de PIN, geração/verificação de JWT, IP extraction
  prisma/        # schema.prisma, migrations/, seed.ts
```

### Frontend — estrutura de pastas

```
frontend/src/
  app/                # rotas (App Router): /login, /painel, /assessores, ...
  components/         # componentes reutilizáveis (Button, Card, StatusBadge, ...)
  services/           # cliente da API (fetch wrapper com refresh automático)
  hooks/               # useAuth, useUser, etc.
  lib/                 # helpers (máscara de telefone, formatação)
  types/               # tipos compartilhados com o backend (papéis, status)
```

Layout com menu lateral (desktop) e menu inferior/hambúrguer (mobile), protegido por papel:
rotas administrativas (`/assessores`, `/assuntos`, `/configuracoes`) só renderizam para
`chefe`; o restante da UI de demandas (fases futuras) varia por papel.

## Modelo de dados (schema Prisma completo)

Todas as entidades da spec original entram no schema desde já, mesmo que só `users`,
`refresh_tokens`, `login_attempts` e `audit_logs` tenham rotas de API nesta fase:

- **users** — id (uuid), nome, telefone (único, formato E.164 normalizado), pinHash,
  role (enum: `CHEFE`, `ASSESSOR_RUA`, `ASSESSOR_GABINETE`), ativo (bool), pinDefinido (bool —
  falso até o primeiro acesso), createdAt, updatedAt. Índice único em telefone.
- **refresh_tokens** — id, userId (FK), tokenHash, expiresAt, revokedAt (nullable), createdByIp.
  Um refresh token comprometido/expirado nunca é reaproveitado (rotação a cada uso).
- **login_attempts** — id, telefone, sucesso (bool), ip, userAgent, createdAt. Usado para
  bloqueio progressivo e auditoria de acesso.
- **audit_logs** — id, actorUserId (FK nullable), acao (string), entidade, entidadeId,
  detalhes (json), ip, createdAt. Nunca grava PIN nem tokens.
- **request_types** (assuntos) — id, nome, ativo (bool), exigeDescricaoObrigatoria (bool,
  true só para "Outros"). Seed inicial com a lista de assuntos da spec.
- **requests, request_photos, request_status_history, internal_notes, notifications,
  privacy_consents** — modelados conforme a spec original (campos de endereço, fotos,
  status enum, histórico, notificações, consentimento LGPD), sem rotas de API ainda —
  entram em uso nas Fases 2–4.

Convenções: UUID em todas as PKs, `createdAt`/`updatedAt` com timezone em todas as tabelas,
exclusão lógica (`ativo`/`arquivadoEm`) em vez de DELETE físico onde a spec pede retenção
(users, request_types, requests).

## Autenticação

- Login: telefone + PIN de 6 dígitos. Sem e-mail em nenhum fluxo.
- PIN armazenado com Argon2id. Nunca texto puro, nunca nos logs.
- Primeiro acesso: chefe cadastra nome + telefone + papel; usuário criado com
  `pinDefinido = false`; no primeiro login, telefone é aceito mas o backend exige a
  criação de um PIN novo antes de emitir tokens.
- Validação de PIN: rejeita sequências óbvias (`123456`, `000000`, `111111`, ... todos os
  10 dígitos repetidos, sequências crescentes/decrescentes de 6).
- JWT access token de curta duração (15 min) + refresh token opaco (rotativo, armazenado
  com hash no banco, 7 dias). Refresh também confere `ativo = true` no usuário a cada uso —
  usuário desativado perde acesso imediatamente, mesmo com token ainda não expirado.
- Bloqueio: 5 tentativas incorretas consecutivas (por telefone) bloqueiam login por 15
  minutos; login correto zera o contador.
- Logout revoga o refresh token atual.
- Troca de PIN: exige PIN atual + novo PIN válido.
- Recuperação de acesso: só o chefe pode disparar (endpoint autorizado por papel) —
  marca o usuário para redefinição de PIN no próximo login (mesmo fluxo do primeiro acesso).
- Todo login (sucesso ou falha) grava IP, user-agent e timestamp em `login_attempts`;
  ações administrativas (criar/editar/desativar usuário, resetar acesso) gravam em
  `audit_logs`.

## Segurança e validação

- Helmet, CORS restrito a `FRONTEND_URL`, rate limiting mais agressivo no endpoint de
  login, limite de payload JSON, validação de entrada com Zod em toda rota.
- Tratamento de erros centralizado (middleware único), respostas padronizadas
  (`{ success, data | error }`), sem stack trace exposto em produção.
- Nenhum dado pessoal ou token em log.

## Fora de escopo desta fase

Formulário de demandas, upload de fotos, ViaCEP, dashboard, listagem/filtros de demandas,
PWA offline, notificações in-app, relatórios, exportação PDF. O schema já suporta essas
entidades; as rotas e telas vêm nas fases seguintes.

## Testes desta fase

- Login: sucesso, PIN incorreto, telefone inexistente, usuário inativo.
- Bloqueio após 5 tentativas e liberação após a janela.
- Criação de usuário pelo chefe (telefone duplicado deve falhar).
- Primeiro acesso: criação de PIN, rejeição de PIN óbvio.
- Troca de PIN (PIN atual incorreto deve falhar).
- Recuperação de acesso disparada pelo chefe.
- Rotação/revogação de refresh token; token de usuário desativado deixa de funcionar.
- Guard de papel: rota exclusiva do chefe rejeita assessor.
