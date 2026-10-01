# Anonimização de dados do cidadão Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao chefe uma forma de localizar as demandas de um cidadão por telefone e anonimizar os dados pessoais (mantendo histórico/estatística), incluindo excluir as fotos do Cloudinary — fecha os itens 3 e 4 do diagnóstico de conformidade LGPD.

**Architecture:** `PhotoUploader` ganha `delete(publicId)`. `RequestRepository` ganha `anonimizar(id)`, que zera os campos identificáveis e apaga as fotos do banco numa transação, devolvendo os `publicId` para o service excluir do Cloudinary. `RequestService` ganha `anonimizar()` (chama o repositório, exclui as fotos do Cloudinary, grava `ANONIMIZAR_DEMANDA` em `AuditLog`) e corrige `listar()` para normalizar `solicitanteTelefone` antes de filtrar — sem isso a busca por telefone nunca bate contra o valor já normalizado no banco. Rota nova `PATCH /demandas/:id/anonimizar`, exclusiva do chefe. Frontend: página nova `/painel/privacidade` reaproveitando o endpoint de listagem já existente (`GET /demandas?solicitanteTelefone=`).

**Tech Stack:** Express/TypeScript/Prisma/PostgreSQL (Neon) backend; Next.js/React/TypeScript/Tailwind frontend; Vitest + Testing Library.

Design de referência: `docs/superpowers/specs/2026-09-25-anonimizacao-cidadao-design.md`.

## Global Constraints

- Anonimizar, não excluir de verdade: a linha `Request` continua existindo; só os campos identificáveis somem.
- Campos apagados (`null` para os opcionais, texto genérico `'[dados removidos a pedido do titular]'` para os obrigatórios que não podem virar `null`): `solicitanteNome`, `solicitanteTelefone`, `solicitanteNascimento`, `cep`, `rua`, `numero`, `complemento`, `pontoReferencia`, `localExato`, `descricao`, `descricaoOutroAssunto`, e todas as fotos (banco + Cloudinary).
- Campos mantidos: `bairro`, `cidade`, `estado`, `tituloResumido`, `requestTypeId`, `status`, `assessorResponsavelId`, `criadoPorId`, `codigoInterno`, `numeroProtocolo`, datas.
- Não mexe em `PrivacyConsent`, `InternalNote`, `Notification`, `RequestStatusHistory`, `RequestReassignmentHistory`.
- Rota exclusiva do chefe (`requireRole('CHEFE')`).
- Grava `ANONIMIZAR_DEMANDA` em `AuditLog`, sem `detalhes`, mesmo padrão de `CRIAR_DEMANDA`/`EDITAR_DEMANDA`.
- Sem tela nova no `MobileNav.tsx` — mesmo padrão já usado (não documentado, mas existente) para "Configurações", que também só está no `Sidebar.tsx` desktop, não no menu mobile. Ações administrativas raras ficam só no desktop.

---

### Task 1: Backend — exclusão no Cloudinary, anonimização, busca por telefone

**Files:**
- Modify: `backend/src/services/cloudinary-uploader.service.ts`
- Modify: `backend/tests/unit/cloudinary-uploader.test.ts`
- Modify: `backend/src/repositories/request.repository.ts`
- Modify: `backend/src/services/request.service.ts`
- Modify: `backend/src/controllers/request.controller.ts`
- Modify: `backend/src/routes/request.routes.ts`
- Modify: `backend/tests/helpers/fakes.ts`
- Modify: `backend/tests/unit/request-service-consultas.test.ts`
- Modify: `backend/tests/integration/request.routes.test.ts`

**Interfaces:**
- Produz: `PhotoUploader.delete(publicId: string): Promise<void>`. `RequestRepository.anonimizar(id: string): Promise<{ publicIds: string[] }>`. `RequestService.anonimizar(id: string, atorId: string, ip?: string): Promise<AnonimizarResultado>` onde `AnonimizarResultado = { status: 'ok' } | { status: 'nao_encontrada' }`. Rota `PATCH /demandas/:id/anonimizar`.
- Consome: `AuditLogRepository.record()` (já existe), `getClientIp` (já existe), `normalizePhone` (já existe, `backend/src/utils/phone.ts`).

