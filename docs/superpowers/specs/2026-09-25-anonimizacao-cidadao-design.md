# Anonimização de dados do cidadão — Design

## Contexto

A revisão de conformidade LGPD (`docs/superpowers/specs/2026-09-10-lgpd-revisao-conformidade.md`) apontou dois problemas dependentes um do outro:

- **Item 3**: `cloudinary-uploader.service.ts` não tem método de exclusão — uma foto, uma vez enviada, nunca pode ser removida pelo próprio sistema.
- **Item 4**: não existe nenhum caminho, nem manual, para um cidadão exercer o direito de pedir a exclusão dos próprios dados.

O item 3 é um pré-requisito técnico do item 4 — não faz sentido implementar um só sem o outro. Este documento cobre os dois juntos: uma funcionalidade completa e usável de anonimização, operada pelo chefe.

## Decisão de escopo (confirmada com o usuário)

- **Anonimizar, não excluir de verdade.** A demanda continua existindo no banco (histórico e estatística de atendimento preservados — bairro, tipo, status, datas), mas os dados que identificam a pessoa somem: nome, telefone, endereço, data de nascimento, descrição, e todas as fotos. A LGPD aceita anonimização como equivalente a exclusão para fins de atendimento ao direito do titular, e o gabinete não perde os números de atendimento que já tinha.
- **Tela dedicada**, separada do fluxo operacional de Demandas — `/painel/privacidade`, exclusiva do chefe. Evita que uma ação irreversível e sensível fique ao alcance de um clique acidental durante o uso normal do sistema.
- **Busca por telefone já existe**: `GET /demandas?solicitanteTelefone=...` já é suportado ponta a ponta no backend (`listarDemandasQuerySchema`, `RequestRepository.list()`) — não precisa de nada novo aqui, só reaproveitar no frontend.

## O que a anonimização faz, campo a campo

| Campo | Ação |
|---|---|
| `solicitanteNome` | Substituído por `"[dados removidos a pedido do titular]"` (campo obrigatório no schema, não pode virar `null`) |
| `solicitanteTelefone` | Idem |
| `descricao` | Idem |
| `solicitanteNascimento` | `null` |
| `cep`, `rua`, `numero`, `complemento`, `pontoReferencia`, `localExato` | `null` |
| `descricaoOutroAssunto` | `null` |
| `bairro`, `cidade`, `estado` | **Mantidos** — não identificam a pessoa sozinhos, e são a base das estatísticas do dashboard |
| `tituloResumido`, `requestTypeId`, `status`, `assessorResponsavelId`, `criadoPorId`, `codigoInterno`, `numeroProtocolo`, datas | **Mantidos** — sem risco de identificação, necessários pro histórico continuar íntegro |
| Fotos (`RequestPhoto`) | Todas excluídas — do banco **e** do Cloudinary |
| `PrivacyConsent` | **Não mexe** — é a prova de que houve consentimento em determinado momento; alterá-la depois destruiria seu próprio propósito |
| `InternalNote`, `Notification`, `RequestStatusHistory`, `RequestReassignmentHistory` | **Não mexe** — texto/uso interno da equipe e histórico operacional, fora do escopo desta ação |

A ação é feita demanda por demanda (não em lote) — depois de anonimizada, a demanda naturalmente some de qualquer busca futura por aquele telefone, já que o telefone não existe mais.

## Arquitetura

**`PhotoUploader`** (`backend/src/services/cloudinary-uploader.service.ts`) ganha `delete(publicId: string): Promise<void>`, usando `cloudinary.uploader.destroy` com os mesmos parâmetros usados no upload (`resource_type: 'image'`, `type: 'authenticated'` — sem isso o Cloudinary não encontra o asset, já que ele foi enviado como autenticado).

**`RequestRepository`** ganha `anonimizar(id: string): Promise<{ id: string; fotos: FotoArmazenada[] }>` — atualiza os campos da tabela `Request` conforme a tabela acima e apaga as linhas de `RequestPhoto`, numa única transação Prisma; devolve a lista de fotos apagadas (com `publicId`) para o service poder excluí-las do Cloudinary depois.

**`RequestService`** ganha `anonimizar(id: string, atorId: string, ip?: string): Promise<AnonimizarResultado>` — busca a demanda (404 se não existir), chama `requestRepo.anonimizar()`, chama `photoUploader.delete()` para cada foto devolvida, grava `ANONIMIZAR_DEMANDA` em `AuditLog` (mesmo padrão de `CRIAR_DEMANDA`/`EDITAR_DEMANDA`, sem `detalhes`).

**Rota nova**: `PATCH /demandas/:id/anonimizar`, `requireRole('CHEFE')` — mesmo padrão de outras ações administrativas.

## Frontend

Página nova `frontend/src/app/painel/privacidade/page.tsx` (wrapper `somenteChefe`, mesmo padrão de `configuracoes`/`assessores`), renderizando `<BuscaCidadao />`: campo de telefone (com a mesma máscara já usada em outros formulários), botão buscar, lista de demandas encontradas (código interno, título, status, data), e um botão "Anonimizar dados" por linha que abre um modal de confirmação explicando que a ação é irreversível antes de executar.

## Testes

- Backend: unitário do service (fluxo feliz grava auditoria e chama `photoUploader.delete` para cada foto; 404 para id inexistente), integração da rota (403 para não-chefe, 200 com os campos certos anonimizados e as fotos removidas do banco).
- Frontend: componente de busca (busca, exibe resultados, abre modal, confirma, remove da lista após sucesso).

## Fora de escopo

- Anonimização em lote (todas as demandas de um telefone de uma vez) — por ora, uma de cada vez, com confirmação individual.
- Qualquer mudança em `InternalNote`/`Notification`/tabelas de histórico.
- Prazo automático de retenção (item 5 do diagnóstico original) — esta função é sob demanda (o cidadão pede), não uma rotina automática.
