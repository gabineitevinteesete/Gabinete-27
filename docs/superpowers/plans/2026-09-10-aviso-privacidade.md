# Aviso de Privacidade e `PrivacyConsent` real Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Escrever o aviso de privacidade real (hoje referenciado mas inexistente) e conectar a tabela `PrivacyConsent` (hoje código morto) para gravar, a cada demanda criada, o texto exato apresentado.

**Architecture:** O texto do aviso vive em dois arquivos (backend = fonte da verdade gravada no banco; frontend = cópia para exibição), sem pacote compartilhado, mesmo padrão já usado para `ROLE_LABEL`. `RequestRepository.create()` passa a incluir uma criação aninhada de `PrivacyConsent` na mesma chamada Prisma que cria a `Request` — atômico, sem transação separada. Nenhuma mudança em `RequestService`. No frontend, um botão "Ver aviso de privacidade" na tela de nova demanda abre um modal com o texto completo.

**Tech Stack:** Express/TypeScript/Prisma/PostgreSQL (Neon) backend; Next.js/React/TypeScript/Tailwind frontend; Vitest + Testing Library.

Design de referência: `docs/superpowers/specs/2026-09-10-aviso-privacidade-design.md`.

## Global Constraints

- O texto do aviso (versão 1) é EXATAMENTE o texto abaixo, idêntico nos dois arquivos (backend e frontend) — copie literalmente, não parafraseie:

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

- `PrivacyConsent.textoVersao` grava o texto completo acima (não um rótulo curto tipo `"v1"`) — é assim que o campo protege contra mudanças futuras do texto.
- Nenhuma mudança de comportamento visível para quem já usa o sistema: o checkbox continua obrigatório do mesmo jeito, o fluxo de envio da demanda não muda.
- `PrivacyConsent` tem FK `RESTRICT` para `Request` — qualquer teste que limpa a tabela `request` manualmente precisa limpar `privacyConsent` antes.

---

### Task 1: Backend — texto do aviso, gravação do `PrivacyConsent`, correção de limpeza de testes

**Files:**
- Create: `backend/src/utils/aviso-privacidade.ts`
- Modify: `backend/src/repositories/request.repository.ts`
- Modify: `backend/tests/integration/request.repository.test.ts`
- Modify: `backend/tests/integration/internal-note.repository.test.ts`
- Modify: `backend/tests/integration/repositories.test.ts`

**Interfaces:**
- Produz: `AVISO_PRIVACIDADE_TEXTO_ATUAL: string` (`backend/src/utils/aviso-privacidade.ts`).
- Consumido por: `RequestRepository.create()` (já existe, só ganha uma linha nova no `data`).

- [ ] **Step 1: Criar `backend/src/utils/aviso-privacidade.ts`**

```ts
/**
 * Texto atual do aviso de privacidade, gravado literalmente em `PrivacyConsent.textoVersao`
 * a cada demanda criada — se este texto mudar no futuro, demandas já criadas continuam com
 * o texto que foi de fato apresentado no momento do consentimento.
 *
 * Mantenha idêntico a `frontend/src/lib/aviso-privacidade.ts` (cópia de exibição, sem pacote
 * compartilhado entre os dois projetos).
 */
export const AVISO_PRIVACIDADE_TEXTO_ATUAL = `Aviso de Privacidade — Gabinete Digital

Este é o aviso de privacidade citado no formulário de nova demanda. Ele explica, de forma simples, o que fazemos com os dados de quem solicita um atendimento.

O que coletamos: seu nome, telefone e endereço (rua, número, bairro, cidade), além da descrição do problema relatado. Quando há foto, ela é sempre do local ou da estrutura (por exemplo, o buraco na rua ou a sinalização faltando) — nunca de pessoas.

Para que usamos: exclusivamente para registrar, acompanhar e responder à sua solicitação junto ao gabinete. Seus dados não são usados para nenhuma outra finalidade, como envio de propaganda.

Quem tem acesso: a equipe do gabinete responsável por atender e encaminhar solicitações. As fotos ficam armazenadas em um serviço de nuvem (Cloudinary), protegidas contra acesso externo.

Por quanto tempo guardamos: enquanto for necessário para o acompanhamento da sua solicitação. Ainda não temos um prazo automático de exclusão definido — isso está em avaliação.