- [ ] **Step 1: `PhotoUploader.delete()` em `backend/src/services/cloudinary-uploader.service.ts`**

Adicione ao final da interface `PhotoUploader` (depois de `urlAssinada`):

```ts
  /**
   * Remove a foto do Cloudinary de vez. Usa os mesmos parâmetros do upload (`resource_type`,
   * `type: 'authenticated'`) — sem eles o Cloudinary não localiza o asset, já que ele nunca
   * foi enviado como público.
   */
  delete(publicId: string): Promise<void>;
```

Adicione ao objeto retornado por `createCloudinaryUploader`, depois de `urlAssinada`:

```ts
    async delete(publicId) {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image', type: 'authenticated' });
    },
```

- [ ] **Step 2: Teste do `delete()` em `backend/tests/unit/cloudinary-uploader.test.ts`**

No mock de `cloudinary` no topo do arquivo, adicione `destroy` ao objeto `uploader`:

```ts
  return {
    v2: {
      config: vi.fn(),
      url,
      uploader: { upload_stream: uploadStream, destroy: vi.fn().mockResolvedValue({ result: 'ok' }) },
    },
  };
```

Adicione um teste novo ao final do `describe('createCloudinaryUploader', ...)`:

```ts
  it('exclui a foto do Cloudinary com os mesmos parâmetros do upload (authenticated)', async () => {
    const uploader = createCloudinaryUploader({ cloudName: 'demo', apiKey: 'key', apiSecret: 'secret' });

    await uploader.delete('demandas/abc123');

    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('demandas/abc123', {
      resource_type: 'image',
      type: 'authenticated',
    });
  });
```

- [ ] **Step 3: Rodar os testes do uploader**

Run: `cd backend && npx vitest run tests/unit/cloudinary-uploader.test.ts`
Expected: todos passando, incluindo o teste novo.

- [ ] **Step 4: `RequestRepository.anonimizar()` em `backend/src/repositories/request.repository.ts`**

Adicione, logo antes de `export interface RequestRepository {` (por volta da linha 115), o texto usado para os campos obrigatórios que não podem virar `null`:

```ts
export const TEXTO_DADOS_REMOVIDOS = '[dados removidos a pedido do titular]';

```

Adicione `anonimizar` à interface `RequestRepository`, depois de `reatribuir`:

```ts
  anonimizar(id: string): Promise<{ publicIds: string[] }>;
```

Adicione a implementação dentro de `createRequestRepository`, depois do método `reatribuir` (antes do `};` de fechamento):

```ts
    async anonimizar(id) {
      return prisma.$transaction(async (tx) => {
        const fotos = await tx.requestPhoto.findMany({ where: { requestId: id }, select: { publicId: true } });
        await tx.requestPhoto.deleteMany({ where: { requestId: id } });
        await tx.request.update({
          where: { id },
          data: {
            solicitanteNome: TEXTO_DADOS_REMOVIDOS,
            solicitanteTelefone: TEXTO_DADOS_REMOVIDOS,
            solicitanteNascimento: null,
            cep: null,
            rua: null,
            numero: null,
            complemento: null,
            pontoReferencia: null,
            localExato: null,
            descricao: TEXTO_DADOS_REMOVIDOS,
            descricaoOutroAssunto: null,
          },
        });
        return { publicIds: fotos.map((f) => f.publicId) };
      });
    },
```

- [ ] **Step 5: `RequestService.anonimizar()` e correção de `listar()` em `backend/src/services/request.service.ts`**

Adicione o tipo de resultado, junto aos outros `export type ...Resultado` (por volta da linha 92-100):

```ts
export type AnonimizarResultado = { status: 'ok' } | { status: 'nao_encontrada' };
```

