# Ajustes da tela Privacidade e menu mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar pendências menores da anonimização (aviso de resultados cortados em 20, botões travados durante o processamento) e dar ao chefe acesso mobile a Configurações e Privacidade via um item "Mais".

**Architecture:** Só frontend, sem mudança de backend/schema/API. `BuscaCidadao` passa a guardar `total` e a desabilitar todos os botões enquanto uma anonimização roda. `MobileNav` ganha o item "Mais" (só chefe) que leva a uma página nova `/painel/mais` com dois cartões de link.

**Tech Stack:** Next.js/React/TypeScript/Tailwind; Vitest + Testing Library.

Design de referência: `docs/superpowers/specs/2026-10-06-ajustes-privacidade-menu-mobile-design.md`.

## Global Constraints

- Só frontend: nenhum arquivo de `backend/` é tocado.
- Nota de truncamento (texto exato): `Mostrando {itens} de {total} demandas. Anonimize estas e busque de novo para ver as demais.` — só quando `total` > quantidade exibida.
- `Sidebar.tsx` não muda.
- Itens do `MobileNav` continuam usando `somenteChefe` (mesmo mecanismo existente); o novo item é `{ href: '/painel/mais', label: 'Mais', somenteChefe: true }`.
- A página `/painel/mais` bloqueia quem não é chefe com o texto `Acesso restrito ao chefe.` (mesmo padrão de `configuracoes/page.tsx`).

---

### Task 1: `BuscaCidadao` — total de resultados e botões travados

**Files:**
- Modify: `frontend/src/components/BuscaCidadao.tsx`
- Modify: `frontend/src/components/BuscaCidadao.test.tsx`

- [ ] **Step 1: Estado `total` em `BuscaCidadao.tsx`**

Logo após `const [resultados, setResultados] = useState<DemandaResumo[] | null>(null);` adicione:

```tsx
  const [total, setTotal] = useState(0);
```

Em `buscar()`, troque:

```tsx
      setResultados(resposta.items);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível buscar. Tente novamente.');
      setResultados(null);
```

por:

```tsx
      setResultados(resposta.items);
      setTotal(resposta.total);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível buscar. Tente novamente.');
      setResultados(null);
      setTotal(0);
```

Em `anonimizar()`, troque:

```tsx
      setResultados((prev) => prev?.filter((d) => d.id !== demanda.id) ?? null);
```

por:

```tsx
      setResultados((prev) => prev?.filter((d) => d.id !== demanda.id) ?? null);
      setTotal((prev) => Math.max(0, prev - 1));
```

- [ ] **Step 2: Nota de truncamento e botões travados**

Logo antes do bloco `{resultados !== null && resultados.length > 0 && (` (a tabela), adicione:

```tsx
      {resultados !== null && resultados.length > 0 && total > resultados.length && (
        <p className="text-sm text-gray-600">
          Mostrando {resultados.length} de {total} demandas. Anonimize estas e busque de novo para ver as demais.
        </p>
      )}
```

No botão de anonimizar, troque:

```tsx
                      disabled={anonimizandoId === demanda.id}
```

por:

```tsx
                      disabled={anonimizandoId !== null}
```

(O texto `Anonimizando…` continua condicionado a `anonimizandoId === demanda.id`.)

- [ ] **Step 3: Testes em `BuscaCidadao.test.tsx`**

Adicione ao final do arquivo (o arquivo já define `demandaFake`, `confirmSpy` e o mock de `apiClient`):

```tsx
describe('BuscaCidadao — total e botões travados', () => {
  const demandaDois = {
    ...demandaFake,
    id: 'd2',
    solicitanteNome: 'João Solicitante',
    tituloResumido: 'Poste queimado',
  };

  async function buscarTelefone() {
    fireEvent.change(screen.getByLabelText('Telefone do cidadão'), { target: { value: '34999991234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
  }

  it('avisa quando o total é maior que os resultados exibidos', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({ items: [demandaFake, demandaDois], total: 37 });

    render(<BuscaCidadao />);
    await buscarTelefone();

    expect(
      await screen.findByText('Mostrando 2 de 37 demandas. Anonimize estas e busque de novo para ver as demais.'),
    ).toBeInTheDocument();
  });

  it('não mostra o aviso quando o total é igual aos resultados exibidos', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({ items: [demandaFake, demandaDois], total: 2 });

    render(<BuscaCidadao />);
    await buscarTelefone();
    await screen.findByText('Buraco na rua');

    expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument();
  });

  it('decrementa o total depois de anonimizar uma demanda', async () => {
    confirmSpy.mockReturnValue(true);
    vi.mocked(apiClient.request)
      .mockResolvedValueOnce({ items: [demandaFake, demandaDois], total: 3 })
      .mockResolvedValueOnce({ status: 'ok' });

    render(<BuscaCidadao />);
    await buscarTelefone();
    await screen.findByText('Mostrando 2 de 3 demandas. Anonimize estas e busque de novo para ver as demais.');

    fireEvent.click(screen.getByRole('button', { name: 'Anonimizar dados de Maria Solicitante' }));

    expect(
      await screen.findByText('Mostrando 1 de 2 demandas. Anonimize estas e busque de novo para ver as demais.'),
    ).toBeInTheDocument();
  });

  it('desabilita os botões das outras linhas enquanto uma anonimização está em andamento', async () => {
    confirmSpy.mockReturnValue(true);
    let resolverAnonimizacao: (valor: unknown) => void = () => {};
    vi.mocked(apiClient.request)
      .mockResolvedValueOnce({ items: [demandaFake, demandaDois], total: 2 })
      .mockImplementationOnce(() => new Promise((resolve) => (resolverAnonimizacao = resolve)));

    render(<BuscaCidadao />);
    await buscarTelefone();
    await screen.findByText('Buraco na rua');

    fireEvent.click(screen.getByRole('button', { name: 'Anonimizar dados de Maria Solicitante' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Anonimizar dados de João Solicitante' })).toBeDisabled(),
    );

    resolverAnonimizacao({ status: 'ok' });
    await waitFor(() => expect(screen.queryByText('Buraco na rua')).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 4: Rodar os testes**

Run: `cd frontend && npx vitest run src/components/BuscaCidadao.test.tsx`
Expected: todos passando (os 5 testes antigos + 4 novos).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/BuscaCidadao.tsx frontend/src/components/BuscaCidadao.test.tsx
git commit -m "feat(frontend): aviso de total e botoes travados na busca de privacidade"
```

