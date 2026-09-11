# Aviso de Privacidade e `PrivacyConsent` real — Design

## Contexto

A revisão de conformidade LGPD (`docs/superpowers/specs/2026-09-10-lgpd-revisao-conformidade.md`) encontrou dois problemas conectados: (1) o checkbox de consentimento na criação de demanda referencia "o aviso de privacidade", mas esse texto não existe em lugar nenhum do sistema; (2) a tabela `PrivacyConsent` (feita para guardar o texto de consentimento aceito, versionado) existe no banco desde a Fase 1 mas nunca é escrita por nenhum código — confirmado via grep, é código morto.

Este documento cobre a correção dos dois: escrever o aviso de verdade e conectar `PrivacyConsent` para gravar, a cada demanda criada, exatamente o texto que foi apresentado.

**Confirmado com o usuário:** as fotos do sistema são sempre do local/estrutura (buraco, sinalização), nunca de pessoas — não há preocupação de dado sensível nas fotos. Os dados pessoais coletados são nome, telefone e endereço (sem e-mail). O responsável pelo tratamento no aviso fica como "Gabinete Digital" (genérico, ajustável depois). Contato para dúvidas/pedidos: "fale com o assessor que te atendeu" — sem canal novo.

## Arquitetura

O texto do aviso vive em dois lugares por necessidade (não há pacote compartilhado entre backend e frontend neste projeto — mesmo padrão já usado para `ROLE_LABEL`): uma cópia no **backend**, que é a fonte da verdade gravada no banco a cada consentimento (garante que o que fica registrado nunca pode ser alterado pelo navegador do cidadão/assessor), e uma cópia no **frontend**, usada só para exibição no modal. As duas precisam ficar idênticas — um comentário de referência cruzada em cada arquivo aponta para o outro.

Ao criar uma demanda, `RequestRepository.create()` passa a incluir uma criação aninhada de `PrivacyConsent` na mesma chamada Prisma (`consentimento: { create: { autorizado, textoVersao } }`) — sem transação separada, o nested-create do Prisma já garante atomicidade com a criação da `Request`. Nenhuma mudança é necessária em `RequestService.criar()`: ele já só repassa o input para o repositório, que passa a anexar o texto vigente internamente.

**Achado técnico durante o design:** `PrivacyConsent` tem uma FK obrigatória para `Request` sem `onDelete` explícito (`RESTRICT` no Postgres). Três arquivos de teste fazem limpeza manual do banco (fora do helper `resetDb()` compartilhado) sem prever essa tabela — `backend/tests/helpers/reset-db.ts` **já** limpa `privacyConsent` antes de `request` (correto, não precisa mudar), mas `backend/tests/integration/request.repository.test.ts`, `backend/tests/integration/internal-note.repository.test.ts` e `backend/tests/integration/repositories.test.ts` fazem sua própria limpeza sem essa linha — precisam da mesma correção, senão qualquer teste que crie uma `Request` (que agora sempre cria um `PrivacyConsent` junto) vai deixar o próximo `request.deleteMany()` desses três arquivos falhar por violação de FK.

## Texto do aviso (aprovado pelo usuário)

```
Aviso de Privacidade — Gabinete Digital

Este é o aviso de privacidade citado no formulário de nova demanda. Ele explica, de forma simples, o que fazemos com os dados de quem solicita um atendimento.

O que coletamos: seu nome, telefone e endereço (rua, número, bairro, cidade), além da descrição do problema relatado. Quando há foto, ela é sempre do local ou da estrutura (por exemplo, o buraco na rua ou a sinalização faltando) — nunca de pessoas.

Para que usamos: exclusivamente para registrar, acompanhar e responder à sua solicitação junto ao gabinete. Seus dados não são usados para nenhuma outra finalidade, como envio de propaganda.

Quem tem acesso: a equipe do gabinete responsável por atender e encaminhar solicitações. As fotos ficam armazenadas em um serviço de nuvem (Cloudinary), protegidas contra acesso externo.

Por quanto tempo guardamos: enquanto for necessário para o acompanhamento da sua solicitação. Ainda não temos um prazo automático de exclusão definido — isso está em avaliação.

Seus direitos: a qualquer momento você pode pedir para saber quais dados temos sobre você, corrigi-los ou solicitar a exclusão. Basta falar com o assessor ou assessora que fez seu atendimento.

Ao marcar a caixa de autorização, você confirma que está de acordo com o uso dos seus dados conforme descrito acima.
```

Este é o texto da versão 1 (`v1`). Se o texto mudar no futuro, `PrivacyConsent.textoVersao` de demandas já criadas permanece com o texto antigo — é justamente essa a proteção que faltava.

## Backend

- `backend/src/utils/aviso-privacidade.ts` (novo): exporta `AVISO_PRIVACIDADE_TEXTO_ATUAL: string` com o texto acima.
- `backend/src/repositories/request.repository.ts`: `create()` passa a incluir `consentimento: { create: { autorizado: input.autorizacaoDados, textoVersao: AVISO_PRIVACIDADE_TEXTO_ATUAL } }` dentro do `data` do `prisma.request.create()`.
- Correção de limpeza de teste (3 arquivos, ver Arquitetura): adicionar `await prisma.privacyConsent.deleteMany();` imediatamente antes de cada `await prisma.request.deleteMany();` manual.

## Frontend

- `frontend/src/lib/aviso-privacidade.ts` (novo): exporta `AVISO_PRIVACIDADE_TEXTO` com o mesmo texto, só para exibição.
- `frontend/src/components/ModalAvisoPrivacidade.tsx` (novo): modal simples (mesmo padrão visual dos demais modais do projeto — overlay + painel), sem formulário, exibe o texto e tem um botão "Fechar". Props: `onFechar: () => void`.
- `frontend/src/app/painel/demandas/nova/page.tsx`: adiciona um botão de texto "Ver aviso de privacidade" ao lado do checkbox de autorização, que abre `ModalAvisoPrivacidade` via estado local (`useState<boolean>`).

## Testes

- Backend: `backend/tests/integration/request.repository.test.ts` ganha um teste novo confirmando que, após `create()`, existe um `PrivacyConsent` no banco com `autorizado` igual ao valor enviado e `textoVersao` igual ao texto vigente.
- Frontend: `ModalAvisoPrivacidade.test.tsx` (novo) confirma que o texto aparece e que o botão Fechar chama `onFechar`. `frontend/src/app/painel/demandas/nova/page.test.tsx` ganha um teste confirmando que o botão "Ver aviso de privacidade" abre o modal.

## Fora de escopo

- Prazo de retenção/exclusão automática (item separado do diagnóstico LGPD, mais trabalhoso, fica para depois).
- Exclusão de fotos no Cloudinary (idem).
- Nome real do vereador/gabinete no aviso (fica genérico por enquanto, por decisão do usuário).
- Qualquer mudança em como o consentimento é usado hoje (o checkbox continua obrigatório para enviar o formulário, sem mudança de comportamento visível para quem já usa o sistema).