Troque o método `listar()` (linhas 224-232):

```ts
  async listar(
    filtro: ListarFiltro,
    paginacao: Paginacao,
    usuario: UsuarioAutenticado,
  ): Promise<{ items: RequestSummary[]; total: number }> {
    const filtroEfetivo: ListarFiltro =
      usuario.role === 'ASSESSOR_RUA' ? { ...filtro, assessorResponsavelId: usuario.id } : filtro;
    return this.requestRepo.list(filtroEfetivo, paginacao);
  }
```

por:

```ts
  async listar(
    filtro: ListarFiltro,
    paginacao: Paginacao,
    usuario: UsuarioAutenticado,
  ): Promise<{ items: RequestSummary[]; total: number }> {
    // O telefone gravado no banco está sempre normalizado (E.164) — sem normalizar o filtro
    // aqui também, uma busca por "(34) 99999-1234" nunca bateria contra "+5534999991234".
    const filtroComTelefoneNormalizado: ListarFiltro = filtro.solicitanteTelefone
      ? { ...filtro, solicitanteTelefone: normalizePhone(filtro.solicitanteTelefone) }
      : filtro;
    const filtroEfetivo: ListarFiltro =
      usuario.role === 'ASSESSOR_RUA'
        ? { ...filtroComTelefoneNormalizado, assessorResponsavelId: usuario.id }
        : filtroComTelefoneNormalizado;
    return this.requestRepo.list(filtroEfetivo, paginacao);
  }
```

Adicione o método `anonimizar`, depois de `reatribuir` (antes do `}` de fechamento da classe):

```ts
  async anonimizar(id: string, atorId: string, ip?: string): Promise<AnonimizarResultado> {
    const demanda = await this.requestRepo.findById(id);
    if (!demanda) return { status: 'nao_encontrada' };

    const { publicIds } = await this.requestRepo.anonimizar(id);
    for (const publicId of publicIds) {
      await this.photoUploader.delete(publicId);
    }

    await this.auditLogRepo.record({
      actorUserId: atorId,
      acao: 'ANONIMIZAR_DEMANDA',
      entidade: 'Request',
      entidadeId: id,
      ip,
    });

    return { status: 'ok' };
  }
```

- [ ] **Step 6: Controller e rota**

Em `backend/src/controllers/request.controller.ts`, adicione o método `anonimizar`, depois de `reatribuir` (antes do `};` de fechamento):

```ts
    async anonimizar(req: Request, res: Response) {
      const { id } = demandaIdParamsSchema.parse(req.params);
      const resultado = await requestService.anonimizar(id, req.user!.id, getClientIp(req));
      if (resultado.status === 'nao_encontrada') throw new HttpError(404, 'Demanda não encontrada');
      res.json({ success: true, data: { status: 'ok' } });
    },
```

Em `backend/src/routes/request.routes.ts`, adicione a rota logo após `router.patch('/:id/reatribuir', ...)`:

```ts
  router.patch('/:id/anonimizar', auth, requireRole('CHEFE'), asyncHandler(controller.anonimizar));
```

- [ ] **Step 7: Atualizar `backend/tests/helpers/fakes.ts`**

Adicione `TEXTO_DADOS_REMOVIDOS` ao import já existente de `../../src/repositories/request.repository.js` (o import de `RequestRepository`, `RequestDetail`, `CriarRequestInput`, `FotoParaSalvar`, `ListarFiltro`, `Paginacao`):

```ts
import type {
  RequestRepository,
  RequestDetail,
  CriarRequestInput,
  FotoParaSalvar,
  ListarFiltro,
  Paginacao,
} from '../../src/repositories/request.repository.js';
```

vira:

```ts
import {
  TEXTO_DADOS_REMOVIDOS,
  type RequestRepository,
  type RequestDetail,
  type CriarRequestInput,
  type FotoParaSalvar,
  type ListarFiltro,
  type Paginacao,
} from '../../src/repositories/request.repository.js';
```

