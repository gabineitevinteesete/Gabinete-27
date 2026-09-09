# Fase 5 (parte 1): Tela de Assessores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma tela nova (`/painel/assessores`), exclusiva do chefe, com uma tabela de todos os assessores (filtrável por papel e por ativo/inativo), onde o chefe cria novos assessores, corrige nome/telefone, muda o papel e ativa/desativa — usando a base que já existe no backend desde a Fase 1, mais uma capacidade nova (editar nome/telefone).

**Architecture:** Backend: uma capacidade nova (`editarAssessor`) no `UserService`/`UserRepository` já existentes, mais uma extensão pequena no `listar` (filtro por papel, que o repositório já suporta mas a rota ainda não expõe). Front-end: um utilitário de rótulos de papel, um modal reaproveitável (criar/editar), um componente de tabela auto-contido (busca, filtros, ações), e a página que só monta esse componente.

**Tech Stack:** Mesmo da Fase 1/3/4 — Express, TypeScript, Prisma, Zod; Next.js, React, Tailwind (reaproveitando os componentes `TextField`/`Button` já existentes, e o padrão de modal já introduzido na Fase 4).

## Global Constraints

- Toda a tela e todas as rotas novas são exclusivas de `CHEFE` — as rotas de `/usuarios` já são `requireRole('CHEFE')` desde a Fase 1, nada muda aí.
- As proteções já existentes (não é possível desativar nem rebaixar o único chefe ativo) continuam valendo sem nenhuma duplicação de regra no front-end — a UI só exibe a mensagem de erro que a própria API já devolve.
- Editar nome/telefone permite manter o mesmo telefone que o próprio usuário já tinha (não deve contar como duplicado).
- Interface 100% em português do Brasil; sem comentários no código a não ser para documentar um porquê não óbvio.
- O menu (`Sidebar`/`MobileNav`) já tem o link para `/painel/assessores` — **nenhuma mudança de navegação é necessária nesta fase**, só a página em si.

---

## Task 1: Backend — `UserRepository.update()` e `UserService.editarAssessor()`

**Files:**
- Modify: `backend/src/repositories/user.repository.ts`
- Modify: `backend/src/services/user.service.ts`
- Modify: `backend/tests/helpers/fakes.ts`
- Modify: `backend/tests/unit/user-service.test.ts` (arquivo já existe — adicionar sem remover os testes existentes)

**Interfaces:**
- Produces: `UserRepository.update(id, { nome?, telefone? })`, `UserService.editarAssessor()`, tipo `EditarAssessorResult` — consumidos pela Task 2 (controller).

- [ ] **Step 1: Escrever os testes**

Adicione ao final de `backend/tests/unit/user-service.test.ts` (reaproveitando `buildService()` já existente no topo do arquivo):

```ts
describe('UserService.editarAssessor', () => {
  it('atualiza nome e telefone com telefone normalizado', async () => {
    const { service, auditLogRepo } = buildService();
    const criado = await service.criarAssessor({
      nome: 'Nome Original',
      telefone: '(34) 99999-1234',
      role: 'ASSESSOR_RUA',
      criadoPorId: 'chefe-1',
    });
    if (criado.status !== 'ok') throw new Error('esperava ok');

    const result = await service.editarAssessor({
      userId: criado.user.id,
      nome: 'Nome Corrigido',
      telefone: '(34) 98888-5678',
      atualizadoPorId: 'chefe-1',
    });

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.user.nome).toBe('Nome Corrigido');
      expect(result.user.telefone).toBe('+5534988885678');
    }
    expect(auditLogRepo.records).toHaveLength(2); // criação + edição
  });

  it('permite manter o mesmo telefone do próprio usuário', async () => {
    const { service } = buildService();
    const criado = await service.criarAssessor({
      nome: 'Nome Original',
      telefone: '(34) 99999-1234',
      role: 'ASSESSOR_RUA',
      criadoPorId: 'chefe-1',
    });
    if (criado.status !== 'ok') throw new Error('esperava ok');

    const result = await service.editarAssessor({
      userId: criado.user.id,
      nome: 'Nome Corrigido',
      telefone: '(34) 99999-1234',
      atualizadoPorId: 'chefe-1',
    });

    expect(result.status).toBe('ok');
  });

  it('rejeita telefone com formato inválido', async () => {
    const { service } = buildService();
    const criado = await service.criarAssessor({
      nome: 'Nome Original',
      telefone: '(34) 99999-1234',
      role: 'ASSESSOR_RUA',
      criadoPorId: 'chefe-1',
    });
    if (criado.status !== 'ok') throw new Error('esperava ok');

    const result = await service.editarAssessor({
      userId: criado.user.id,
      telefone: '123',
      atualizadoPorId: 'chefe-1',
    });

    expect(result.status).toBe('telefone_invalido');
  });

  it('rejeita telefone já usado por outro usuário', async () => {
    const { service } = buildService();
    await service.criarAssessor({
      nome: 'Assessor A',
      telefone: '(34) 99999-1234',
      role: 'ASSESSOR_RUA',
      criadoPorId: 'chefe-1',
    });
    const criadoB = await service.criarAssessor({
      nome: 'Assessor B',
      telefone: '(34) 98888-5678',
      role: 'ASSESSOR_RUA',
      criadoPorId: 'chefe-1',
    });
    if (criadoB.status !== 'ok') throw new Error('esperava ok');

    const result = await service.editarAssessor({
      userId: criadoB.user.id,
      telefone: '(34) 99999-1234',
      atualizadoPorId: 'chefe-1',
    });

    expect(result.status).toBe('telefone_duplicado');
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd backend && npx vitest run tests/unit/user-service.test.ts`
Expected: FAIL — `service.editarAssessor` não existe.