Seus direitos: a qualquer momento você pode pedir para saber quais dados temos sobre você, corrigi-los ou solicitar a exclusão. Basta falar com o assessor ou assessora que fez seu atendimento.

Ao marcar a caixa de autorização, você confirma que está de acordo com o uso dos seus dados conforme descrito acima.`;
```

- [ ] **Step 2: Fazer `RequestRepository.create()` gravar o `PrivacyConsent`**

Em `backend/src/repositories/request.repository.ts`, adicione o import no topo (junto aos demais):

```ts
import { AVISO_PRIVACIDADE_TEXTO_ATUAL } from '../utils/aviso-privacidade.js';
```

Localize o método `create()` (por volta da linha 167) e, dentro do `data` passado a `prisma.request.create({...})`, adicione a chave `consentimento` logo após `autorizacaoDados: input.autorizacaoDados,` e antes de `status: 'ENVIADA',`:

```ts
          autorizacaoDados: input.autorizacaoDados,
          consentimento: {
            create: {
              autorizado: input.autorizacaoDados,
              textoVersao: AVISO_PRIVACIDADE_TEXTO_ATUAL,
            },
          },
          status: 'ENVIADA',
```

(O resto do método — `fotos: { create: ... }`, `include: INCLUDE_DETALHE`, `return toDetail(criado)` — continua igual. Não precisa adicionar `consentimento` em `INCLUDE_DETALHE`: o tipo de retorno não precisa expor o consentimento, só o banco precisa da linha gravada.)

- [ ] **Step 3: Corrigir a limpeza de teste em `backend/tests/integration/request.repository.test.ts`**

Este arquivo faz sua própria limpeza manual do banco (não usa o helper `resetDb()` compartilhado). Como toda `Request` criada por este arquivo agora também cria um `PrivacyConsent` (FK `RESTRICT`), falta limpar essa tabela antes de `request.deleteMany()`. Localize, dentro do `beforeEach` (por volta da linha 25):

```ts
  await prisma.internalNote.deleteMany();
  await prisma.request.deleteMany();
```

E adicione a linha nova entre as duas:

```ts
  await prisma.internalNote.deleteMany();
  await prisma.privacyConsent.deleteMany();
  await prisma.request.deleteMany();
```

- [ ] **Step 4: A mesma correção em `backend/tests/integration/internal-note.repository.test.ts`**

Localize, dentro do `beforeEach` (por volta da linha 21):

```ts
  await prisma.requestReassignmentHistory.deleteMany();
  await prisma.request.deleteMany();
```

E adicione a linha nova entre as duas:

```ts
  await prisma.requestReassignmentHistory.deleteMany();
  await prisma.privacyConsent.deleteMany();
  await prisma.request.deleteMany();
```

- [ ] **Step 5: A mesma correção em `backend/tests/integration/repositories.test.ts`**

Localize, dentro do `beforeEach` (por volta da linha 35):

```ts
  await prisma.internalNote.deleteMany();
  await prisma.request.deleteMany();
```

E adicione a linha nova entre as duas:

```ts
  await prisma.internalNote.deleteMany();
  await prisma.privacyConsent.deleteMany();
  await prisma.request.deleteMany();
```

(`backend/tests/helpers/reset-db.ts` **já** limpa `privacyConsent` antes de `request` — não precisa de nenhuma mudança lá. `backend/tests/integration/request.routes.test.ts` e `backend/tests/integration/internal-note.routes.test.ts` chamam `resetDb()` antes de qualquer limpeza manual extra, então também já estão protegidos — não precisam de mudança.)

- [ ] **Step 6: Escrever o teste de integração do novo comportamento**

Em `backend/tests/integration/request.repository.test.ts`, adicione um novo `describe` ao final do arquivo (o arquivo já importa `prisma`, `requestRepo`, `inputBase` — reaproveite):

