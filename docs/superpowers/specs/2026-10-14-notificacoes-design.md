# Notificações no app (sino) — Design

## Contexto

A tabela `notifications` existe desde a Fase 1 (`userId`, `requestId?`, `tipo`, `mensagem`, `lida`, `createdAt`, índice `userId+lida`), mas nenhum código a usa. Esta funcionalidade avisa as pessoas, dentro do app, de eventos que mudam o trabalho delas. Sem mudança de schema.

## Quando um aviso é criado (backend)

| Evento | Quem recebe | Texto | `tipo` |
|---|---|---|---|
| Demanda criada | cada **chefe ativo**, exceto quem criou | `Nova demanda GD-XXXX registrada.` | `DEMANDA_NOVA` |
| Demanda reatribuída | o **novo responsável**, se não foi ele quem reatribuiu | `Você recebeu a demanda GD-XXXX.` | `DEMANDA_REATRIBUIDA` |
| Status alterado | o **responsável atual**, se não foi ele quem alterou | `A demanda GD-XXXX passou para "Em andamento".` | `STATUS_ALTERADO` |

- Ninguém é avisado da própria ação. Reatribuir para quem já é o responsável (no-op) não avisa.
- O texto leva só o código interno e o rótulo do status (mesma tabela `STATUS_ROTULO`). **Nunca** nome, telefone, endereço nem o motivo digitado pelo assessor: o aviso é aberto para ver o que mudou, e quem precisa do detalhe abre a demanda.
- Os avisos são criados **depois** da ação principal dar certo. Se criar o aviso falhar, a ação principal continua válida e o erro só vai para o log (`console.error`).
- Demanda anonimizada: os avisos antigos continuam (só têm código e status).

## API

Todas exigem login; cada pessoa só enxerga e altera os **próprios** avisos.

- `GET /notificacoes` → `{ items: [{ id, requestId, tipo, mensagem, lida, createdAt }], naoLidas }`: os 30 mais recentes (mais novos primeiro) e a contagem total de não lidos.
- `PATCH /notificacoes/lidas` → marca todos os meus como lidos.
- `PATCH /notificacoes/:id/lida` → marca um como lido; 404 se não existir ou for de outra pessoa.

## Frontend

- Componente `SinoNotificacoes` no topo do painel (desktop e celular): sino com contador vermelho de não lidos (`9+` acima de 9).
- Busca ao montar, a cada 60 segundos, quando a aba volta a ficar visível e quando o aparelho volta a ter rede. Sem rede, falha em silêncio e mantém o que já mostrava.
- Ao clicar no sino abre a lista (últimos 30). Cada aviso mostra o texto, o tempo ("há 5 min") e um ponto nos não lidos. Clicar em um aviso o marca como lido e abre a demanda (`/painel/demandas/{requestId}`). "Marcar todas como lidas" limpa o contador. Lista vazia: "Nenhum aviso por enquanto."
- Fecha ao clicar fora ou com Esc.

## Testes

Backend: unit do `NotificacaoService` (quem recebe em cada evento, ninguém avisado da própria ação, chefes inativos ignorados, texto sem dados pessoais) e do `RequestService` (dispara depois da ação, falha do aviso não derruba a ação); integração das rotas (isolamento por pessoa, marcar um/todos, 404, 401, fluxo real criar/mudar status/reatribuir gerando avisos). Frontend: `SinoNotificacoes` (contador, abrir/fechar, clicar abre a demanda e marca lida, marcar todas, falha de rede silenciosa, polling).

## Fora de escopo

Push no celular, e-mail/WhatsApp, apagar avisos, preferências de aviso, avisos de observação interna.
