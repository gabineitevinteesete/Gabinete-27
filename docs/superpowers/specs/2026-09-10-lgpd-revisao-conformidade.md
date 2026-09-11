# Revisão de Conformidade LGPD — Gabinete Digital

> Este documento é um **diagnóstico**, não um plano de implementação. Ele descreve o que existe hoje no sistema, o que a LGPD (Lei Geral de Proteção de Dados, Lei 13.709/2018) espera, e onde há distância entre os dois — com uma recomendação de urgência para cada ponto. Não é parecer jurídico: para decisões que tenham peso legal (ex: se o consentimento atual é juridicamente válido), vale consultar um advogado ou o responsável jurídico da Câmara/gabinete. O objetivo aqui é dar a você, como responsável técnico, uma visão clara de onde agir.

**Contexto:** o sistema guarda dados de cidadãos que fazem solicitações ao gabinete — nome, telefone, data de nascimento, endereço completo, descrição do pedido e fotos do problema relatado (buraco na rua, etc.). Isso é dado pessoal na definição da LGPD, e em alguns casos pode incluir dado sensível (ex: se a descrição ou foto revelar informação de saúde). O sistema também guarda dados dos próprios assessores/chefe (nome, telefone).

**Como o sistema é usado:** quem preenche o cadastro da demanda é o **assessor** (logado no sistema), não o cidadão diretamente — o assessor visita a rua, atende o telefone, ou recebe o pedido, e registra os dados em nome do cidadão. Isso importa para a seção de Consentimento abaixo.

---

## Resumo executivo

| Tema | Situação | Urgência |
|---|---|---|
| Consentimento | Existe um checkbox, mas o texto que ele referencia não existe em lugar nenhum, e a tabela feita pra guardar a versão do consentimento nunca é usada | **Alta** |
| Direitos do titular (acesso, correção, exclusão) | Não existe nenhuma forma do cidadão pedir pra ver, corrigir ou apagar os próprios dados | **Alta** |
| Retenção e descarte | Dados nunca são apagados ou anonimizados — nem depois de "arquivada" a demanda | **Média** |
| Fotos em serviço de terceiro (Cloudinary) | Bem protegidas contra acesso externo, mas não podem ser apagadas pelo sistema | **Média** |
| Trilha de acesso aos dados do cidadão | Auditoria existe para ações administrativas (usuários, escala, tipos de demanda), mas não para criar/ver/editar uma demanda de um cidadão | **Média** |
| Controle de acesso entre papéis | Assessor de rua só vê as próprias demandas; chefe e assessor de gabinete veem tudo | Ponto forte — nenhuma ação necessária |
| Minimização de dados | Os campos coletados (endereço completo, data de nascimento) parecem justificados pela finalidade | Baixa — revisar se `solicitanteNascimento` é realmente necessário |
| Encarregado de dados (DPO) | Não é uma questão de código — é a Câmara que precisa nomear formalmente essa pessoa | Fora do escopo técnico, mas vale avisar |

---

## 1. Consentimento

**O que existe hoje:** ao criar uma demanda, o assessor marca um checkbox: *"Autorizo o uso e armazenamento dos dados desta demanda pelo gabinete, conforme o aviso de privacidade."* Isso vira o campo `Request.autorizacaoDados` (um `true`/`false` simples) e é obrigatório para enviar o formulário (`frontend/src/app/painel/demandas/nova/page.tsx`).

**Dois problemas concretos:**

1. **O "aviso de privacidade" citado no texto não existe em lugar nenhum do sistema.** Nem como página, nem como documento, nem como link. O checkbox promete transparência que a aplicação não entrega — quem está registrando a demanda (o assessor) também não tem o que mostrar ao cidadão se ele perguntar "que aviso é esse?".
2. **A tabela `PrivacyConsent`** (que guardaria `autorizado` + `textoVersao` — ou seja, exatamente o texto do consentimento que a pessoa aceitou, versionado) **existe no banco de dados mas nunca é escrita por nenhum código.** Foi criada na Fase 1 e nunca conectada a nada. Hoje, se o texto do checkbox mudar no futuro, não haverá como provar qual versão um cidadão específico aceitou em determinada data — só existe o `true`/`false` atual, sem histórico.

