# PWA offline — Etapa 2: ver a lista de demandas sem internet — Design

## Contexto

A Etapa 1 (PR #17) permite criar demandas sem sinal. Falta poder **consultar** a lista de demandas quando o sinal cai. Só frontend, sem mudança de backend.

## Comportamento

- Quando a lista (`/painel/demandas`) carrega com sucesso **na página 1 e sem nenhum filtro**, guarda uma cópia no aparelho (`localStorage`, chave `gd:lista-demandas`): `{ usuarioId, salvaEm, items, total }`. Páginas seguintes e buscas filtradas não são guardadas.
- Se a busca falhar **por falta de rede** (erro que não é `ApiError`) e houver cópia do mesmo usuário, a tela mostra a cópia com o aviso "Sem conexão. Mostrando a lista salva em {dd/mm/aaaa hh:mm}. Filtros e outras páginas só funcionam com internet." A paginação some enquanto o aviso estiver na tela.
- Erro de resposta do servidor (`ApiError`) continua como hoje (lista vazia), sem usar a cópia.
- Sem cópia (nunca abriu a lista com sinal), continua como hoje: "Nenhuma demanda encontrada."
- A cópia só vale para o `usuarioId` que a gravou; outro usuário no mesmo aparelho não a enxerga.
- A cópia é apagada no `logout` e quando a sessão é considerada inválida (mesmos pontos em que o resumo `gd:usuario` já é apagado).
- Abrir o detalhe de uma demanda continua exigindo internet (a cópia não guarda telefone, endereço, descrição nem fotos).

## Privacidade (LGPD)

A cópia guarda, para as 20 demandas mais recentes que o usuário pode ver: título, nome do solicitante, bairro, status, tipo, assessor e datas — os mesmos dados que a lista já mostra, e nada de telefone, endereço, descrição ou fotos. Fica só no aparelho do próprio usuário e é apagada ao sair. Quando a lista é carregada de novo com sinal, a cópia é substituída (por exemplo, depois de uma anonimização).

## Testes

`lista-demandas-offline` (guardar/ler/apagar, isolamento por usuário, JSON corrompido), página de demandas (falha de rede mostra a cópia e o aviso; `ApiError` não usa a cópia; só a página 1 sem filtros é guardada; cópia de outro usuário é ignorada), `use-auth` (logout e sessão inválida apagam a cópia).

## Fora de escopo

Detalhe da demanda offline, filtros/páginas offline, cópia em IndexedDB com mais demandas, notificações.