Em `createFakePhotoUploader`, adicione `deleted` ao tipo de retorno e ao objeto:

```ts
export function createFakePhotoUploader(): PhotoUploader & {
  uploads: { buffer: Buffer; contentType: string; folder: string }[];
  deleted: string[];
} {
  const uploads: { buffer: Buffer; contentType: string; folder: string }[] = [];
  const deleted: string[] = [];
  let contador = 0;
  return {
    uploads,
    deleted,
    async upload(input) {
      uploads.push(input);
      contador += 1;
      const resultado: FotoEnviada = {
        url: `https://res.cloudinary.com/fake/image/authenticated/v1/${input.folder}/fake-${contador}.jpg`,
        publicId: `${input.folder}/fake-${contador}`,
      };
      return resultado;
    },
    // A assinatura real do Cloudinary é exercitada no teste unitário do uploader; aqui basta
    // uma URL reconhecivelmente "assinada" para provar que a API não devolve a url do banco.
    urlAssinada(publicId) {
      return `https://res.cloudinary.com/fake/image/authenticated/s--fakesig--/${publicId}`;
    },
    async delete(publicId) {
      deleted.push(publicId);
    },
  };
}
```

Em `createFakeRequestRepo`, adicione `anonimizar` depois do método `reatribuir` (antes do `};` de fechamento do objeto retornado):

```ts
    async anonimizar(id) {
      const existente = store.find((r) => r.id === id);
      if (!existente) throw new Error('Request não encontrada (fake)');
      const publicIds = existente.fotos.map((f) => f.publicId);
      existente.solicitanteNome = TEXTO_DADOS_REMOVIDOS;
      existente.solicitanteTelefone = TEXTO_DADOS_REMOVIDOS;
      existente.solicitanteNascimento = null;
      existente.cep = null;
      existente.rua = null;
      existente.numero = null;
      existente.complemento = null;
      existente.pontoReferencia = null;
      existente.localExato = null;
      existente.descricao = TEXTO_DADOS_REMOVIDOS;
      existente.descricaoOutroAssunto = null;
      existente.fotos = [];
      return { publicIds };
    },
```

- [ ] **Step 8: Testes unitários em `backend/tests/unit/request-service-consultas.test.ts`**

O arquivo hoje não importa nada de `request.repository.js`. Adicione uma linha de import nova, junto às demais do topo do arquivo:

```ts
import { TEXTO_DADOS_REMOVIDOS } from '../../src/repositories/request.repository.js';
```

`buildService()` (no topo do arquivo) cria `photoUploader` localmente mas não o devolve. Troque a linha final da função:

```ts
  return { service, requestRepo, userRepo, auditLogRepo };
```

por:

```ts
  return { service, requestRepo, userRepo, auditLogRepo, photoUploader };
