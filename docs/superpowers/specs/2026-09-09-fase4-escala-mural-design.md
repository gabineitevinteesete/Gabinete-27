# Fase 4: Escala e mural do gabinete — design

## Contexto

Fase 3 (fluxo de status/reatribuição, observações internas, dashboard do chefe) está
completa e mergeada. Esta é a primeira parte da Fase 4: uma tela de escala/mural onde
o chefe organiza, dia a dia, quem dos assessores fica no gabinete e quem vai pra rua, e
todo mundo consegue ver essa organização.

Ideia originalmente registrada como duas coisas separadas ("mural de avisos do dia" +
"calendário de escala"), mas na conversa de brainstorming ficou definido que são a
mesma tela: o calendário É o mural — a tela abre já mostrando o mês atual com o dia de
hoje em destaque, então funciona tanto como "o que tá rolando hoje" quanto como
planejamento de dias futuros.

## Acesso

- **Visualizar:** qualquer papel autenticado (`CHEFE`, `ASSESSOR_GABINETE`,
  `ASSESSOR_RUA`) — navega o calendário livremente, qualquer mês, qualquer dia.
- **Editar:** só `CHEFE`. Ninguém mais pode alterar a escala de nenhum dia.

## Escopo dos assessores

A escala vale para **qualquer assessor**, seja normalmente `ASSESSOR_RUA` ou
`ASSESSOR_GABINETE` — o papel do usuário não restringe onde ele pode ser escalado num
dia específico (ex: um assessor de gabinete pode ser escalado pra rua num dia, e
vice-versa). O `CHEFE` não entra na escala — não é escalado, só organiza.

## Regras da escala

- Por dia, cada assessor pode estar em um de dois lugares: **Gabinete** ou **Rua**.
- Um assessor que não aparece na escala de um dia está, implicitamente, de folga
  naquele dia — **não existe um status explícito de "folga"/"férias"**. Ausência da
  lista já significa isso.
- Edição é **dia por dia** — o chefe abre um dia, marca cada assessor, salva. Não há
  edição em lote (marcar vários dias de uma vez para a mesma pessoa fica fora de
  escopo desta fase).
- O chefe pode editar **qualquer dia**, passado, presente ou futuro, a qualquer
  momento — não existe um prazo ou trava por data.
- Editar um dia **substitui inteiramente** a escala daquele dia (não é um
  adicionar/remover incremental) — o chefe vê a lista de assessores ativos, marca a
  situação de cada um (Gabinete / Rua / não escalado), e salva o dia inteiro de uma
  vez.

## Layout

Uma página nova, `/painel/escala`, visível no menu para todos os papéis (diferente do
`/painel/dashboard`, que é exclusivo do chefe).

- **Grade de calendário mensal**, mesmo padrão visual do resto do sistema. Ao abrir a
  página, mostra o mês atual, com o dia de hoje visualmente destacado (borda ou fundo
  diferenciado). Setas ou seletor para navegar entre meses.
- Cada célula de dia mostra um resumo compacto de quem está escalado: a contagem de
  cada local (ex: "3 gabinete · 2 rua"). Um dia sem nenhuma escala mostra a célula sem
  esse resumo (só o número do dia).
- **Clicar em um dia** abre um modal com a lista completa: quem está no gabinete, quem
  está na rua, para aquele dia.
  - Para `CHEFE`: o painel é editável — uma lista de todos os assessores ativos
    (`ASSESSOR_RUA` e `ASSESSOR_GABINETE`), com um controle por pessoa (ex: seletor
    com "Não escalado" / "Gabinete" / "Rua"), pré-preenchido com o estado atual daquele
    dia, e um botão de salvar.
  - Para os demais papéis: o painel é só leitura, mesma informação, sem controles de
    edição.

## Dados

Uma tabela nova, guardando a escala de cada assessor em cada dia:

```prisma
enum LocalEscala {
  GABINETE
  RUA
}

model DutyRosterEntry {
  id        String      @id @default(uuid())
  data      DateTime    @db.Date
  userId    String
  user      User        @relation(fields: [userId], references: [id])
  local     LocalEscala
  createdAt DateTime    @default(now()) @db.Timestamptz(3)
  updatedAt DateTime    @updatedAt @db.Timestamptz(3)

  @@unique([data, userId])
  @@index([data])
}
```

- `@@unique([data, userId])` garante que um assessor só tem uma entrada por dia (não
  pode estar em gabinete E rua no mesmo dia).
- Um dia sem nenhuma entrada não tem nenhuma linha nesta tabela — não é preciso
  representar "folga" explicitamente.

## API

- `GET /escala?mes=YYYY-MM` — qualquer papel autenticado. Retorna a escala de todo o
  mês, agrupada por dia, com nome de cada assessor e seu local. Formato de resposta
  (exemplo):
  ```json
  {
    "dias": {
      "2026-09-15": [
        { "userId": "...", "userNome": "Ana", "local": "GABINETE" },
        { "userId": "...", "userNome": "Beto", "local": "RUA" }
      ]
    }
  }
  ```
  Dias sem nenhuma escala simplesmente não aparecem no objeto `dias` (o front-end
  trata a ausência como "ninguém escalado nesse dia").
- `PUT /escala/:data` — só `CHEFE` (`requireRole('CHEFE')`), `:data` no formato
  `YYYY-MM-DD`. Corpo da requisição: lista de atribuições
  (`{ atribuicoes: [{ userId, local }] }`). Substitui inteiramente a escala daquele
  dia — remove todas as entradas existentes daquele dia e cria as novas, numa
  transação. Rejeita com 400 qualquer `userId` que pertença a um usuário com papel
  `CHEFE` ou que esteja inativo — só assessores ativos (`ASSESSOR_RUA` ou
  `ASSESSOR_GABINETE`) podem ser escalados.

## Testes

Mesmo padrão TDD já estabelecido, contra o Neon real:

- Repositório: listar a escala de um mês (agrupamento por dia correto); substituir a
  escala de um dia (remove o que existia antes, cria o que foi enviado); um dia sem
  nenhuma entrada não aparece na resposta de listagem.
- Rotas: `GET /escala` acessível por todos os papéis autenticados; `PUT /escala/:data`
  retorna 403 para `ASSESSOR_GABINETE`/`ASSESSOR_RUA`; validação do formato de `:data`
  e do corpo da requisição.
- Front-end: renderização do calendário com o mês atual e o dia de hoje destacado;
  clique em um dia abre o painel correto; painel editável só aparece para `CHEFE`;
  salvar um dia dispara a chamada `PUT` correta e atualiza a tela.

## Fora de escopo desta fase

Status de folga/férias explícito (ausência já basta). Edição em lote de múltiplos
dias de uma vez. Padrões recorrentes (ex: "toda segunda, fulano é escalado pra rua").
Granularidade de horário dentro do dia (ex: "gabinete de manhã, rua à tarde") — a
escala é só um valor por dia, por pessoa. Notificações/avisos push quando a escala
muda. O chefe entrar na própria escala.
