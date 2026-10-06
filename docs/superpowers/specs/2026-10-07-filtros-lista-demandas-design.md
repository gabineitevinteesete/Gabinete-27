# Busca e filtros na lista de Demandas — Design

## Contexto

`GET /demandas` já filtra por `codigoInterno`, `solicitanteNome`, `requestTypeId`, `dataInicial` e `dataFinal` (além de bairro, status e assessor), mas a tela `/painel/demandas` só expõe Bairro e Status. O gabinete não consegue achar uma demanda pelo código nem pelo nome do solicitante. Só frontend: nenhuma mudança de backend, schema ou API.

## O que muda (`frontend/src/app/painel/demandas/page.tsx`)

- Filtros novos: **Código** (texto), **Nome do solicitante** (texto), **Tipo de demanda** (lista com os tipos ativos, vindos de `GET /tipos-demanda`) e **De** / **Até** (datas).
- Os três campos de texto (Bairro, Código, Nome) usam a mesma espera de 350ms já existente no Bairro, via um hook `useDebounced` local. O primeiro fetch continua usando os valores iniciais sem espera.
- Qualquer mudança de filtro volta para a página 1.
- Período: o navegador converte as datas para o dia local inteiro antes de enviar — `dataInicial` = início do dia local (`T00:00:00`), `dataFinal` = fim do dia local (`T23:59:59.999`), ambos em ISO. Assim o "Até" inclui o dia inteiro e o backend (`z.coerce.date()`) não muda.
- Botão **Limpar filtros**, visível só quando algum filtro (bairro, código, nome, tipo, status, de, até) está preenchido; limpa todos e volta à página 1. O filtro `assessorResponsavelId` (que só vem por link do dashboard e não tem campo na tela) não conta e não é limpo.
- O assessor de rua continua vendo só as próprias demandas: a regra está no backend e os filtros novos não a contornam.

## Impacto em testes existentes

A tela passa a fazer uma chamada extra a `/tipos-demanda` ao montar. Os testes atuais de `page.test.tsx` contam chamadas a `apiClient.request` (`toHaveBeenCalledTimes`) e usam `mockResolvedValueOnce` na ordem, então quebrariam. O arquivo de teste é reescrito com dois helpers: um mock que responde por URL (`/tipos-demanda` → lista de tipos, demais → resposta de demandas) e `chamadasDemandas()`, que filtra só as chamadas que começam com `/demandas`. Os 8 testes existentes são mantidos com a mesma intenção.

## Fora de escopo

Filtro por telefone (fica na tela Privacidade), campo de filtro por assessor, paginação nova, qualquer mudança de backend.