- [ ] **Step 3: Implementar `UserRepository.update()`**

Em `backend/src/repositories/user.repository.ts`, adicione à interface `UserRepository` (junto de `updateRole`/`setAtivo`):

```ts
  update(id: string, data: { nome?: string; telefone?: string }): Promise<PublicUser>;
```

E a implementação, dentro do objeto retornado por `createUserRepository`:

```ts
    async update(id, data) {
      const user = await prisma.user.update({
        where: { id },
        data: {
          ...(data.nome !== undefined ? { nome: data.nome } : {}),
          ...(data.telefone !== undefined ? { telefone: data.telefone } : {}),
        },
      });
      return toPublicUser(user);
    },
```

- [ ] **Step 4: Estender o fake de `UserRepository`**

Em `backend/tests/helpers/fakes.ts`, dentro de `createFakeUserRepo`, adicione (junto de `updateRole`/`setAtivo`):

```ts
    async update(id, data) {
      const user = users.find((u) => u.id === id)!;
      if (data.nome !== undefined) user.nome = data.nome;
      if (data.telefone !== undefined) user.telefone = data.telefone;
      return user;
    },
```

- [ ] **Step 5: Implementar `UserService.editarAssessor()`**

Em `backend/src/services/user.service.ts`, adicione o tipo de resultado (junto de `CriarAssessorResult`/`AlterarUsuarioResult`):

```ts
export type EditarAssessorResult =
  | { status: 'ok'; user: PublicUser }
  | { status: 'telefone_invalido' }
  | { status: 'telefone_duplicado' };
```

E o método, dentro da classe `UserService` (depois de `criarAssessor`):

```ts
  async editarAssessor(input: {
    userId: string;
    nome?: string;
    telefone?: string;
    atualizadoPorId: string;
    ip?: string;
  }): Promise<EditarAssessorResult> {
    let telefoneNormalizado: string | undefined;
    if (input.telefone !== undefined) {
      if (!isValidBrazilianPhone(input.telefone)) {
        return { status: 'telefone_invalido' };
      }
      telefoneNormalizado = normalizePhone(input.telefone);
      const existente = await this.userRepo.findByTelefone(telefoneNormalizado);
      if (existente && existente.id !== input.userId) {
        return { status: 'telefone_duplicado' };
      }
    }

    const user = await this.userRepo.update(input.userId, {
      nome: input.nome,
      telefone: telefoneNormalizado,
    });

    await this.auditLogRepo.record({
      actorUserId: input.atualizadoPorId,
      acao: 'EDITAR_USUARIO',
      entidade: 'User',
      entidadeId: input.userId,
      ip: input.ip,
    });

    return { status: 'ok', user };
  }
```

- [ ] **Step 6: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/unit/user-service.test.ts`
Expected: PASS (todos os testes já existentes + os 4 novos).

- [ ] **Step 7: Rodar o typecheck**

Run: `cd backend && npm run typecheck`
Expected: sem erros.

- [ ] **Step 8: Commit**

```bash
git add backend/src/repositories/user.repository.ts backend/src/services/user.service.ts backend/tests/helpers/fakes.ts backend/tests/unit/user-service.test.ts
git commit -m "feat(backend): permite editar nome e telefone de um assessor"
```

---

## Task 2: Backend — validador, controller e rota `PATCH /usuarios/:id`, filtro de papel em `GET /usuarios`

**Files:**
- Modify: `backend/src/validators/user.validators.ts`
- Modify: `backend/src/controllers/user.controller.ts`
- Modify: `backend/src/routes/user.routes.ts`

**Interfaces:**
- Consumes: `UserService.editarAssessor()` (Task 1).
- Produces: `PATCH /usuarios/:id`, `GET /usuarios?role=...&ativo=...` — consumidos pela Task 3 (testes de integração) e pelo front-end (Tasks 4-7).

Esta task não tem ciclo de teste próprio — a Task 3 escreve os testes de integração das rotas.

- [ ] **Step 1: Validadores**

Em `backend/src/validators/user.validators.ts`, adicione (junto dos demais schemas já existentes):

```ts
export const editarUsuarioSchema = z
  .object({
    nome: z.string().min(2).optional(),
    telefone: z.string().min(10).optional(),
  })
  .refine((data) => data.nome !== undefined || data.telefone !== undefined, {
    message: 'Informe ao menos um campo para atualizar',
  });

