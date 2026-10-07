# PWA e rascunho offline da "Nova demanda" (Etapa 1) — Design

## Contexto

O assessor de rua registra demandas na rua, onde o sinal pode falhar. Hoje, sem internet, o envio da "Nova demanda" falha e o assessor perde o que digitou e as fotos. Esta etapa permite instalar o app no celular e guardar a demanda no aparelho até haver sinal. A Etapa 2 (consultar a lista offline) fica para depois. Só frontend: nenhuma mudança de backend, schema ou API.

## 1. App instalável (PWA)

- `public/manifest.webmanifest`: `name` "Gabinete Digital", `short_name` "Gabinete", `start_url` `/painel`, `display` `standalone`, `theme_color` `#163A82`, `background_color` `#F4F6FA`, ícones 192 e 512 (PNG, gerados uma vez a partir de um SVG simples e commitados em `public/icons/`).
- `app/layout.tsx`: `metadata.manifest`, `viewport.themeColor` e ícone da Apple.
- Service worker `public/sw.js`, registrado por um componente `RegistrarServiceWorker` **só em produção** (em desenvolvimento atrapalha o hot reload):
  - `/_next/static/*` e `/icons/*`: cache primeiro (os nomes dos arquivos têm hash, então nunca ficam velhos).
  - Navegação (páginas): rede primeiro; se a rede falhar, devolve a última versão guardada da página, ou, na falta dela, a do `/painel`. Respostas de página só entram no cache quando OK.
  - Qualquer outra requisição (chamadas à API, outros domínios, métodos que não sejam GET) **nunca** passa pelo cache: vai direto à rede.
  - Versão do cache no nome (`gd-v1`); ao ativar, apaga caches antigos.

## 2. Sessão ao abrir sem internet

Hoje, ao abrir o app sem rede, a renovação da sessão falha e o usuário é mandado para o login. Em `AuthProvider`:

- Ao carregar o usuário com sucesso (`/auth/me`), guarda um resumo em `localStorage` (`gd:usuario`: o próprio objeto `PublicUser`, sem token).
- Se a renovação falhar por **erro de rede** (não por resposta HTTP do servidor), usa o usuário guardado e segue offline. Se o servidor responder erro (por exemplo 401), a sessão é considerada inválida e o resumo é apagado.
- `logout` apaga o resumo.
- O resumo não contém credencial: o token de acesso continua só em memória e as chamadas à API continuam exigindo sessão válida.

## 3. Fila de demandas pendentes (`lib/fila-offline.ts`)

IndexedDB, banco `gabinete-digital`, store `demandas-pendentes`. Cada item: `id`, `usuarioId`, `criadoEm`, `campos` (os mesmos campos de texto que a tela envia, como `Record<string, string>`), `fotos` (`Blob[]` já comprimidos), `tentativas`, `ultimoErro` (texto do servidor quando a demanda foi recusada, senão `null`).

API: `adicionarPendente`, `listarPendentes(usuarioId)`, `removerPendente(id)`, `marcarErro(id, mensagem)`, `limparErro(id)`. Cada pessoa só enxerga e envia os itens do próprio `usuarioId`.

## 4. Sincronização (`lib/sincronizar-fila.ts` + hook `useFilaOffline`)

- `sincronizarFila(usuarioId)`: para cada pendente do usuário **sem erro**, monta o `FormData` (mesmos campos e `fotos` com os nomes `foto-N.jpg`) e faz `POST /demandas`:
  - sucesso → `removerPendente`;
  - `ApiError` (o servidor recusou, por exemplo validação) → `marcarErro` com a mensagem, e o item deixa de ser reenviado sozinho;
  - erro de rede → para a rodada e mantém tudo como está.
  Uma rodada por vez (trava contra execução simultânea).
- `useFilaOffline()`: expõe `pendentes`, `sincronizando`, `sincronizarAgora()`, `descartar(id)` e `tentarDeNovo(id)` (limpa o erro e sincroniza). Dispara a sincronização ao montar, no evento `online` e a cada 30 segundos enquanto houver pendentes.

## 5. Tela "Nova demanda"

- Se o envio falhar por **erro de rede** (não `ApiError`) ou `navigator.onLine` for falso, a demanda vai para a fila em vez de mostrar erro: o formulário é limpo e aparece o aviso "Demanda salva no celular. Será enviada quando houver sinal." com link para os pendentes.
- Os tipos de demanda carregados com sucesso são guardados em `localStorage` (`gd:tipos-demanda`); se o carregamento falhar por rede, usa essa cópia.
- Erros do servidor (`ApiError`) continuam aparecendo na tela como hoje, sem entrar na fila.

## 6. Pendentes na interface

- Barra no painel (`BarraPendentes`, no `PainelLayout`): aparece só quando há pendentes do usuário. Texto "N demanda(s) aguardando envio" + link para `/painel/demandas/pendentes`.
- Página `/painel/demandas/pendentes`: lista cada pendente (título, nome do solicitante, data) com o estado "Aguardando sinal" ou "Recusada: {mensagem}". Botão "Enviar agora" geral; nos itens recusados, "Tentar de novo" e "Descartar" (com `window.confirm`). Quando a fila esvazia, mostra "Nenhuma demanda pendente."
- **Sair com pendentes:** `BotaoSair` pede confirmação ("Há N demanda(s) não enviada(s) neste aparelho. Elas continuam salvas e serão enviadas quando você entrar de novo. Sair mesmo assim?").

## Privacidade (LGPD)

Enquanto a demanda está na fila, nome, telefone, endereço e fotos ficam guardados no aparelho do assessor (IndexedDB). Eles são apagados do aparelho assim que o servidor confirma o recebimento ou quando o assessor descarta o item. Cada item fica ligado ao usuário que o criou e só ele o vê/envia.

## Limitações conhecidas (aceitas)

- Se o servidor receber a demanda mas a resposta se perder, o reenvio pode criar uma demanda duplicada (não há chave de idempotência no backend). O chefe pode apagar/arquivar a duplicada.
- Edição de demandas existentes e mudança de status continuam exigindo internet.
- O cache de páginas só funciona depois da primeira visita online, e só em produção (`next build`/`next start`).

## Testes

`fila-offline` (adicionar/listar por usuário/remover/marcar erro, usando `fake-indexeddb`), `sincronizar-fila` (sucesso remove, `ApiError` marca erro e segue, erro de rede para a rodada, ignora itens com erro e de outro usuário), `use-auth` (erro de rede usa o usuário guardado; 401 limpa; logout limpa), `nova/page` (erro de rede enfileira e mostra o aviso; `ApiError` não enfileira; tipos vêm do cache), `BarraPendentes`, página de pendentes, `BotaoSair` (confirmação), `RegistrarServiceWorker` (não registra fora de produção).

## Fora de escopo

Consultar demandas offline (Etapa 2), editar offline, notificações, sincronização em segundo plano com o app fechado (Background Sync), chave de idempotência no backend.
