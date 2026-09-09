# Fase 2 — Demandas + fotos: design

## Contexto

Fase 1 (Fundação) está completa e mergeada: autenticação por telefone+PIN, papéis
(`CHEFE`, `ASSESSOR_RUA`, `ASSESSOR_GABINETE`), gestão de assessores, e o schema Prisma
completo (incluindo `Request`, `RequestPhoto`, `RequestType`, `RequestStatusHistory`,
`InternalNote`, `Notification`, `PrivacyConsent`, já modelados desde a Fase 1). O banco
Neon (dev + teste) está configurado e com a primeira migração aplicada; os 85 testes do
backend passam contra Postgres real.

Esta fase entrega o núcleo do produto: o assessor cadastra uma demanda pelo celular
(com fotos) e ela fica disponível para consulta. Fica fora do escopo desta fase: fluxo
completo de status/protocolo/observações internas (Fase 3), PWA offline (Fase 4),
notificações in-app (Fase 4), relatórios/dashboard agregado (Fase 3).

## Arquitetura

### Upload de fotos — mediado pelo backend

As fotos NÃO vão direto do navegador para o Cloudinary. Fluxo:

1. Front-end envia as fotos (multipart/form-data) para o backend em uma única chamada
   atômica, junto com os dados da demanda (ver "API" abaixo).
2. Backend valida cada arquivo: tipo real do conteúdo (magic bytes, não só a extensão
   ou o `Content-Type` declarado pelo cliente), tamanho máximo, quantidade (2 a 4).
   Arquivos que não sejam JPG/PNG/WebP são rejeitados; qualquer coisa que pareça um
   executável é rejeitada antes mesmo de checar o tipo de imagem.
3. Backend remove metadados EXIF (principalmente geolocalização) antes do upload.
4. Backend envia a imagem processada ao Cloudinary usando a API secret (nunca exposta
   ao navegador) e recebe `url` + `public_id`.
5. Backend grava em `request_photos` apenas `url`, `public_id` e metadados (dimensões,
   bytes) — nunca a imagem em si, nunca base64 no Postgres.

Motivo da escolha: a spec original exige validação no back-end e remoção de EXIF: fazer
o upload passar pelo backend é a forma direta de garantir as duas coisas, em vez de
confiar em transformações client-side ou em regras de um upload preset do Cloudinary.

### CEP — direto do navegador

Consulta ao ViaCEP acontece no front-end (`fetch` direto para
`https://viacep.com.br/ws/{cep}/json/`), sem passar pelo backend — é uma API pública,
sem autenticação, e não há dado sensível envolvido na consulta em si.

### Dados

O schema já existe (Fase 1). Nenhuma migração de schema é necessária nesta fase — só
migrações de dados não se aplicam (não há dados legados). Se algum ajuste pontual for
necessário durante a implementação (ex: um índice adicional), entra como migração
incremental.

## Permissões

- `ASSESSOR_RUA`, `ASSESSOR_GABINETE` e `CHEFE` podem criar demandas.
- `ASSESSOR_RUA` só lista/visualiza as demandas que ele mesmo criou.
- `ASSESSOR_GABINETE` e `CHEFE` listam/visualizam todas as demandas.
- `ASSESSOR_RUA` só edita (corrige) as demandas que ele mesmo criou, e só enquanto
  ainda não foram protocoladas. `ASSESSOR_GABINETE` e `CHEFE` editam qualquer demanda,
  em qualquer status.
- Não existe exclusão de demandas nesta fase (nem para assessor de rua, que a
  especificação original já proíbe explicitamente, nem para os demais papéis) —
  arquivamento fica para a Fase 3, junto com o resto do fluxo de status.
- A filtragem por "dono" é aplicada no backend (na query), nunca só escondida no
  front-end.

## Fluxo e status inicial

Com internet disponível (não há modo offline nesta fase — isso é Fase 4), o formulário
cria a demanda diretamente com status `ENVIADA` — não existe uma etapa manual de
"salvar rascunho, depois enviar". O status `RASCUNHO` do enum fica reservado para o
salvamento local da Fase 4 (PWA offline).

## API

Todas as rotas abaixo exigem autenticação (`authenticate`); a listagem/detalhe também
aplicam a regra de "dono" para `ASSESSOR_RUA`.

- `GET /tipos-demanda` — lista assuntos ativos (`RequestType.ativo = true`), para
  popular o seletor do formulário. Sem restrição de papel (qualquer usuário autenticado).
- `POST /demandas` — chamada única, atômica, `multipart/form-data`, com os campos da
  demanda E de 2 a 4 arquivos de foto na mesma requisição. Não existe um segundo passo
  de "anexar fotos depois": como 2–4 fotos é um requisito de uma demanda válida, criar
  a demanda sem elas (por exemplo se uma segunda chamada falhasse no meio do caminho)
  deixaria um registro inválido no banco — a validação de quantidade/tipo das fotos
  acontece ANTES de qualquer escrita no banco, e o upload ao Cloudinary só é feito
  depois que os dados textuais já passaram na validação Zod; a criação do `Request` e
  dos `RequestPhoto` correspondentes acontece em uma transação Prisma. Se o upload ao
  Cloudinary falhar no meio (ex: 3 de 4 imagens enviadas), nada é gravado no banco e o
  cliente recebe erro — o front-end mantém as fotos localmente para o usuário tentar
  de novo, sem perder o que já preencheu. Validação Zod cobre todos os campos
  obrigatórios da spec original (solicitante, telefone, endereço, tipo, título,
  descrição, autorização de dados) e os opcionais (nascimento, complemento, ponto de
  referência). Quando o tipo selecionado for "Outros", a descrição do assunto passa a
  ser obrigatória (regra já prevista no campo `exigeDescricaoObrigatoria` de
  `RequestType`). Gera `codigoInterno` automaticamente. `assessorResponsavelId` vem do
  usuário autenticado (nunca do corpo da requisição). Status inicial `ENVIADA`.
