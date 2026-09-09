# Fase 5 (parte 1): Tela de Assessores — design

## Contexto

O menu (`Sidebar`/`MobileNav`) já tem um link para `/painel/assessores`, marcado como exclusivo
do chefe, mas a página nunca foi construída — só o link existe. O backend, por outro lado, já
tem quase toda a base pronta desde a Fase 1: criar usuário, listar (com filtro de papel/ativo),
mudar papel, ativar/desativar, com a proteção de nunca deixar o gabinete sem nenhum chefe ativo.
Falta só uma capacidade nova no backend (editar nome/telefone) e a página inteira no front-end.

## Acesso

Toda a tela é exclusiva de `CHEFE` — mesmo padrão já usado no dashboard e nas rotas de
`/usuarios` (que já são `requireRole('CHEFE')` desde a Fase 1).

## Layout

Uma tabela, mesmo padrão visual já usado na tabela de produtividade do dashboard
(`ProdutividadeAssessores.tsx`): colunas nome, telefone, papel, status (ativo/inativo), e uma
coluna de ações por linha.

- **Filtros** no topo, dois seletores independentes: por papel (`Todos` / `Assessor de rua` /
  `Assessor de gabinete` / `Chefe`) e por status (`Todos` / `Ativos` / `Inativos`).
- **Botão "+ Novo assessor"** no topo da tabela, abre um modal (mesmo padrão de modal já
  introduzido em `PainelDiaEscala`, da Fase 4) com campos nome, telefone e papel. Sem campo de
  PIN — a pessoa define o próprio PIN no primeiro acesso (fluxo já existente desde a Fase 1).
- **Em cada linha:**
  - Um seletor de papel — muda o papel da pessoa diretamente ao selecionar uma opção nova.
  - Um botão de ativar/desativar (texto e ação mudam conforme o status atual).
  - Um botão "Editar" que abre um modal pré-preenchido com nome e telefone atuais, para
    correção.
- Todas essas ações continuam sujeitas à proteção já existente no backend: não é possível
  desativar ou tirar o papel de chefe do único chefe ativo do gabinete (a UI deve mostrar a
  mensagem de erro que a API já retorna nesse caso, sem duplicar a regra no front-end).

## Dados

Nenhuma mudança de schema. Uma capacidade nova no backend: editar nome/telefone de um usuário
já cadastrado.

- `UserRepository`: novo método `update(id, { nome?, telefone? })`.
- `UserService`: novo método `editarAssessor`, reaproveitando a mesma validação de telefone
  (`isValidBrazilianPhone`/`normalizePhone`) e a mesma checagem de telefone duplicado já usadas
  em `criarAssessor` — mas excluindo o próprio usuário da checagem de duplicado (já que ele já
  tem aquele telefone, ou pode estar mantendo o mesmo telefone e só corrigindo o nome).
- Novo registro de auditoria (`EDITAR_USUARIO`), mesmo padrão dos demais (`CRIAR_USUARIO`,
  `ATUALIZAR_ROLE`, `ATIVAR_USUARIO`/`DESATIVAR_USUARIO`) já gravados por `AuditLogRepository`.

## API

Uma rota nova, mesmo padrão de autenticação/autorização das já existentes em `/usuarios`
(`requireRole('CHEFE')`):

- `PATCH /usuarios/:id` — corpo `{ nome?, telefone? }` (ambos opcionais, mas pelo menos um
  precisa vir preenchido). Retorna 400 para telefone em formato inválido, 409 para telefone já
  usado por outro usuário, 200 com o usuário atualizado em caso de sucesso.

As rotas já existentes (`POST /usuarios`, `GET /usuarios`, `PATCH /usuarios/:id/role`,
`PATCH /usuarios/:id/ativo`) são reaproveitadas sem nenhuma mudança.

## Front-end

- `frontend/src/app/painel/assessores/page.tsx` — página principal: busca a lista (com os
  filtros aplicados como query params, reaproveitando `GET /usuarios?role=...&ativo=...`),
  renderiza a tabela, controla qual modal está aberto (novo assessor, ou editar um específico).
- Um componente de tabela/linha reaproveitável — a decidir na fase de implementação se cabe
  num componente só (`ListaAssessores`) ou se vale separar a linha (`LinhaAssessor`) do
  container, dependendo de como o código fica mais legível.
- Um modal de criação (nome, telefone, papel) e um modal de edição (nome, telefone
  pré-preenchidos) — podem compartilhar a maior parte da estrutura visual, com o modo
  (criar vs. editar) como uma prop.

## Ordem de construção

O chefe pediu para priorizar por papel: primeiro deixar tudo funcionando para assessores de
rua, depois estender para chefe, depois para assessores de gabinete. A tela final é uma só,
tratando os três papéis de forma idêntica (o backend já não distingue entre eles para nenhuma
dessas operações) — o que muda é a ordem das tasks no plano de implementação, não a
arquitetura: primeiro a tela é construída e testada usando dados de `ASSESSOR_RUA`, depois os
mesmos componentes são testados/validados também com `CHEFE` (incluindo o caso do único chefe
ativo) e por fim com `ASSESSOR_GABINETE`.

## Testes

Mesmo padrão TDD já estabelecido, contra o Neon real:

- Backend: `UserService.editarAssessor` — corrige nome/telefone com sucesso; rejeita telefone
  em formato inválido; rejeita telefone já usado por OUTRO usuário; permite manter o mesmo
  telefone do próprio usuário (não conta como duplicado); grava o registro de auditoria.
  `PATCH /usuarios/:id` — 200 em caso de sucesso, 400/409 nos casos de erro, 403 para quem não
  é chefe.
- Front-end: tabela renderiza a lista corretamente; filtros de papel e de status aplicam o
  parâmetro certo na busca; criar um novo assessor funciona e atualiza a lista; editar
  nome/telefone funciona; mudar papel e ativar/desativar disparam a chamada certa e atualizam a
  linha; a mensagem de erro do "último chefe ativo" aparece corretamente quando a API recusa a
  ação.

## Fora de escopo desta fase

Excluir/apagar um assessor permanentemente (só desativar, que já existe). Reenvio de
PIN/redefinição de senha pelo chefe (a pessoa sempre define o próprio PIN). Histórico de
alterações visível na tela (o registro de auditoria já existe no banco, mas não há uma tela
para consultá-lo). Upload de foto de perfil. A tela de Configurações, que é um sub-projeto
separado, tratado depois desta.