export const listarUsuariosQuerySchema = z.object({
  ativo: z.enum(['true', 'false']).optional(),
  role: z.enum(['CHEFE', 'ASSESSOR_RUA', 'ASSESSOR_GABINETE']).optional(),
});
```

- [ ] **Step 2: Controller**

Em `backend/src/controllers/user.controller.ts`, atualize o import do topo para incluir os dois schemas novos:

```ts
import {
  criarUsuarioSchema,
  atualizarRoleSchema,
  definirAtivoSchema,
  usuarioIdParamsSchema,
  editarUsuarioSchema,
  listarUsuariosQuerySchema,
} from '../validators/user.validators.js';
```

Substitua o método `listar` inteiro por:

```ts
    async listar(req: Request, res: Response) {
      const { ativo, role } = listarUsuariosQuerySchema.parse(req.query);
      const filter: { ativo?: boolean; role?: UserRoleValue } = {};
      if (ativo !== undefined) filter.ativo = ativo === 'true';
      if (role !== undefined) filter.role = role;
      const usuarios = await userService.listar(filter);
      res.json({ success: true, data: usuarios });
    },
```

Adicione o import de `UserRoleValue` no topo do arquivo:

```ts
import type { UserRoleValue } from '../utils/jwt.js';
```

E adicione o método `editar`, depois de `criar`:

```ts
    async editar(req: Request, res: Response) {
      const { id: userId } = usuarioIdParamsSchema.parse(req.params);
      const input = editarUsuarioSchema.parse(req.body);
      const result = await userService.editarAssessor({
        userId,
        nome: input.nome,
        telefone: input.telefone,
        atualizadoPorId: req.user!.id,
        ip: getClientIp(req),
      });
      if (result.status === 'telefone_invalido') {
        throw new HttpError(400, 'Telefone inválido');
      }
      if (result.status === 'telefone_duplicado') {
        throw new HttpError(409, 'Já existe um usuário com esse telefone');
      }
      res.json({ success: true, data: result.user });
    },
```

- [ ] **Step 3: Extender `UserService.listar` para aceitar `role`**

Em `backend/src/services/user.service.ts`, troque a assinatura do método `listar`:

```ts
  async listar(filter?: { ativo?: boolean; role?: UserRoleValue }): Promise<PublicUser[]> {
    return this.userRepo.list(filter);
  }
```

(`UserRepository.list` já aceita `{ ativo?, role? }` desde a Fase 3 — só a assinatura do serviço precisava acompanhar.)

- [ ] **Step 4: Rota**

Em `backend/src/routes/user.routes.ts`, adicione a rota nova, logo depois de `router.get('/', ...)` e antes de `router.patch('/:id/role', ...)`:

```ts
  router.patch('/:id', asyncHandler(controller.editar));