**Nuance importante:** como é o assessor (não o cidadão) quem marca o checkbox, esse consentimento tecnicamente representa "o assessor afirma que o cidadão autorizou" — não um clique do próprio titular dos dados. Isso não invalida o processo (LGPD aceita consentimento verbal/presencial documentado por quem atende), mas é mais frágil como prova do que um consentimento assinado pelo próprio cidadão. Se algum dia questionado, o gabinete precisaria confiar na palavra do assessor.

**Recomendação:** escrever o aviso de privacidade real (o que é coletado, pra que serve, por quanto tempo fica guardado, com quem pode ser compartilhado, como pedir exclusão) e publicá-lo em algum lugar acessível (uma página no próprio sistema, ou impresso/lido pelo assessor no atendimento). Conectar o `PrivacyConsent` de verdade, gravando a versão do texto aceito a cada demanda.

---

## 2. Direitos do titular dos dados

A LGPD garante ao cidadão o direito de, a qualquer momento, pedir para: (a) saber quais dados o gabinete tem sobre ele, (b) corrigir dados errados, (c) pedir a exclusão dos dados, (d) saber com quem os dados foram compartilhados.

**O que existe hoje:** nada disso. Não há tela, endpoint ou processo (nem manual) para um cidadão exercer esses direitos. Se alguém ligar pro gabinete pedindo "apaguem meus dados", hoje não existe um caminho técnico pra atender — teria que ser uma operação manual direta no banco de dados.

**Recomendação:** não precisa ser um autoatendimento sofisticado — como o volume de demandas é relativamente pequeno e passa sempre por um assessor humano, pode ser um processo simples: um jeito do chefe (que já tem acesso total) localizar todas as demandas de um cidadão por telefone e decidir entre anonimizar ou excluir. O importante é que *exista* um caminho, documentado, mesmo que operado manualmente por enquanto.

---

## 3. Retenção e descarte de dados

**O que existe hoje:** quando uma demanda muda para o status `ARQUIVADA`, o campo `arquivadoEm` é preenchido automaticamente com a data — mas isso só marca a demanda como arquivada dentro do fluxo de atendimento (visualmente diferente na lista), não afeta os dados de forma alguma. Os dados continuam no banco, sem prazo, para sempre. Não existe nenhuma rotina de expiração, anonimização ou exclusão automática.

**Por que isso importa:** a LGPD exige que dados pessoais sejam mantidos só pelo tempo necessário à finalidade que motivou a coleta (ou por obrigação legal, ex: prazo de guarda de registros públicos). Um endereço, telefone e foto de uma demanda concluída há 3 anos provavelmente não precisa mais estar identificável a uma pessoa específica.

**Recomendação:** definir (com apoio jurídico, já que pode haver prazo legal de guarda de registros de câmara municipal) uma política de retenção — por exemplo, "demandas concluídas/arquivadas há mais de X anos têm o nome, telefone e endereço do solicitante anonimizados, mantendo só o histórico estatístico (bairro, tipo, datas)". Isso é uma funcionalidade nova, não uma correção do que existe.

---

## 4. Fotos armazenadas no Cloudinary

**Ponto forte confirmado:** as fotos são enviadas ao Cloudinary com `type: 'authenticated'` — ou seja, não existe URL pública; toda entrega passa por uma assinatura gerada sob demanda pelo backend. Isso já foi validado numa revisão de segurança anterior nesta mesma sessão.

**Gap encontrado agora, sob a ótica LGPD:** o código que faz upload de fotos (`backend/src/services/cloudinary-uploader.service.ts`) **não tem nenhum método de exclusão.** Uma vez enviada, uma foto nunca pode ser removida do Cloudinary pelo próprio sistema — nem se a demanda for excluída, nem se o cidadão pedir a remoção dos dados (ver seção 2), nem por uma política de retenção (ver seção 3). A foto ficaria órfã, guardada indefinidamente num serviço de terceiro, mesmo que o registro correspondente saísse do banco de dados.