```

Adicione um `describe` novo ao final do arquivo:

```ts
describe('RequestService.anonimizar', () => {
  it('anonimiza os campos identificáveis, exclui as fotos do Cloudinary e grava auditoria', async () => {
    const { service, requestRepo, auditLogRepo, photoUploader } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-eu');

    const resultado = await service.anonimizar(demanda.id, 'gabinete-1');

    expect(resultado.status).toBe('ok');
    const atualizada = await requestRepo.findById(demanda.id);
    expect(atualizada?.solicitanteNome).toBe(TEXTO_DADOS_REMOVIDOS);
    expect(atualizada?.solicitanteTelefone).toBe(TEXTO_DADOS_REMOVIDOS);
    expect(atualizada?.cep).toBeNull();
    expect(atualizada?.fotos).toHaveLength(0);
    expect(photoUploader.deleted.length).toBeGreaterThan(0);
    expect(auditLogRepo.records).toContainEqual(
      expect.objectContaining({ actorUserId: 'gabinete-1', acao: 'ANONIMIZAR_DEMANDA', entidade: 'Request', entidadeId: demanda.id }),
    );
  });

  it('retorna nao_encontrada para um id inexistente', async () => {
    const { service } = buildService();
    const resultado = await service.anonimizar('id-que-nao-existe', 'gabinete-1');
    expect(resultado.status).toBe('nao_encontrada');
  });
});
```

- [ ] **Step 9: Rodar os testes unitários afetados**

Run: `cd backend && npx vitest run tests/unit/request-service-consultas.test.ts`
Expected: todos passando, incluindo os 2 testes novos.

- [ ] **Step 10: Testes de integração em `backend/tests/integration/request.routes.test.ts`**

Adicione um `describe` novo ao final do arquivo:

```ts
describe('PATCH /demandas/:id/anonimizar', () => {
  it('bloqueia quem não é chefe com 403', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999998022');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);

    const res = await request(app)
      .patch(`/demandas/${demanda.id}/anonimizar`)
      .set('Authorization', `Bearer ${tokenRua}`);

    expect(res.status).toBe(403);
  }, 30000); // Neon real via rede.

  it('chefe anonimiza a demanda: campos identificáveis somem, fotos são excluídas', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999998023');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);
    const { accessToken: tokenChefe } = await loginComoAssessor('CHEFE', '+5534999998024');

    const res = await request(app)
      .patch(`/demandas/${demanda.id}/anonimizar`)
      .set('Authorization', `Bearer ${tokenChefe}`);

    expect(res.status).toBe(200);

    const linha = await testPrisma.request.findUniqueOrThrow({ where: { id: demanda.id } });
    expect(linha.solicitanteNome).toBe('[dados removidos a pedido do titular]');
    expect(linha.cep).toBeNull();
    expect(linha.bairro).not.toBeNull(); // bairro é mantido para estatística

    const fotos = await testPrisma.requestPhoto.count({ where: { requestId: demanda.id } });
    expect(fotos).toBe(0);
  }, 30000); // Neon real via rede.

  it('retorna 404 para um id inexistente', async () => {
    const { accessToken: tokenChefe } = await loginComoAssessor('CHEFE', '+5534999998025');

    const res = await request(app)
      .patch('/demandas/11111111-1111-1111-1111-111111111111/anonimizar')
      .set('Authorization', `Bearer ${tokenChefe}`);

    expect(res.status).toBe(404);
  }, 30000); // Neon real via rede.
});