```

- [ ] **Step 5: Confirmar que a suíte existente e o typecheck continuam limpos**

Run: `cd backend && npm test && npm run typecheck`
Expected: tudo passando (o teste já existente `GET /usuarios` sem query continua funcionando, já que `listarUsuariosQuerySchema` aceita um objeto vazio).

- [ ] **Step 6: Commit**

```bash
git add backend/src/validators/user.validators.ts backend/src/controllers/user.controller.ts backend/src/services/user.service.ts backend/src/routes/user.routes.ts
git commit -m "feat(backend): rota de editar assessor e filtro de papel em GET /usuarios"
```

---

## Task 3: Backend — testes de integração

**Files:**
- Modify: `backend/tests/integration/user.routes.test.ts` (arquivo já existe — adicionar sem remover os testes existentes)

**Interfaces:**
- Consumes: `PATCH /usuarios/:id`, `GET /usuarios?role=` (Task 2).

- [ ] **Step 1: Escrever os testes**

Adicione ao final de `backend/tests/integration/user.routes.test.ts` (reaproveitando `loginComoChefe()`/`loginComoAssessor()` já existentes no topo do arquivo):

```ts
describe('PATCH /usuarios/:id', () => {
  it('chefe corrige nome e telefone de um assessor de rua', async () => {
    const { accessToken } = await loginComoChefe();
    const criado = await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Nome Errado', telefone: '(34) 99999-8888', role: 'ASSESSOR_RUA' });

    const editado = await request(app)
      .patch(`/usuarios/${criado.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Nome Certo', telefone: '(34) 98888-7777' });

    expect(editado.status).toBe(200);
    expect(editado.body.data.nome).toBe('Nome Certo');
    expect(editado.body.data.telefone).toBe('+5534988887777');
  }, 30000);

  it('permite editar mantendo o mesmo telefone', async () => {
    const { accessToken } = await loginComoChefe();
    const criado = await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Nome Errado', telefone: '(34) 99999-8888', role: 'ASSESSOR_RUA' });

    const editado = await request(app)
      .patch(`/usuarios/${criado.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Nome Certo', telefone: '(34) 99999-8888' });

    expect(editado.status).toBe(200);
    expect(editado.body.data.nome).toBe('Nome Certo');
  }, 30000);

  it('rejeita telefone já usado por outro usuário com 409', async () => {
    const { accessToken } = await loginComoChefe();
    await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Assessor A', telefone: '(34) 99999-1111', role: 'ASSESSOR_RUA' });
    const criadoB = await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Assessor B', telefone: '(34) 99999-2222', role: 'ASSESSOR_GABINETE' });

    const res = await request(app)
      .patch(`/usuarios/${criadoB.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ telefone: '(34) 99999-1111' });

    expect(res.status).toBe(409);
  }, 30000);

  it('assessor não pode editar outro usuário', async () => {
    const { accessToken: tokenChefe } = await loginComoChefe();
    const criado = await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${tokenChefe}`)
      .send({ nome: 'Assessor C', telefone: '(34) 99999-3333', role: 'ASSESSOR_RUA' });
    const { accessToken: tokenAssessor } = await loginComoAssessor();

    const res = await request(app)
      .patch(`/usuarios/${criado.body.data.id}`)
      .set('Authorization', `Bearer ${tokenAssessor}`)
      .send({ nome: 'Tentativa' });

    expect(res.status).toBe(403);
  }, 30000);

  it('permite editar um chefe', async () => {
    const { chefe, accessToken } = await loginComoChefe();

    const res = await request(app)
      .patch(`/usuarios/${chefe.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Chefe Renomeado' });

    expect(res.status).toBe(200);
    expect(res.body.data.nome).toBe('Chefe Renomeado');
  }, 30000);
});

describe('GET /usuarios?role=', () => {
  it('filtra por papel', async () => {
    const { accessToken } = await loginComoChefe();
    await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Rua', telefone: '(34) 99999-4444', role: 'ASSESSOR_RUA' });
    await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Gabinete', telefone: '(34) 99999-5555', role: 'ASSESSOR_GABINETE' });

    const res = await request(app).get('/usuarios?role=ASSESSOR_RUA').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.every((u: { role: string }) => u.role === 'ASSESSOR_RUA')).toBe(true);
    expect(res.body.data.some((u: { nome: string }) => u.nome === 'Rua')).toBe(true);
    expect(res.body.data.some((u: { nome: string }) => u.nome === 'Gabinete')).toBe(false);
  }, 30000);

  it('combina filtro de papel e ativo', async () => {
    const { accessToken } = await loginComoChefe();
    const criado = await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Rua Inativo', telefone: '(34) 99999-6666', role: 'ASSESSOR_RUA' });
    await request(app)
      .patch(`/usuarios/${criado.body.data.id}/ativo`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ativo: false });
    await request(app)
      .post('/usuarios')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ nome: 'Rua Ativo', telefone: '(34) 99999-7777', role: 'ASSESSOR_RUA' });

    const res = await request(app)
      .get('/usuarios?role=ASSESSOR_RUA&ativo=true')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.body.data.some((u: { nome: string }) => u.nome === 'Rua Ativo')).toBe(true);
    expect(res.body.data.some((u: { nome: string }) => u.nome === 'Rua Inativo')).toBe(false);
  }, 30000);
});
```

- [ ] **Step 2: Rodar e confirmar sucesso**

Run: `cd backend && npx vitest run tests/integration/user.routes.test.ts`
Expected: PASS (todos os testes já existentes + os 7 novos).

- [ ] **Step 3: Rodar toda a suíte do backend**

Run: `cd backend && npm test && npm run typecheck`
Expected: tudo passando.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/integration/user.routes.test.ts
git commit -m "test(backend): cobertura de integracao de editar assessor e filtro de papel"
```

---

## Task 4: Front-end — rótulos de papel

**Files:**
- Create: `frontend/src/lib/user-role.ts`
- Test: `frontend/src/lib/user-role.test.ts`

**Interfaces:**
- Produces: `ROLE_LABEL`, `ROLE_OPTIONS` — consumidos pelas Tasks 5-6.

- [ ] **Step 1: Escrever o teste**

```ts
import { describe, it, expect } from 'vitest';
import { ROLE_LABEL, ROLE_OPTIONS } from './user-role';

describe('ROLE_LABEL', () => {
  it('tem um rótulo em português pra cada papel', () => {
    expect(ROLE_LABEL.ASSESSOR_RUA).toBe('Assessor de rua');
    expect(ROLE_LABEL.CHEFE).toBe('Chefe');
    expect(ROLE_LABEL.ASSESSOR_GABINETE).toBe('Assessor de gabinete');
  });

  it('ROLE_OPTIONS lista os mesmos três papéis', () => {
    expect(ROLE_OPTIONS).toEqual(['ASSESSOR_RUA', 'CHEFE', 'ASSESSOR_GABINETE']);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run src/lib/user-role.test.ts`
Expected: FAIL — `./user-role` não existe.

- [ ] **Step 3: Implementar**

Crie `frontend/src/lib/user-role.ts`:

```ts
import type { UserRoleValue } from '@/types/auth';

export const ROLE_LABEL: Record<UserRoleValue, string> = {
  ASSESSOR_RUA: 'Assessor de rua',
  CHEFE: 'Chefe',
  ASSESSOR_GABINETE: 'Assessor de gabinete',
};

export const ROLE_OPTIONS: UserRoleValue[] = ['ASSESSOR_RUA', 'CHEFE', 'ASSESSOR_GABINETE'];
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run src/lib/user-role.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/user-role.ts frontend/src/lib/user-role.test.ts
git commit -m "feat(frontend): rotulos em portugues para os papeis de usuario"
```

---

## Task 5: Front-end — modal de criar/editar assessor

**Files:**
- Create: `frontend/src/components/ModalAssessor.tsx`
- Test: `frontend/src/components/ModalAssessor.test.tsx`

**Interfaces:**
- Consumes: `apiClient`/`ApiError` (Fase 1); `maskPhone` (`@/lib/phone-mask`, já existe); `ROLE_LABEL`/`ROLE_OPTIONS` (Task 4); `TextField`/`Button` (já existem); `PublicUser`/`UserRoleValue` (`@/types/auth`, já existem).
- Produces: `<ModalAssessor />` — consumido pela Task 6.

- [ ] **Step 1: Escrever o teste**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ModalAssessor } from './ModalAssessor';

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient, ApiError } from '@/services/api-client';

const assessorFake = {
  id: 'a1',
  nome: 'Ana Rua',
  telefone: '+5534999991234',
  role: 'ASSESSOR_RUA' as const,
  ativo: true,
  pinDefinido: true,
};

beforeEach(() => {
  vi.mocked(apiClient.request).mockReset();
});

describe('ModalAssessor (criar)', () => {
  it('mostra o seletor de papel e envia POST /usuarios ao salvar', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce(assessorFake);
    const onSalvo = vi.fn();

    render(<ModalAssessor modo="criar" onFechar={() => {}} onSalvo={onSalvo} />);

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Novo Assessor' } });
    fireEvent.change(screen.getByLabelText('Telefone'), { target: { value: '34999998888' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSalvo).toHaveBeenCalledWith(assessorFake));
    const [url, options] = vi.mocked(apiClient.request).mock.calls[0]!;
    expect(url).toBe('/usuarios');
    expect(options?.method).toBe('POST');
  });
});

describe('ModalAssessor (editar)', () => {
  it('pré-preenche nome e telefone, sem seletor de papel, e envia PATCH', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({ ...assessorFake, nome: 'Ana Corrigida' });
    const onSalvo = vi.fn();

    render(<ModalAssessor modo="editar" assessor={assessorFake} onFechar={() => {}} onSalvo={onSalvo} />);

    expect(screen.getByLabelText('Nome')).toHaveValue('Ana Rua');
    expect(screen.queryByLabelText('Papel')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ana Corrigida' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSalvo).toHaveBeenCalled());
    const [url, options] = vi.mocked(apiClient.request).mock.calls[0]!;
    expect(url).toBe('/usuarios/a1');
    expect(options?.method).toBe('PATCH');
  });

  it('mostra a mensagem de erro da API quando salvar falha', async () => {
    vi.mocked(apiClient.request).mockRejectedValueOnce(new ApiError(409, 'Já existe um usuário com esse telefone'));

    render(<ModalAssessor modo="editar" assessor={assessorFake} onFechar={() => {}} onSalvo={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Já existe um usuário com esse telefone')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run src/components/ModalAssessor.test.tsx`
Expected: FAIL — `./ModalAssessor` não existe.

- [ ] **Step 3: Implementar**

Crie `frontend/src/components/ModalAssessor.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { apiClient, ApiError } from '@/services/api-client';
import { maskPhone } from '@/lib/phone-mask';
import { ROLE_LABEL, ROLE_OPTIONS } from '@/lib/user-role';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import type { PublicUser, UserRoleValue } from '@/types/auth';

interface ModalAssessorProps {
  modo: 'criar' | 'editar';
  assessor?: PublicUser;
  onFechar: () => void;
  onSalvo: (assessor: PublicUser) => void;
}

export function ModalAssessor({ modo, assessor, onFechar, onSalvo }: ModalAssessorProps) {
  const [nome, setNome] = useState(assessor?.nome ?? '');
  const [telefone, setTelefone] = useState(assessor?.telefone ?? '');
  const [role, setRole] = useState<UserRoleValue>(assessor?.role ?? 'ASSESSOR_RUA');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setEnviando(true);
    setErro(null);
    try {
      const resultado =
        modo === 'criar'
          ? await apiClient.request<PublicUser>('/usuarios', {
              method: 'POST',
              auth: true,
              body: { nome, telefone, role },
            })
          : await apiClient.request<PublicUser>(`/usuarios/${assessor!.id}`, {
              method: 'PATCH',
              auth: true,
              body: { nome, telefone },
            });
      onSalvo(resultado);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível salvar. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  const formValido = nome.trim().length >= 2 && telefone.trim().length >= 10;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-card bg-white p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-primary-dark">
            {modo === 'criar' ? 'Novo assessor' : 'Editar assessor'}
          </h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="text-gray-500 hover:text-gray-700">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <TextField label="Nome" name="nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          <TextField
            label="Telefone"
            name="telefone"
            inputMode="numeric"
            value={maskPhone(telefone)}
            onChange={(e) => setTelefone(e.target.value)}
          />

          {modo === 'criar' && (
            <div className="flex flex-col gap-1">
              <label htmlFor="role" className="text-sm font-medium text-gray-700">
                Papel
              </label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRoleValue)}
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              >
                {ROLE_OPTIONS.map((opcao) => (
                  <option key={opcao} value={opcao}>
                    {ROLE_LABEL[opcao]}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Button type="button" onClick={salvar} disabled={!formValido || enviando}>
            {enviando ? 'Salvando…' : 'Salvar'}
          </Button>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run src/components/ModalAssessor.test.tsx`
Expected: PASS (3 testes).

- [ ] **Step 5: Rodar o typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ModalAssessor.tsx frontend/src/components/ModalAssessor.test.tsx
git commit -m "feat(frontend): modal de criar e editar assessor"
```

---

## Task 6: Front-end — tabela de assessores

**Files:**
- Create: `frontend/src/components/ListaAssessores.tsx`
- Test: `frontend/src/components/ListaAssessores.test.tsx`

**Interfaces:**
- Consumes: `apiClient`/`ApiError` (Fase 1); `ROLE_LABEL`/`ROLE_OPTIONS` (Task 4); `ModalAssessor` (Task 5); `Button` (já existe); `PublicUser`/`UserRoleValue` (já existem).
- Produces: `<ListaAssessores />` — consumido pela Task 7.

Os testes desta task são ordenados de propósito por papel — assessor de rua primeiro, chefe
depois, assessor de gabinete por último — seguindo a prioridade de construção pedida.

- [ ] **Step 1: Escrever o teste**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ListaAssessores } from './ListaAssessores';

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient, ApiError } from '@/services/api-client';

const assessorRua = {
  id: 'a1',
  nome: 'Ana Rua',
  telefone: '+5534999991111',
  role: 'ASSESSOR_RUA' as const,
  ativo: true,
  pinDefinido: true,
};

beforeEach(() => {
  vi.mocked(apiClient.request).mockReset();
});

describe('ListaAssessores — assessor de rua', () => {
  it('lista e permite desativar', async () => {
    vi.mocked(apiClient.request)
      .mockResolvedValueOnce([assessorRua])
      .mockResolvedValueOnce({ ...assessorRua, ativo: false });

    render(<ListaAssessores />);

    expect(await screen.findByText('Ana Rua')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Desativar' }));

    await waitFor(() => expect(screen.getByText('Inativo')).toBeInTheDocument());
    const [url, options] = vi.mocked(apiClient.request).mock.calls[1]!;
    expect(url).toBe('/usuarios/a1/ativo');
    expect(options?.body).toEqual({ ativo: false });
  });

  it('filtro de papel dispara nova busca com o parâmetro certo', async () => {
    vi.mocked(apiClient.request).mockResolvedValue([]);

    render(<ListaAssessores />);
    await waitFor(() => expect(apiClient.request).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Papel'), { target: { value: 'ASSESSOR_RUA' } });

    await waitFor(() => expect(apiClient.request).toHaveBeenCalledTimes(2));
    const [url] = vi.mocked(apiClient.request).mock.calls[1]!;
    expect(url).toContain('role=ASSESSOR_RUA');
  });
});

describe('ListaAssessores — chefe', () => {
  const chefe = {
    id: 'c1',
    nome: 'Chefe Um',
    telefone: '+5534999992222',
    role: 'CHEFE' as const,
    ativo: true,
    pinDefinido: true,
  };

  it('mostra a mensagem de erro da API ao tentar desativar o último chefe ativo', async () => {
    vi.mocked(apiClient.request)
      .mockResolvedValueOnce([chefe])
      .mockRejectedValueOnce(new ApiError(409, 'Não é possível remover o último chefe ativo do gabinete'));

    render(<ListaAssessores />);

    expect(await screen.findByText('Chefe Um')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Desativar' }));

    expect(await screen.findByText('Não é possível remover o último chefe ativo do gabinete')).toBeInTheDocument();
  });
});

describe('ListaAssessores — assessor de gabinete', () => {
  const gabinete = {
    id: 'g1',
    nome: 'Beto Gabinete',
    telefone: '+5534999993333',
    role: 'ASSESSOR_GABINETE' as const,
    ativo: true,
    pinDefinido: true,
  };

  it('abre o modal de edição pré-preenchido ao clicar em Editar', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce([gabinete]);

    render(<ListaAssessores />);

    expect(await screen.findByText('Beto Gabinete')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    expect(screen.getByText('Editar assessor')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toHaveValue('Beto Gabinete');
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run src/components/ListaAssessores.test.tsx`
Expected: FAIL — `./ListaAssessores` não existe.

- [ ] **Step 3: Implementar**

Crie `frontend/src/components/ListaAssessores.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { apiClient, ApiError } from '@/services/api-client';
import { ROLE_LABEL, ROLE_OPTIONS } from '@/lib/user-role';
import { ModalAssessor } from '@/components/ModalAssessor';
import { Button } from '@/components/Button';
import type { PublicUser, UserRoleValue } from '@/types/auth';

type FiltroPapel = UserRoleValue | '';
type FiltroAtivo = 'true' | 'false' | '';

export function ListaAssessores() {
  const [assessores, setAssessores] = useState<PublicUser[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [filtroPapel, setFiltroPapel] = useState<FiltroPapel>('');
  const [filtroAtivo, setFiltroAtivo] = useState<FiltroAtivo>('');
  const [modalAberto, setModalAberto] = useState<'criar' | PublicUser | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  function buscar() {
    setCarregando(true);
    setErro(false);
    const params = new URLSearchParams();
    if (filtroPapel) params.set('role', filtroPapel);
    if (filtroAtivo) params.set('ativo', filtroAtivo);
    const query = params.toString();
    apiClient
      .request<PublicUser[]>(`/usuarios${query ? `?${query}` : ''}`, { auth: true })
      .then(setAssessores)
      .catch(() => setErro(true))
      .finally(() => setCarregando(false));
  }

  useEffect(buscar, [filtroPapel, filtroAtivo]);

  async function mudarPapel(assessor: PublicUser, novoRole: UserRoleValue) {
    setErroAcao(null);
    try {
      const atualizado = await apiClient.request<PublicUser>(`/usuarios/${assessor.id}/role`, {
        method: 'PATCH',
        auth: true,
        body: { role: novoRole },
      });
      setAssessores((prev) => prev.map((a) => (a.id === atualizado.id ? atualizado : a)));
    } catch (err) {
      setErroAcao(err instanceof ApiError ? err.message : 'Não foi possível mudar o papel.');
    }
  }

  async function alternarAtivo(assessor: PublicUser) {
    setErroAcao(null);
    try {
      const atualizado = await apiClient.request<PublicUser>(`/usuarios/${assessor.id}/ativo`, {
        method: 'PATCH',
        auth: true,
        body: { ativo: !assessor.ativo },
      });
      setAssessores((prev) => prev.map((a) => (a.id === atualizado.id ? atualizado : a)));
    } catch (err) {
      setErroAcao(err instanceof ApiError ? err.message : 'Não foi possível atualizar o status.');
    }
  }

  function handleSalvo() {
    setModalAberto(null);
    buscar();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-papel" className="text-xs font-medium text-gray-600">
            Papel
          </label>
          <select
            id="filtro-papel"
            value={filtroPapel}
            onChange={(e) => setFiltroPapel(e.target.value as FiltroPapel)}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            {ROLE_OPTIONS.map((opcao) => (
              <option key={opcao} value={opcao}>
                {ROLE_LABEL[opcao]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-ativo" className="text-xs font-medium text-gray-600">
            Status
          </label>
          <select
            id="filtro-ativo"
            value={filtroAtivo}
            onChange={(e) => setFiltroAtivo(e.target.value as FiltroAtivo)}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            <option value="true">Ativos</option>
            <option value="false">Inativos</option>
          </select>
        </div>
        <Button type="button" onClick={() => setModalAberto('criar')} className="w-fit">
          + Novo assessor
        </Button>
      </div>

      {erroAcao && <p className="text-sm text-red-600">{erroAcao}</p>}
      {carregando && <p className="text-sm text-gray-500">Carregando…</p>}
      {erro && <p className="text-sm text-red-600">Não foi possível carregar os assessores.</p>}

      {!carregando && !erro && (
        <div className="overflow-x-auto rounded-card bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-600">
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Telefone</th>
                <th className="px-3 py-2">Papel</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {assessores.map((assessor) => (
                <tr key={assessor.id} className="border-b border-gray-100">
                  <td className="px-3 py-2 font-medium text-gray-900">{assessor.nome}</td>
                  <td className="px-3 py-2 text-gray-700">{assessor.telefone}</td>
                  <td className="px-3 py-2">
                    <select
                      aria-label={`Papel de ${assessor.nome}`}
                      value={assessor.role}
                      onChange={(e) => mudarPapel(assessor, e.target.value as UserRoleValue)}
                      className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                    >
                      {ROLE_OPTIONS.map((opcao) => (
                        <option key={opcao} value={opcao}>
                          {ROLE_LABEL[opcao]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">{assessor.ativo ? 'Ativo' : 'Inativo'}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => alternarAtivo(assessor)}
                        className="text-xs font-medium text-primary-dark hover:underline"
                      >
                        {assessor.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalAberto(assessor)}
                        className="text-xs font-medium text-primary-dark hover:underline"
                      >
                        Editar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {assessores.length === 0 && <p className="p-4 text-sm text-gray-500">Nenhum assessor encontrado.</p>}
        </div>
      )}

      {modalAberto && (
        <ModalAssessor
          modo={modalAberto === 'criar' ? 'criar' : 'editar'}
          assessor={modalAberto === 'criar' ? undefined : modalAberto}
          onFechar={() => setModalAberto(null)}
          onSalvo={handleSalvo}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run src/components/ListaAssessores.test.tsx`
Expected: PASS (4 testes).

- [ ] **Step 5: Rodar o typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ListaAssessores.tsx frontend/src/components/ListaAssessores.test.tsx
git commit -m "feat(frontend): tabela de assessores com filtros e acoes"
```

---

## Task 7: Front-end — página final e verificação de toda a pilha

**Files:**
- Create: `frontend/src/app/painel/assessores/page.tsx`
- Test: `frontend/src/app/painel/assessores/page.test.tsx`

**Interfaces:**
- Consumes: `ListaAssessores` (Task 6); `useAuth` (Fase 1).

O menu já tem o link para `/painel/assessores` (com `somenteChefe: true`) desde antes desta
fase — não é preciso mudar `Sidebar.tsx`/`MobileNav.tsx`.

- [ ] **Step 1: Escrever o teste da página**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AssessoresPage from './page';

const useAuthMock = vi.fn();
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => useAuthMock() }));

vi.mock('@/components/ListaAssessores', () => ({
  ListaAssessores: () => <div>Lista de assessores</div>,
}));

describe('AssessoresPage', () => {
  it('mostra o conteúdo para o chefe', () => {
    useAuthMock.mockReturnValue({ user: { id: 'chefe-1', role: 'CHEFE' } });

    render(<AssessoresPage />);

    expect(screen.getByText('Lista de assessores')).toBeInTheDocument();
  });

  it('mostra mensagem de acesso negado para quem não é chefe', () => {
    useAuthMock.mockReturnValue({ user: { id: 'a1', role: 'ASSESSOR_RUA' } });

    render(<AssessoresPage />);

    expect(screen.queryByText('Lista de assessores')).not.toBeInTheDocument();
    expect(screen.getByText(/acesso restrito ao chefe/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `cd frontend && npx vitest run "src/app/painel/assessores/page.test.tsx"`
Expected: FAIL — `./page` não existe.

- [ ] **Step 3: Implementar a página**

Crie `frontend/src/app/painel/assessores/page.tsx`:

```tsx
'use client';

import { useAuth } from '@/hooks/use-auth';
import { ListaAssessores } from '@/components/ListaAssessores';

export default function AssessoresPage() {
  const { user } = useAuth();

  if (user?.role !== 'CHEFE') {
    return <p className="text-sm text-red-600">Acesso restrito ao chefe.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-primary-dark">Assessores</h1>
      <ListaAssessores />
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `cd frontend && npx vitest run "src/app/painel/assessores/page.test.tsx"`
Expected: PASS (2 testes).

- [ ] **Step 5: Verificação final — suíte completa do front-end, build, e suíte completa do backend**

Run: `cd frontend && npx vitest run && npx tsc --noEmit && npm run build`
Expected: tudo passando, build conclui sem erros.

Run: `cd backend && npm test && npm run typecheck`
Expected: tudo passando (garantia de que nada quebrou nesta fase).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/painel/assessores
git commit -m "feat(frontend): pagina de assessores"
```
