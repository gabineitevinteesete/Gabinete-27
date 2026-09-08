# Fase 3 (parte 3) — Dashboard do chefe: design

## Contexto

Fase 3 (parte 1: fluxo de status/reatribuição; parte 2: observações internas) está
completa e mergeada. Falta o terceiro sub-projeto mapeado desde o início da Fase 3: um
painel de resumo, exclusivo do chefe, com uma visão agregada de como as demandas estão
distribuídas e um relatório mensal de produtividade dos assessores de rua.

## Acesso

Toda a tela (os 4 blocos de resumo e o relatório mensal) é visível **só para `CHEFE`**.
Nenhum outro papel — nem `ASSESSOR_GABINETE`, nem `ASSESSOR_RUA` — tem acesso a nenhuma
parte desta tela nem às suas rotas de API.

## Layout

Grade 2x2 no computador (vira lista empilhada verticalmente no celular, mesmo padrão
responsivo já usado no resto do sistema), com os 4 blocos de resumo, e uma seção
separada abaixo com o relatório mensal de produtividade.

Blocos 1-3 usam barras de progresso (mostrando o tamanho relativo de cada categoria) e
cada número é clicável, levando para `/painel/demandas` já com o filtro aplicado
(`status`, `bairro` ou `assessorResponsavelId` — os três já existem como filtros na
listagem desde a Fase 2/3). O bloco 4 é uma lista de itens, não uma barra.

Direção visual: mesmos tokens de cor já usados no resto do sistema (`primary` azul,
`secondary` rosa), nenhuma cor nova.

## Os 4 blocos de resumo

1. **Status das demandas** — contagem de todas as demandas por status (todos os 10
   valores do enum, inclusive `CONCLUIDA`/`ARQUIVADA`/`RECUSADA` — é a visão do funil
   completo, não só do que está em aberto).
2. **Demandas por bairro** — contagem só das demandas **em aberto** (status fora de
   `CONCLUIDA`, `ARQUIVADA`, `RECUSADA`), agrupadas por `bairro`.
3. **Carga por assessor responsável** — contagem só das demandas **em aberto**,
   agrupadas por `assessorResponsavelId` (quem está responsável *agora* — inclui
   assessores de rua e de gabinete, já que qualquer um pode ser o responsável atual
   depois de uma reatribuição).
4. **Demandas paradas** — lista (não contagem) das demandas em aberto cuja **última
   mudança de status** foi há 2 dias ou mais. "Última mudança de status" é a data do
   registro mais recente em `RequestStatusHistory` daquela demanda; se a demanda nunca
   mudou de status (ainda no primeiro status, sem nenhuma linha de histórico), usa a
   própria data de criação da demanda. Cada item da lista mostra código, título,
   assessor responsável, status atual e há quantos dias está parada, com link direto
   para `/painel/demandas/[id]`.

## Relatório mensal de produtividade dos assessores de rua

Seção separada, com um seletor de mês (padrão: mês atual). Mostra uma tabela: uma linha
por `ASSESSOR_RUA` ativo, uma coluna por status, células com a contagem de demandas
**criadas por aquele assessor naquele mês**, e uma coluna de total ao final de cada
linha. Assessores de gabinete e o chefe não aparecem nesta tabela, mesmo que também
possam criar demandas.

**Regra importante de atribuição:** a contagem é de **quem criou** a demanda
originalmente — se ela for reatribuída depois para outra pessoa (função já existente da
Fase 3 parte 1), continua contando para quem a criou, nunca para quem passou a ser o
responsável atual. Isso é uma métrica de produtividade de quem está em campo enviando
demandas, não de quem está processando-as depois.

## Dados

O schema atual não distingue "quem criou a demanda" de "quem é responsável agora" — os
dois são o mesmo campo (`assessorResponsavelId`), e `reatribuir` sobrescreve esse valor.
Para o relatório de produtividade funcionar corretamente mesmo depois de uma
reatribuição, é necessário um campo novo e permanente:

```prisma
model Request {
  // ... campos existentes ...
  criadoPorId  String
  criadoPor    User    @relation("RequestCriadoPor", fields: [criadoPorId], references: [id])
  // ...
}
```

Esse campo é preenchido uma única vez, na criação da demanda (mesmo valor que
`assessorResponsavelId` tinha nesse momento), e nunca é alterado por `reatribuir`.