```ts
describe('RequestRepository.create — PrivacyConsent', () => {
  it('grava um PrivacyConsent com o texto vigente ao criar a demanda', async () => {
    // inputBase() já preenche autorizacaoDados: true por padrão.
    const criado = await requestRepo.create(inputBase(), []);

    const consentimento = await prisma.privacyConsent.findUnique({ where: { requestId: criado.id } });

    expect(consentimento).not.toBeNull();
    expect(consentimento?.autorizado).toBe(true);
    expect(consentimento?.textoVersao).toContain('Aviso de Privacidade — Gabinete Digital');
    expect(consentimento?.textoVersao).toContain('Seus direitos:');
  });

  it('grava autorizado: false quando o input não autoriza', async () => {
    const criado = await requestRepo.create(inputBase({ autorizacaoDados: false }), []);

    const consentimento = await prisma.privacyConsent.findUnique({ where: { requestId: criado.id } });

    expect(consentimento?.autorizado).toBe(false);
  });
});
```

- [ ] **Step 7: Rodar os testes e o typecheck**

Run: `cd backend && npx vitest run tests/integration/request.repository.test.ts tests/integration/internal-note.repository.test.ts tests/integration/repositories.test.ts`
Expected: todos passando, incluindo o teste novo.

Run: `cd backend && npm test && npm run typecheck`
Expected: suíte completa 100% passando (confirma que a correção de limpeza nos 3 arquivos não quebrou nada e nenhum outro teste foi afetado pela FK nova em uso), typecheck limpo.

- [ ] **Step 8: Commit**

```bash
git add backend/src/utils/aviso-privacidade.ts backend/src/repositories/request.repository.ts backend/tests/integration/request.repository.test.ts backend/tests/integration/internal-note.repository.test.ts backend/tests/integration/repositories.test.ts
git commit -m "feat(backend): grava PrivacyConsent com o texto do aviso a cada demanda criada"
```

---

### Task 2: Frontend — modal do aviso e botão na tela de nova demanda

**Files:**
- Create: `frontend/src/lib/aviso-privacidade.ts`
- Create: `frontend/src/components/ModalAvisoPrivacidade.tsx`
- Create: `frontend/src/components/ModalAvisoPrivacidade.test.tsx`
- Modify: `frontend/src/app/painel/demandas/nova/page.tsx`
- Modify: `frontend/src/app/painel/demandas/nova/page.test.tsx`

**Interfaces:**
- Produz: `AVISO_PRIVACIDADE_TEXTO: string` (`frontend/src/lib/aviso-privacidade.ts`), `<ModalAvisoPrivacidade onFechar={() => void} />`.
- Consumido por: `frontend/src/app/painel/demandas/nova/page.tsx`.

- [ ] **Step 1: Criar `frontend/src/lib/aviso-privacidade.ts`**

```ts
/**
 * Cópia de exibição do texto do aviso de privacidade — só para mostrar ao usuário. A fonte
 * da verdade gravada no banco é `backend/src/utils/aviso-privacidade.ts`; mantenha os dois
 * idênticos manualmente (sem pacote compartilhado entre os dois projetos).
 */
export const AVISO_PRIVACIDADE_TEXTO = `Aviso de Privacidade — Gabinete Digital

Este é o aviso de privacidade citado no formulário de nova demanda. Ele explica, de forma simples, o que fazemos com os dados de quem solicita um atendimento.

O que coletamos: seu nome, telefone e endereço (rua, número, bairro, cidade), além da descrição do problema relatado. Quando há foto, ela é sempre do local ou da estrutura (por exemplo, o buraco na rua ou a sinalização faltando) — nunca de pessoas.

Para que usamos: exclusivamente para registrar, acompanhar e responder à sua solicitação junto ao gabinete. Seus dados não são usados para nenhuma outra finalidade, como envio de propaganda.

Quem tem acesso: a equipe do gabinete responsável por atender e encaminhar solicitações. As fotos ficam armazenadas em um serviço de nuvem (Cloudinary), protegidas contra acesso externo.

Por quanto tempo guardamos: enquanto for necessário para o acompanhamento da sua solicitação. Ainda não temos um prazo automático de exclusão definido — isso está em avaliação.

Seus direitos: a qualquer momento você pode pedir para saber quais dados temos sobre você, corrigi-los ou solicitar a exclusão. Basta falar com o assessor ou assessora que fez seu atendimento.

Ao marcar a caixa de autorização, você confirma que está de acordo com o uso dos seus dados conforme descrito acima.`;
```

- [ ] **Step 2: Criar `frontend/src/components/ModalAvisoPrivacidade.tsx`**

