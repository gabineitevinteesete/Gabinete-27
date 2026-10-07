# Exportar demandas em planilha (CSV) — Design

## Contexto

Com os filtros da lista de Demandas (PR #15), o chefe consegue achar um conjunto de demandas, mas não consegue levá-lo para fora do sistema (reunião, relatório, Excel). Esta funcionalidade adiciona a exportação do resultado filtrado em CSV.

## Backend

- Nova rota `GET /demandas/exportar`, **só `CHEFE`** (`requireRole('CHEFE')`), declarada antes de `/:id`. Aceita os mesmos filtros de `GET /demandas` (`listarDemandasQuerySchema` sem `pagina`/`tamanhoPagina`).
- `RequestService.exportar(filtro, atorId, ip?, limite = LIMITE_EXPORTACAO)` reaproveita `listar()` (com o chefe como usuário, o que mantém a normalização do telefone) pedindo até `limite` linhas. `LIMITE_EXPORTACAO = 5000`. Se `total > limite`, devolve `{ status: 'limite_excedido', total }` e não gera arquivo nem auditoria; o controller responde 400 com `Muitos resultados (N). O limite é de 5000 linhas; refine os filtros.`
- Em caso de sucesso grava `AuditLog` (`acao: 'EXPORTAR_DEMANDAS'`, `entidade: 'Request'`, `detalhes: { quantidade }`, `actorUserId`, `ip`). Os filtros **não** vão para `detalhes` (podem conter nome de cidadão).
- Colunas (nesta ordem): `Código`, `Título`, `Tipo`, `Status` (rótulo em português, igual à tela), `Bairro`, `Solicitante`, `Assessor responsável`, `Criada em` (`dd/mm/aaaa`, fuso America/Sao_Paulo). **Sem telefone, endereço, descrição nem fotos.** Demandas anonimizadas saem com o texto de dados removidos, sem tratamento extra.
- Util `utils/csv.ts`: separador `;`, quebra de linha `\r\n`, BOM UTF-8 no início (Excel abre com acentos corretos), células com `;`, `"` ou quebra de linha entre aspas (aspas duplicadas), e proteção contra injeção de fórmula: célula que começa com `=`, `+`, `-`, `@`, tab ou CR recebe `'` na frente.
- Resposta: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="demandas-AAAA-MM-DD.csv"`.

## Frontend

- `apiClient.requestBlob(path, { auth })`: GET autenticado que devolve `Blob`, com a mesma renovação de token em 401 do `request` (a lógica de refresh é extraída para um helper interno compartilhado). Erros viram `ApiError` com a mensagem do backend.
- Novo componente `ExportarDemandas` (`{ filtros: string }`): botão **Exportar planilha**, só para o chefe (`useAuth`). Ao clicar: `GET /demandas/exportar?{filtros}`, baixa o arquivo `demandas-AAAA-MM-DD.csv` (data local) via link temporário; durante o download o botão fica desabilitado ("Exportando…"); erro aparece em texto vermelho abaixo do botão.
- `demandas/page.tsx`: os parâmetros de filtro (sem `pagina`/`tamanhoPagina`) passam a ser montados no render em uma string `filtros`; o fetch da lista usa `pagina` + `filtros`, e o botão de exportar recebe a mesma `filtros` — a planilha corresponde ao que está na tela (valores já aplicados após o debounce).

## Testes

Backend: unit do util CSV (escape, fórmula, BOM, separador); unit do `exportar` (CSV com cabeçalho e linha, auditoria sem filtros, limite excedido sem auditoria, filtro de status respeitado); integração da rota (403 para assessores, 401 sem token, 200 com `text/csv` e linha da demanda para o chefe, 400 de limite não é testado em integração). Frontend: `api-client` (requestBlob com refresh e erro), `ExportarDemandas` (oculto para não-chefe, download, erro, botão desabilitado), `page.test` (a string de filtros chega ao componente).

## Fora de escopo

Gráficos, PDF, envio agendado, exportar telefone/endereço, exportar para assessores.