**Migração de dados para linhas já existentes:** como demandas já podem ter sido
reatribuídas antes desta fase (a função já está em produção), preencher `criadoPorId`
simplesmente copiando o `assessorResponsavelId` atual daria o dono errado para qualquer
demanda que já foi reatribuída pelo menos uma vez. Isso exige duas migrações Prisma em
sequência, não uma só:

1. **Primeira migração:** adiciona `criadoPorId` como coluna **opcional**
   (`criadoPorId String?` no schema, sem `@relation` obrigatória ainda) — só a
   alteração de schema, sem tocar em dado nenhum.
2. **Backfill:** um script (rodado uma vez, via SQL cru dentro da própria migração ou
   como um passo separado antes da migração seguinte) preenche `criadoPorId` de cada
   `Request` já existente:
   - Se houver pelo menos uma linha em `RequestReassignmentHistory` para aquela
     demanda, usa o `assessorAnteriorId` da linha **mais antiga** (a primeira
     reatribuição sempre parte de quem criou).
   - Se não houver nenhuma linha de reatribuição, usa o `assessorResponsavelId` atual
     (nunca foi reatribuída, então o responsável atual já é quem criou).
3. **Segunda migração:** depois que todo `Request` já tem `criadoPorId` preenchido,
   uma segunda migração torna a coluna obrigatória (`criadoPorId String`, sem `?`) e
   adiciona a `@relation` completa mostrada acima. A partir daqui, `criadoPorId` do
   `RequestRepository.create()` deixa de aceitar nulo.

As três etapas rodam em sequência, uma vez, como parte da mesma task de implementação
— não é um processo contínuo nem precisa ser repetido.

## API

Todas as rotas abaixo exigem `requireRole('CHEFE')` — 403 para qualquer outro papel.

- `GET /dashboard/resumo` — retorna os dados dos 4 blocos numa única resposta: contagem
  por status (todas), contagem por bairro (só em aberto), contagem por assessor
  responsável (só em aberto, com nome), e a lista de demandas paradas (só em aberto,
  há 2+ dias sem mudança de status, com código/título/assessor/status/dias parada).
- `GET /dashboard/produtividade-assessores?mes=YYYY-MM` — retorna, para cada
  `ASSESSOR_RUA` ativo, a contagem de demandas que ele **criou** naquele mês
  (`criadoPorId` = o assessor, `createdAt` dentro do mês), agrupada por status, mais o
  total. `mes` no formato `YYYY-MM`; sem o parâmetro, usa o mês atual.

## Front-end

- `/painel/dashboard` — nova página, visível só quando `user.role === 'CHEFE'` (redireciona
  ou nem aparece no menu para os demais papéis, mesma lógica já usada para esconder
  ações restritas ao chefe em outras telas).
- Componente da grade de blocos 1-3 (barras de progresso, números clicáveis) e um
  componente separado para o bloco 4 (lista de itens parados).
  Componente separado para a tabela de produtividade (seletor de mês + tabela).

## Testes

Mesmo padrão TDD já estabelecido, contra o Neon real:

- Unitário: cálculo de "dias parada" (usa o histórico mais recente, ou `createdAt`
  quando não há histórico); agrupamento por status/bairro/assessor.
- Integração: `GET /dashboard/resumo` retorna os 4 blocos corretos com dados reais
  (inclusive confirmando que demandas finalizadas somem do bloco de bairro/assessor mas
  aparecem no bloco de status); `GET /dashboard/produtividade-assessores` conta
  corretamente por `criadoPorId` mesmo após uma reatribuição, respeita o filtro de mês,
  e não inclui gabinete/chefe na tabela; ambas as rotas retornam 403 para
  `ASSESSOR_GABINETE`/`ASSESSOR_RUA`.
- Migração de dados: teste confirmando que uma demanda reatribuída tem `criadoPorId`
  igual ao assessor original, não ao atual, após a migração de backfill.

## Fora de escopo desta fase

Exportar o relatório em PDF/planilha (fica para uma fase futura, se for pedido).
Gráficos além de barras de progresso (pizza, linha do tempo). Comparação entre meses
(só um mês por vez). Filtro de período nos blocos 1-4 (esses são sempre "agora",
diferente do relatório de produtividade que é histórico por mês). Mural de avisos do
dia e calendário de escala dos assessores (ideia registrada separadamente, não faz
parte deste sub-projeto).
