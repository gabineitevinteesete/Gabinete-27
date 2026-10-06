# Ajustes da tela Privacidade e menu mobile — Design

## Contexto

Pacote pequeno, só frontend, que fecha pendências deixadas pela anonimização de dados do cidadão (PR #12) e uma lacuna do menu mobile:

- Achados Minor da revisão final da anonimização: (a) a busca por telefone mostra no máximo 20 resultados (`tamanhoPagina` default do backend) sem avisar, mesmo recebendo `total` na resposta; (b) o guard `if (anonimizandoId) return;` bloqueia qualquer clique enquanto uma linha processa, mas só o botão da própria linha fica `disabled`, então clicar em outra linha não faz nada e não dá feedback.
- `Configurações` e `Privacidade` (ambas só do chefe) aparecem apenas no `Sidebar` desktop; o `MobileNav` não tem nenhuma das duas.

Sem mudança de backend, de schema ou de contrato de API.

## Tela Privacidade (`frontend/src/components/BuscaCidadao.tsx`)

- Guardar `total` (vindo da resposta da busca) em estado, junto com `resultados`.
- Quando `total` for maior que a quantidade de itens exibidos, mostrar uma nota acima da tabela: `Mostrando {itens} de {total} demandas. Anonimize estas e busque de novo para ver as demais.` (depois de anonimizar, a demanda deixa de casar com o telefone, então uma nova busca traz as seguintes). Quando `total` for igual à quantidade exibida, nenhuma nota.
- Ao anonimizar com sucesso, além de remover a linha, decrementar `total` em 1, para a nota continuar correta.
- Todos os botões "Anonimizar dados" ficam `disabled` enquanto `anonimizandoId !== null` (não só o da própria linha). O texto "Anonimizando…" continua aparecendo só na linha em processamento.

## Menu mobile

A barra inferior já tem 5 itens (Painel, Demandas, Escala, Dashboard, Equipe) mais "Sair". Adicionar dois itens a deixaria com 8, apertada em tela pequena. Em vez disso:

- `MobileNav.tsx` ganha um item **"Mais"** (`somenteChefe: true`) apontando para `/painel/mais`.
- Nova página `frontend/src/app/painel/mais/page.tsx`, com a mesma proteção das outras telas do chefe (mensagem "Acesso restrito ao chefe." para outros papéis) e dois links de destaque em cartões: **Configurações** (`/painel/configuracoes`) e **Privacidade** (`/painel/privacidade`).
- `Sidebar.tsx` não muda (já tem os dois itens diretos).

## Testes

- `BuscaCidadao.test.tsx`: nota de truncamento aparece quando `total` > itens; não aparece quando iguais; `total` decrementa após anonimizar; com duas linhas, durante o processamento de uma, o botão da outra fica `disabled`.
- `mais/page.test.tsx`: chefe vê os dois links; não-chefe vê a mensagem de acesso restrito.
- `MobileNav` não tem teste hoje; este pacote adiciona um teste mínimo (`MobileNav.test.tsx`): chefe vê "Mais", assessor não vê.

## Fora de escopo

- Paginação real na busca de privacidade (próxima/anterior): a nota + nova busca resolve o caso de uso sem isso.
- Política de retenção automática (depende de definição jurídica de prazos).
- Qualquer alteração no `Sidebar.tsx`.
