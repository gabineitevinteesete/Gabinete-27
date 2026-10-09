# Proteção contra demanda duplicada (chave de idempotência) — Design

## Contexto

Se o servidor grava a demanda mas a resposta se perde (sinal fraco), o app acha que falhou, guarda a demanda na fila offline e a reenvia: a demanda aparece duas vezes. Esta mudança dá a cada envio um código único para o servidor reconhecer o reenvio.

## Banco

`Request.idempotencyKey String?` (opcional) e `@@unique([criadoPorId, idempotencyKey])`. Migração `20261009000001_add_request_idempotency_key`: `ALTER TABLE "requests" ADD COLUMN "idempotencyKey" TEXT;` e `CREATE UNIQUE INDEX "requests_criadoPorId_idempotencyKey_key" ON "requests"("criadoPorId", "idempotencyKey");`. Coluna nula nas linhas antigas (no PostgreSQL, nulos não conflitam entre si). A migração precisa ser aplicada **antes** de publicar o novo backend.

## Backend

- `POST /demandas` lê o cabeçalho opcional `Idempotency-Key`. Se vier e não for um UUID, responde 400 "Cabeçalho Idempotency-Key inválido".
- `RequestService.criar` (com chave): antes de processar fotos ou subir qualquer coisa, procura uma demanda **do mesmo usuário** (`criadoPorId`) com a mesma chave (`RequestRepository.findByIdempotencyKey(criadoPorId, chave)`). Se achar, devolve essa demanda (mesma resposta 201 de sucesso) e **não** processa fotos, não sobe nada ao Cloudinary e não grava de novo a auditoria `CRIAR_DEMANDA`.
- Corrida (dois envios simultâneos com a mesma chave): o índice único faz o segundo `create` falhar com `P2002`; o serviço apaga as fotos que esse segundo envio acabou de subir (melhor esforço) e devolve a demanda já gravada pelo primeiro.
- Sem o cabeçalho, o comportamento é exatamente o de hoje.
- Outro usuário com o mesmo código cria a própria demanda (a chave é por usuário).

## Frontend

- `apiClient.request` aceita `headers` extras.
- Novo `lib/uuid.ts` (`gerarUuid`: `crypto.randomUUID` quando existir, senão UUID v4 por `getRandomValues`/`Math.random`).
- Tela "Nova demanda": gera a chave uma vez por clique em "Enviar demanda", manda no cabeçalho e, se o envio falhar por falta de rede, guarda a demanda na fila **com a mesma chave** (`adicionarPendente({ id: chave, ... })`).
- Fila offline: o `id` do item é a chave; `sincronizarFila` envia `Idempotency-Key: <id>` em cada tentativa. Itens antigos já têm `id` em formato UUID (`gerarId` passa a usar `gerarUuid`).

## Testes

Backend: unit do serviço (reenvio devolve a mesma demanda sem subir fotos nem auditar de novo; outro usuário com a mesma chave cria a sua; sem chave cria sempre; corrida `P2002` devolve a existente e apaga as fotos subidas) e integração da rota (duas chamadas com a mesma chave → mesmo id e uma só linha; chave inválida → 400; sem chave funciona). Frontend: `api-client` (cabeçalhos extras), `sincronizar-fila` (envia o id como chave), `fila-offline` (usa o id recebido), `nova/page` (cabeçalho enviado; item da fila com a mesma chave), `uuid`.

## Fora de escopo

Expirar chaves antigas, idempotência da edição de demandas, chaves em outras rotas.