**Recomendação:** adicionar a capacidade de excluir uma foto do Cloudinary (a API deles suporta isso — é só não estar implementado aqui), e usá-la sempre que uma demanda for excluída ou anonimizada.

---

## 5. Trilha de auditoria sobre dados de cidadãos

**O que existe hoje:** o sistema já tem uma tabela de auditoria (`AuditLog`) bem estruturada, usada para registrar ações administrativas — criar/editar/ativar usuários, criar/editar tipos de demanda, mudanças de escala. Isso é um ponto forte real: mostra que o projeto já leva rastreabilidade a sério.

**Gap:** essa auditoria **não cobre criar, visualizar ou editar uma demanda** — que é exatamente onde ficam os dados pessoais dos cidadãos. Hoje, se depois de um incidente for preciso responder "quem acessou os dados desse cidadão, e quando?", a resposta só existe parcialmente: `RequestStatusHistory` mostra quem mudou o status, mas nada registra quem simplesmente *abriu* e *visualizou* o detalhe de uma demanda.

**Recomendação:** ao menos registrar a criação e edição de uma demanda no `AuditLog` (mesmo padrão já usado em outros lugares). Registrar toda visualização é mais custoso (gera muito volume) e geralmente não é exigido pela LGPD para sistemas desse porte — mas criação/edição/exclusão, sim, vale a pena.

---

## 6. Controle de acesso entre papéis (ponto forte)

Confirmado ao ler `request.service.ts`: um assessor de rua só enxerga as demandas das quais é responsável (`assessorResponsavelId === usuario.id`); chefe e assessor de gabinete têm visão completa, coerente com a função de coordenação deles. Isso é exatamente o tipo de minimização de acesso que a LGPD recomenda — nenhuma ação necessária aqui, só reforça que o projeto já tem bons hábitos de controle de acesso (também confirmado na revisão de segurança anterior).

---

## 7. Minimização de dados coletados

Os campos coletados em cada demanda (`solicitanteNome`, `solicitanteTelefone`, `solicitanteNascimento`, endereço completo, `descricao`, fotos) parecem, à primeira vista, justificáveis pela finalidade (atender e localizar fisicamente uma solicitação). Um ponto a questionar: **`solicitanteNascimento` (data de nascimento) é realmente necessário** para atender uma demanda de infraestrutura urbana (buraco na rua, poda de árvore, etc.)? Se não houver uma razão de negócio clara (ex: priorizar atendimento a idosos), esse é um campo a menos para se preocupar em proteger. Urgência baixa — vale uma conversa, não uma correção urgente.

---

## 8. Encarregado de proteção de dados (DPO) — fora do código

A LGPD exige que toda organização que trata dados pessoais designe um **encarregado** (DPO) — a pessoa responsável por receber reclamações, orientar funcionários e ser o ponto de contato com a ANPD (autoridade nacional). Isso não é uma funcionalidade do sistema — é uma decisão organizacional da Câmara/gabinete (nomear alguém, divulgar um canal de contato). Registro aqui só para constar: sem essa peça, mesmo um sistema tecnicamente perfeito deixa a conformidade incompleta.

---

## Priorização sugerida

Se fosse escolher por onde começar, nessa ordem:

1. **Escrever o aviso de privacidade e conectar o `PrivacyConsent`** (seção 1) — é a lacuna mais visível e mais barata de fechar; hoje o sistema promete um documento que não existe.
2. **Auditoria de criação/edição de demanda** (seção 5) — reaproveita a infraestrutura de `AuditLog` que já existe, é uma extensão pequena.
3. **Exclusão de foto no Cloudinary** (seção 4) — pré-requisito técnico para qualquer processo de exclusão de dados funcionar de verdade.
4. **Um caminho (mesmo manual) para os direitos do titular** (seção 2) — depende do item 3 para ser completo.
5. **Política de retenção/anonimização** (seção 3) — a mais trabalhosa, e a que mais se beneficia de uma conversa jurídica antes de definir prazos.

Os itens 6 e 7 não pedem ação imediata.
