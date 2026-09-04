# Fase 3 (parte 2) — Observações internas: design

## Contexto

Fase 3 (parte 1) está completa e mergeada: fluxo de status/protocolo (receber,
conferir, pedir informação, protocolar, andamento, concluir, recusar, arquivar) e
reatribuição de demanda entre assessores pelo chefe. Falta, do que ficou mapeado no
spec da Fase 2, dois sub-projetos independentes: observações internas (este
documento) e dashboard/relatórios agregados (fica pra depois).

Esta fase entrega uma forma de a equipe do gabinete deixar anotações numa demanda
que não são visíveis ao munícipe nem ao assessor de rua — coisas como "liguei pra
prefeitura, disseram que vai demorar 2 semanas" ou "conferir com o vereador antes de
protocolar". O schema Prisma já tem o modelo `InternalNote` desde a Fase 1
(`id`, `requestId`, `autorId`, `texto`, `createdAt`), nunca usado até agora — só
falta um campo para marcar edição.

## Permissões

- `ASSESSOR_GABINETE` e `CHEFE` podem criar observações em qualquer demanda, em
  qualquer status (não há restrição de "só antes de protocolada" — a mesma
  liberdade que já têm para editar dados da demanda).
- `ASSESSOR_RUA` não tem acesso a observações internas: nem lista, nem detalhe
  individual, em nenhuma demanda (nem nas próprias). A regra de "dono" da Fase 2 não
  se aplica aqui — é bloqueio total por papel, igual à reatribuição da Fase 3
  (parte 1), não uma regra de propriedade.
- Editar e apagar uma observação são exclusivos de quem a escreveu — mesmo um
  `CHEFE` não edita nem apaga a nota de outra pessoa. Tentativa de editar/apagar a
  nota de outro autor retorna 403.
- Toda regra de permissão é aplicada no backend, nunca só escondida no front-end.

## Dados

Uma migração incremental adiciona `updatedAt` ao modelo já existente:

```prisma
model InternalNote {
  id        String    @id @default(uuid())
  requestId String
  request   Request   @relation(fields: [requestId], references: [id])
  autorId   String
  autor     User      @relation("InternalNoteAuthor", fields: [autorId], references: [id])
  texto     String
  createdAt DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt DateTime? @db.Timestamptz(3)

  @@index([requestId])
  @@map("internal_notes")
}
```

`updatedAt` fica nulo enquanto a nota nunca foi editada (não usa `@updatedAt`
automático do Prisma, que atualizaria em qualquer `update` — aqui o campo só deve
mudar quando o texto de fato muda, e sua presença/ausência já indica ao front-end se
mostra "editado em" ou não). Apagar uma observação é exclusão real da linha — não
existe estado de "removida mas guardada" nesta fase.

## API

Todas as rotas abaixo exigem autenticação; a regra de "só gabinete/chefe" e "só o
autor edita/apaga" da seção acima se aplica.

- `POST /demandas/:id/observacoes` — corpo `{ texto: string }` (não vazio). Cria a
  observação com `autorId` do usuário autenticado (nunca do corpo da requisição).
  403 para `ASSESSOR_RUA`. 404 se a demanda não existe.
- `GET /demandas/:id/observacoes` — lista as observações da demanda, mais recente
  primeiro, com o nome do autor. 403 para `ASSESSOR_RUA`. 404 se a demanda não
  existe.
- `PATCH /demandas/:id/observacoes/:notaId` — corpo `{ texto: string }` (não vazio).
  Só o autor da nota; 403 para qualquer outro usuário (incluindo `CHEFE`). Grava
  `updatedAt`. 404 se a nota não existe ou não pertence à demanda do `:id` da URL.
- `DELETE /demandas/:id/observacoes/:notaId` — só o autor da nota; 403 para qualquer
  outro usuário. 404 se a nota não existe ou não pertence à demanda do `:id` da URL.

## Front-end

Nova seção **"Observações internas"** na tela de detalhe da demanda
(`/painel/demandas/[id]`), visível só quando `user.role` é `ASSESSOR_GABINETE` ou
`CHEFE` (mesma condição já usada para mostrar as ações de status) — para
`ASSESSOR_RUA`, a seção inteira não aparece.

- Lista de notas, mais recente primeiro: autor, data (e "editado em" quando
  `updatedAt` não é nulo), texto.
- Em cada nota escrita pelo usuário logado (comparando `autorId` com o usuário
  autenticado): botões "Editar" e "Apagar". Em notas de outros autores, nenhum dos
  dois aparece.
- "Editar" troca a nota para um modo inline com uma caixa de texto pré-preenchida e
  botões "Salvar"/"Cancelar".
- "Apagar" remove a nota após confirmação (o mesmo padrão de confirmação simples já
  usado em ações destrutivas no projeto).
- Campo de texto simples no final da seção para escrever uma nova observação, com
  botão de enviar.

## Testes

Mesmo padrão TDD já estabelecido, contra o Neon real:

- Unitário: validação de texto não vazio nos schemas Zod de criar/editar.
- Integração: criar observação (autorId vem do usuário autenticado, não do corpo);
  listar (ordem mais recente primeiro, inclui nome do autor); editar (autor
  consegue, outro usuário do gabinete recebe 403, `CHEFE` também recebe 403 se não
  for o autor, grava `updatedAt`); apagar (autor consegue, outro usuário recebe
  403); `ASSESSOR_RUA` recebe 403 em todas as quatro rotas; 404 para demanda ou nota
  inexistente.
- Front-end: seção não aparece para `ASSESSOR_RUA`; aparece para gabinete/chefe;
  botões de editar/apagar só na própria nota; fluxo de criar, editar e apagar.

## Fora de escopo desta fase

Notificar alguém quando uma observação é criada (fica para a Fase 4, junto do resto
de notificações). Anexos ou formatação rica no texto da observação (só texto
simples). Histórico de edições de uma nota (o campo `updatedAt` mostra que foi
editada, mas não guarda o texto anterior — diferente do histórico de status, que
guarda cada transição). Observações visíveis ao assessor de rua ou ao munícipe.
Limite de caracteres no texto (mesmo padrão já usado em `descricao`/`motivo`,
sem limite artificial além do payload HTTP).