```tsx
'use client';

import { AVISO_PRIVACIDADE_TEXTO } from '@/lib/aviso-privacidade';
import { Button } from '@/components/Button';

interface ModalAvisoPrivacidadeProps {
  onFechar: () => void;
}

export function ModalAvisoPrivacidade({ onFechar }: ModalAvisoPrivacidadeProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-card bg-white p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-primary-dark">Aviso de privacidade</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="text-gray-500 hover:text-gray-700">
            ✕
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto whitespace-pre-line text-sm text-gray-700">
          {AVISO_PRIVACIDADE_TEXTO}
        </div>

        <Button type="button" onClick={onFechar} className="mt-4">
          Fechar
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Criar `frontend/src/components/ModalAvisoPrivacidade.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModalAvisoPrivacidade } from './ModalAvisoPrivacidade';

describe('ModalAvisoPrivacidade', () => {
  it('mostra o texto do aviso e chama onFechar ao clicar em Fechar', () => {
    const onFechar = vi.fn();
    render(<ModalAvisoPrivacidade onFechar={onFechar} />);

    expect(screen.getByText('Aviso de privacidade')).toBeInTheDocument();
    expect(screen.getByText(/O que coletamos:/)).toBeInTheDocument();
    expect(screen.getByText(/Seus direitos:/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(onFechar).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Adicionar o botão em `frontend/src/app/painel/demandas/nova/page.tsx`**

Adicione o import no topo, junto aos demais:

```ts
import { ModalAvisoPrivacidade } from '@/components/ModalAvisoPrivacidade';
```

Adicione um novo estado logo após `const [autorizacaoDados, setAutorizacaoDados] = useState(false);`:

```ts
  const [avisoAberto, setAvisoAberto] = useState(false);
```

Substitua o bloco do checkbox (linhas 196-204 atuais):

```tsx
      <label className="flex items-start gap-2 text-xs text-gray-600">
        <input
          type="checkbox"
          checked={autorizacaoDados}
          onChange={(e) => setAutorizacaoDados(e.target.checked)}
          className="mt-1"
        />
        Autorizo o uso e armazenamento dos dados desta demanda pelo gabinete, conforme o aviso de privacidade.
      </label>
```

por:

```tsx
      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={autorizacaoDados}
            onChange={(e) => setAutorizacaoDados(e.target.checked)}
            className="mt-1"
          />
          Autorizo o uso e armazenamento dos dados desta demanda pelo gabinete, conforme o aviso de privacidade.
        </label>
        <button
          type="button"
          onClick={() => setAvisoAberto(true)}
          className="w-fit text-xs font-medium text-primary-dark hover:underline"
        >
          Ver aviso de privacidade
        </button>
      </div>

      {avisoAberto && <ModalAvisoPrivacidade onFechar={() => setAvisoAberto(false)} />}
```

- [ ] **Step 5: Adicionar o teste em `frontend/src/app/painel/demandas/nova/page.test.tsx`**

Adicione um novo `it()` dentro do `describe('NovaDemandaPage', ...)` já existente (reaproveitando o mock de `apiClient` e o `beforeEach` já configurados no arquivo):

```ts
  it('abre e fecha o modal do aviso de privacidade', async () => {
    render(<NovaDemandaPage />);
    await screen.findByText('Tapa-buraco');

    fireEvent.click(screen.getByRole('button', { name: 'Ver aviso de privacidade' }));
    expect(screen.getByText('Aviso de privacidade')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByText('Aviso de privacidade')).not.toBeInTheDocument();
  });
```

- [ ] **Step 6: Rodar a suíte completa do frontend e o typecheck**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: todos os arquivos e testes passando (inclui os 2 testes novos), typecheck limpo.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/aviso-privacidade.ts frontend/src/components/ModalAvisoPrivacidade.tsx frontend/src/components/ModalAvisoPrivacidade.test.tsx frontend/src/app/painel/demandas/nova/page.tsx frontend/src/app/painel/demandas/nova/page.test.tsx
git commit -m "feat(frontend): modal e botao do aviso de privacidade na nova demanda"
```

---

## Verificação final (após a Task 2)

Rodar as duas suítes completas mais uma vez, sobre a árvore final do branch:

```bash
cd frontend && npx vitest run && npx tsc --noEmit
```

```bash
cd backend && npm test && npm run typecheck
```

Ambas devem passar 100% antes da revisão final de branch.