describe('GET /demandas — busca por telefone', () => {
  it('chefe encontra a demanda buscando pelo telefone digitado com máscara', async () => {
    const tipo = await criarTipo();
    const { accessToken: tokenRua } = await loginComoAssessor('ASSESSOR_RUA', '+5534999998026');
    const demanda = await criarDemandaViaApi(tipo.id, tokenRua);
    const { accessToken: tokenChefe } = await loginComoAssessor('CHEFE', '+5534999998027');

    // camposBase() usa '(34) 99999-0000' como solicitanteTelefone (com máscara) — o backend
    // precisa normalizar antes de filtrar, senão isto nunca bate contra o valor persistido.
    const res = await request(app)
      .get('/demandas')
      .query({ solicitanteTelefone: '(34) 99999-0000' })
      .set('Authorization', `Bearer ${tokenChefe}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items.some((item: { id: string }) => item.id === demanda.id)).toBe(true);
  }, 30000); // Neon real via rede.
});
```

(`'(34) 99999-0000'` é exatamente o valor de `solicitanteTelefone` usado em `camposBase()`, já definida no topo do arquivo — o teste prova que buscar com a mesma máscara usada na criação encontra a demanda.)

- [ ] **Step 11: Rodar a suíte completa do backend e o typecheck**

Run: `cd backend && npm test && npm run typecheck`
Expected: 100% dos arquivos e testes passando, typecheck limpo. Pode levar ~10-15min via Neon real — não coloque em segundo plano, aguarde o resultado completo. Se algum teste falhar por timeout/conectividade, reexecute só o(s) arquivo(s) afetado(s) antes de concluir que é regressão real (já aconteceu várias vezes nesta sessão por instabilidade de rede do Neon).

- [ ] **Step 12: Commit**

```bash
git add backend/src/services/cloudinary-uploader.service.ts backend/tests/unit/cloudinary-uploader.test.ts backend/src/repositories/request.repository.ts backend/src/services/request.service.ts backend/src/controllers/request.controller.ts backend/src/routes/request.routes.ts backend/tests/helpers/fakes.ts backend/tests/unit/request-service-consultas.test.ts backend/tests/integration/request.routes.test.ts
git commit -m "feat(backend): anonimizacao de dados do cidadao e exclusao de fotos no Cloudinary"
```

---

### Task 2: Frontend — tela de busca e anonimização

**Files:**
- Create: `frontend/src/components/BuscaCidadao.tsx`
- Create: `frontend/src/components/BuscaCidadao.test.tsx`
- Create: `frontend/src/app/painel/privacidade/page.tsx`
- Create: `frontend/src/app/painel/privacidade/page.test.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`

**Interfaces:**
- Produz: `<BuscaCidadao />` (sem props).
- Consome: `apiClient`/`ApiError`, `maskPhone` (`frontend/src/lib/phone-mask`), `DemandaResumo` (`frontend/src/types/request`).

- [ ] **Step 1: Criar `frontend/src/components/BuscaCidadao.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { apiClient, ApiError } from '@/services/api-client';
import { maskPhone } from '@/lib/phone-mask';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import type { DemandaResumo } from '@/types/request';

interface ListaDemandasResposta {
  items: DemandaResumo[];
  total: number;
}

export function BuscaCidadao() {
  const [telefone, setTelefone] = useState('');
  const [resultados, setResultados] = useState<DemandaResumo[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [anonimizandoId, setAnonimizandoId] = useState<string | null>(null);

  const telefoneValido = telefone.replace(/\D/g, '').length >= 10;

  async function buscar(event: React.FormEvent) {
    event.preventDefault();
    if (!telefoneValido) return;
    setErro(null);
    setBuscando(true);
    try {
      const params = new URLSearchParams({ solicitanteTelefone: telefone });
      const resposta = await apiClient.request<ListaDemandasResposta>(`/demandas?${params.toString()}`, {
        auth: true,
      });
      setResultados(resposta.items);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível buscar. Tente novamente.');
      setResultados(null);
    } finally {
      setBuscando(false);
    }
  }

  async function anonimizar(demanda: DemandaResumo) {
    if (anonimizandoId) return;
    if (!window.confirm(`Anonimizar os dados de "${demanda.solicitanteNome}" nesta demanda? Esta ação não pode ser desfeita.`)) {
      return;
    }
    setErro(null);
    setAnonimizandoId(demanda.id);
    try {
      await apiClient.request(`/demandas/${demanda.id}/anonimizar`, { method: 'PATCH', auth: true });
      setResultados((prev) => prev?.filter((d) => d.id !== demanda.id) ?? null);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível anonimizar. Tente novamente.');
    } finally {
      setAnonimizandoId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={buscar} className="flex items-end gap-3">
        <div className="max-w-xs flex-1">
          <TextField
            label="Telefone do cidadão"
            name="telefone"
            inputMode="numeric"
            value={maskPhone(telefone)}
            onChange={(e) => setTelefone(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={!telefoneValido || buscando} className="w-fit">
          {buscando ? 'Buscando…' : 'Buscar'}
        </Button>
      </form>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      {resultados !== null && resultados.length === 0 && (
        <p className="text-sm text-gray-500">Nenhuma demanda encontrada para este telefone.</p>
      )}

      {resultados !== null && resultados.length > 0 && (
        <div className="overflow-x-auto rounded-card bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-600">
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Título</th>
                <th className="px-3 py-2">Solicitante</th>
                <th className="px-3 py-2">Criada em</th>
                <th className="px-3 py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {resultados.map((demanda) => (
                <tr key={demanda.id} className="border-b border-gray-100">
                  <td className="px-3 py-2 text-gray-700">{demanda.codigoInterno}</td>
                  <td className="px-3 py-2 font-medium text-gray-900">{demanda.tituloResumido}</td>
                  <td className="px-3 py-2 text-gray-700">{demanda.solicitanteNome}</td>
                  <td className="px-3 py-2 text-gray-700">{new Date(demanda.createdAt).toLocaleDateString('pt-BR')}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => anonimizar(demanda)}
                      disabled={anonimizandoId === demanda.id}
                      aria-label={`Anonimizar dados de ${demanda.solicitanteNome}`}
                      className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                    >
                      {anonimizandoId === demanda.id ? 'Anonimizando…' : 'Anonimizar dados'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Criar `frontend/src/components/BuscaCidadao.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BuscaCidadao } from './BuscaCidadao';

vi.mock('@/services/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/services/api-client')>('@/services/api-client');
  return { ...actual, apiClient: { ...actual.apiClient, request: vi.fn() } };
});
import { apiClient, ApiError } from '@/services/api-client';

const demandaFake = {
  id: 'd1',
  codigoInterno: 'GD-20260101-0001',
  tituloResumido: 'Buraco na rua',
  solicitanteNome: 'Maria Solicitante',
  bairro: 'Centro',
  status: 'ENVIADA' as const,
  assessorResponsavelId: 'a1',
  assessorResponsavelNome: 'Assessor Um',
  requestTypeId: 't1',
  requestTypeNome: 'Tapa-buraco',
  numeroProtocolo: null,
  createdAt: '2026-01-01T10:00:00.000Z',
};

const confirmSpy = vi.spyOn(window, 'confirm');

beforeEach(() => {
  vi.mocked(apiClient.request).mockReset();
  confirmSpy.mockReset();
});

describe('BuscaCidadao', () => {
  it('busca por telefone e lista as demandas encontradas', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({ items: [demandaFake], total: 1 });

    render(<BuscaCidadao />);

    fireEvent.change(screen.getByLabelText('Telefone do cidadão'), { target: { value: '34999991234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByText('Buraco na rua')).toBeInTheDocument();
    const [url] = vi.mocked(apiClient.request).mock.calls[0]!;
    expect(url).toContain('solicitanteTelefone=');
  });

  it('mostra mensagem quando não encontra nenhuma demanda', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({ items: [], total: 0 });

    render(<BuscaCidadao />);
    fireEvent.change(screen.getByLabelText('Telefone do cidadão'), { target: { value: '34999991234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByText('Nenhuma demanda encontrada para este telefone.')).toBeInTheDocument();
  });

  it('pede confirmação e remove da lista ao anonimizar com sucesso', async () => {
    confirmSpy.mockReturnValue(true);
    vi.mocked(apiClient.request).mockResolvedValueOnce({ items: [demandaFake], total: 1 }).mockResolvedValueOnce({
      status: 'ok',
    });

    render(<BuscaCidadao />);
    fireEvent.change(screen.getByLabelText('Telefone do cidadão'), { target: { value: '34999991234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByText('Buraco na rua');

    fireEvent.click(screen.getByRole('button', { name: 'Anonimizar dados de Maria Solicitante' }));

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText('Buraco na rua')).not.toBeInTheDocument());
    const [url, options] = vi.mocked(apiClient.request).mock.calls[1]!;
    expect(url).toBe('/demandas/d1/anonimizar');
    expect(options?.method).toBe('PATCH');
  });

  it('não chama a API se o usuário cancelar a confirmação', async () => {
    confirmSpy.mockReturnValue(false);
    vi.mocked(apiClient.request).mockResolvedValueOnce({ items: [demandaFake], total: 1 });

    render(<BuscaCidadao />);
    fireEvent.change(screen.getByLabelText('Telefone do cidadão'), { target: { value: '34999991234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByText('Buraco na rua');

    fireEvent.click(screen.getByRole('button', { name: 'Anonimizar dados de Maria Solicitante' }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(apiClient.request).toHaveBeenCalledTimes(1);
  });

  it('mostra a mensagem de erro da API quando a anonimização falha', async () => {
    confirmSpy.mockReturnValue(true);
    vi.mocked(apiClient.request)
      .mockResolvedValueOnce({ items: [demandaFake], total: 1 })
      .mockRejectedValueOnce(new ApiError(404, 'Demanda não encontrada'));

    render(<BuscaCidadao />);
    fireEvent.change(screen.getByLabelText('Telefone do cidadão'), { target: { value: '34999991234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByText('Buraco na rua');

    fireEvent.click(screen.getByRole('button', { name: 'Anonimizar dados de Maria Solicitante' }));

    expect(await screen.findByText('Demanda não encontrada')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Rodar os testes do componente**

Run: `cd frontend && npx vitest run src/components/BuscaCidadao.test.tsx`
Expected: todos passando.

- [ ] **Step 4: Criar `frontend/src/app/painel/privacidade/page.tsx`**

```tsx
'use client';

import { useAuth } from '@/hooks/use-auth';
import { BuscaCidadao } from '@/components/BuscaCidadao';

export default function PrivacidadePage() {
  const { user } = useAuth();

  if (user?.role !== 'CHEFE') {
    return <p className="text-sm text-red-600">Acesso restrito ao chefe.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-primary-dark">Privacidade</h1>
      <p className="text-sm text-gray-600">
        Busque as demandas de um cidadão pelo telefone para anonimizar os dados pessoais, a pedido dele.
      </p>
      <BuscaCidadao />
    </div>
  );
}
```

- [ ] **Step 5: Criar `frontend/src/app/painel/privacidade/page.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PrivacidadePage from './page';

const useAuthMock = vi.fn();
vi.mock('@/hooks/use-auth', () => ({ useAuth: () => useAuthMock() }));

vi.mock('@/components/BuscaCidadao', () => ({
  BuscaCidadao: () => <div>Busca de cidadão</div>,
}));

describe('PrivacidadePage', () => {
  it('mostra o conteúdo para o chefe', () => {
    useAuthMock.mockReturnValue({ user: { id: 'chefe-1', role: 'CHEFE' } });

    render(<PrivacidadePage />);

    expect(screen.getByText('Busca de cidadão')).toBeInTheDocument();
  });

  it('mostra mensagem de acesso negado para quem não é chefe', () => {
    useAuthMock.mockReturnValue({ user: { id: 'a1', role: 'ASSESSOR_RUA' } });

    render(<PrivacidadePage />);

    expect(screen.queryByText('Busca de cidadão')).not.toBeInTheDocument();
    expect(screen.getByText(/acesso restrito ao chefe/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Adicionar o link no `Sidebar.tsx`**

Em `frontend/src/components/Sidebar.tsx`, adicione ao array `ITENS`, depois de `{ href: '/painel/configuracoes', label: 'Configurações', somenteChefe: true }`:

```ts
  { href: '/painel/privacidade', label: 'Privacidade', somenteChefe: true },
```

(Não adicione em `MobileNav.tsx` — ver Global Constraints.)

- [ ] **Step 7: Rodar a suíte completa do frontend e o typecheck**

Run: `cd frontend && npx vitest run && npx tsc --noEmit`
Expected: todos os arquivos e testes passando (inclui os testes novos), typecheck limpo.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/BuscaCidadao.tsx frontend/src/components/BuscaCidadao.test.tsx frontend/src/app/painel/privacidade/page.tsx frontend/src/app/painel/privacidade/page.test.tsx frontend/src/components/Sidebar.tsx
git commit -m "feat(frontend): tela de busca e anonimizacao de dados do cidadao"
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