- `GET /demandas` — lista paginada no servidor (nunca carrega tudo de uma vez). Filtros:
  código, solicitante, telefone, assunto, bairro, assessor, status, data inicial/final,
  protocolo (o campo de protocolo fica vazio nesta fase, mas o filtro já existe no
  schema/rota, pronto para a Fase 3 popular).
- `GET /demandas/:id` — detalhe completo, incluindo galeria de fotos. Observações
  internas (`internal_notes`) não existem ainda nesta fase (ficam para a Fase 3) — o
  campo simplesmente não aparece na resposta ainda.
- `PATCH /demandas/:id` — corrige os dados de uma demanda já criada (mesmos campos do
  cadastro, exceto fotos — editar fotos fica fora desta fase). Regra de permissão:
  - `ASSESSOR_RUA`: só edita demandas que ele mesmo criou, e só enquanto o status ainda
    não é `PROTOCOLADA` (nem posterior) — corresponde a "corrigir uma demanda enquanto
    ela ainda não tiver sido protocolada" da especificação original.
  - `ASSESSOR_GABINETE` e `CHEFE`: editam qualquer demanda, em qualquer status — já é
    responsabilidade descrita do assessor de gabinete "conferir e corrigir dados".
  Tentativa de editar fora dessas regras retorna 403.

## Front-end

- `/painel/demandas/nova` — formulário de cadastro. Campos exatamente como listados na
  spec original (nome, telefone com máscara brasileira, nascimento opcional, CEP com
  autofill via ViaCEP, rua/bairro/cidade/estado preenchidos automaticamente e
  editáveis, número manual, complemento opcional, ponto de referência opcional, local
  exato do problema, tipo de demanda em chips, título resumido, descrição, upload de
  2–4 fotos com câmera ou galeria, checkbox de autorização de uso dos dados, aviso de
  privacidade). Botões grandes, mobile-first.
- `/painel/demandas` — lista com filtros e paginação no servidor.
- `/painel/demandas/[id]` — detalhe com galeria de fotos. Mostra um botão "Editar"
  quando o usuário logado tem permissão (ver regra de permissão acima), que leva para
  `/painel/demandas/[id]/editar`.
- `/painel/demandas/[id]/editar` — reaproveita os mesmos campos e componentes do
  formulário de cadastro (exceto fotos), pré-preenchidos com os dados atuais.
- Componentes novos: seletor de tipo (chips), input de CEP com estado de
  carregando/erro/preenchido, uploader de fotos (câmera/galeria, prévia, remover,
  substituir, compressão client-side antes do envio para reduzir o tamanho do
  multipart).

### Direção visual desta fase

Usa os tokens de cor já definidos no `tailwind.config.ts` da Fase 1 — nenhuma cor nova
é criada. O rosa (`secondary`, já usado em `Button.tsx` variant="secondary") passa a
ser a cor de ação principal nas telas de demanda (botão "Enviar demanda", chip do tipo
selecionado); o azul (`primary`) fica para elementos informativos (ícones, bordas de
chip não selecionado, badge de endereço confirmado pelo CEP). Fotos em grade estilo
Instagram (preview grande + miniaturas + botão de adicionar). Mockup aprovado durante o
brainstorming desta fase.

## Testes

Mesmo padrão TDD da Fase 1, agora já podendo rodar de verdade contra o Neon:

- Unitários: validação de CEP (formato), compressão/validação de tipo de arquivo,
  geração de `codigoInterno`, regra de "Outros exige descrição".
- Integração: criação de demanda (campos obrigatórios, regra do "Outros"), upload de
  fotos (2–4, rejeição de tipo inválido/executável, rejeição de quantidade fora da
  faixa), listagem com paginação e cada filtro, checagem de permissão (assessor de rua
  não vê demanda de outro assessor de rua; gabinete/chefe veem todas), edição (assessor
  de rua corrige a própria demanda antes de protocolada; é barrado depois de
  protocolada e ao tentar editar demanda de outro assessor de rua; gabinete/chefe
  editam qualquer demanda em qualquer status).

## Fora de escopo desta fase

Exclusão de demandas (nenhum papel apaga demandas — nem nesta fase, nem depois; a
especificação original só prevê arquivamento pelo chefe, que é Fase 3), edição de
fotos já enviadas, fluxo de status além de `ENVIADA` (protocolar, andamento, concluir,
etc.), observações internas, notificações, exportação em PDF, dashboard/relatórios
agregados, PWA offline.