---

### Task 2: Menu mobile — item "Mais" e página `/painel/mais`

**Files:**
- Modify: `frontend/src/components/MobileNav.tsx`
- Create: `frontend/src/components/MobileNav.test.tsx`
- Create: `frontend/src/app/painel/mais/page.tsx`
- Create: `frontend/src/app/painel/mais/page.test.tsx`

- [ ] **Step 1: Item "Mais" em `MobileNav.tsx`**

No array `ITENS`, depois de `{ href: '/painel/assessores', label: 'Equipe', somenteChefe: true },` adicione:

```tsx
  { href: '/painel/mais', label: 'Mais', somenteChefe: true },
```

- [ ] **Step 2: Criar `frontend/src/components/MobileNav.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MobileNav } from './MobileNav';

vi.mock('@/components/BotaoSair', () => ({
  BotaoSair: () => <button type="button">Sair</button>,
}));

describe('MobileNav', () => {
  it('mostra o item "Mais" para o chefe', () => {
    render(<MobileNav role="CHEFE" />);

    const link = screen.getByRole('link', { name: 'Mais' });
    expect(link).toHaveAttribute('href', '/painel/mais');
  });

  it('não mostra o item "Mais" para assessores', () => {
    render(<MobileNav role="ASSESSOR_RUA" />);

    expect(screen.queryByRole('link', { name: 'Mais' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Criar `frontend/src/app/painel/mais/page.tsx`**

```tsx
'use client';

import { useAuth } from '@/hooks/use-auth';

const LINKS = [
  { href: '/painel/configuracoes', titulo: 'Configurações', descricao: 'Tipos de demanda' },
  { href: '/painel/privacidade', titulo: 'Privacidade', descricao: 'Anonimizar dados de um cidadão' },
];

export default function MaisPage() {
  const { user } = useAuth();

  if (user?.role !== 'CHEFE') {
    return <p className="text-sm text-red-600">Acesso restrito ao chefe.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-primary-dark">Mais</h1>
      <div className="flex flex-col gap-2">
        {LINKS.map((link) => (
          <a key={link.href} href={link.href} className="rounded-card bg-white p-4 shadow-sm">
            <p className="font-medium text-gray-900">{link.titulo}</p>
            <p className="text-sm text-gray-600">{link.descricao}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Criar `frontend/src/app/painel/mais/page.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MaisPage from './page';

const useAuthMock = vi.fn();
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => useAuthMock() }));

describe('MaisPage', () => {
  it('mostra os links de Configurações e Privacidade para o chefe', () => {
    useAuthMock.mockReturnValue({ user: { id: 'chefe-1', role: 'CHEFE' } });

    render(<MaisPage />);

    expect(screen.getByRole('link', { name: /Configurações/ })).toHaveAttribute('href', '/painel/configuracoes');
    expect(screen.getByRole('link', { name: /Privacidade/ })).toHaveAttribute('href', '/painel/privacidade');
  });

  it('mostra mensagem de acesso negado para quem não é chefe', () => {
    useAuthMock.mockReturnValue({ user: { id: 'a1', role: 'ASSESSOR_RUA' } });

    render(<MaisPage />);

    expect(screen.queryByRole('link', { name: /Configurações/ })).not.toBeInTheDocument();
    expect(screen.getByText(/acesso restrito ao chefe/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Rodar a suíte completa do frontend e o typecheck**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: todos os arquivos e testes passando (inclui os novos), typecheck limpo.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/MobileNav.tsx frontend/src/components/MobileNav.test.tsx frontend/src/app/painel/mais/page.tsx frontend/src/app/painel/mais/page.test.tsx
git commit -m "feat(frontend): item Mais no menu mobile com acesso a Configuracoes e Privacidade"
```

---

## Verificação final (após a Task 2)

```bash
cd frontend && npx vitest run && npx tsc --noEmit
```

Deve passar 100% antes da revisão final de branch. O backend não é tocado por este plano, então a suíte do backend não precisa rodar.
