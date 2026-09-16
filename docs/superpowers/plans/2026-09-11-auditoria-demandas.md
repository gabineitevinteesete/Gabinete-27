# Auditoria de criação/edição de demanda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gravar `CRIAR_DEMANDA` e `EDITAR_DEMANDA` em `AuditLog` — hoje a auditoria cobre ações administrativas, mas não a criação/edição de demandas, que é onde ficam os dados pessoais dos cidadãos.

**Architecture:** `RequestService` ganha `auditLogRepo: AuditLogRepository` como dependência obrigatória do construtor (mesmo padrão de `UserService`/`RequestTypeService`). `criar()` e `editar()` gravam o log depois que a escrita principal (`requestRepo.create`/`requestRepo.update`) tiver sucesso. Nenhum `detalhes` é gravado (consistente com `EDITAR_USUARIO`/`EDITAR_TIPO_DEMANDA`). `ip` chega do controller via `getClientIp(req)`, mesmo padrão já usado em `UserController`/`RequestTypeController`.

**Tech Stack:** Express/TypeScript/Prisma/PostgreSQL (Neon) backend; Vitest.

Design de referência: `docs/superpowers/specs/2026-09-11-auditoria-demandas-design.md`.

## Global Constraints

- `CRIAR_DEMANDA` e `EDITAR_DEMANDA` são as únicas ações novas — nada em `mudarStatus()`/`reatribuir()` (já têm tabelas de histórico dedicadas) e nenhum `EXCLUIR_DEMANDA` (não existe endpoint de exclusão).
- Nenhum dos dois grava `detalhes` — só `actorUserId`, `acao`, `entidade: 'Request'`, `entidadeId`, `ip`.
- O log só é gravado depois que a escrita principal (`requestRepo.create`/`requestRepo.update`) já teve sucesso — nunca antes, e nunca se a validação anterior rejeitar o input.
- Nenhuma mudança de formato de resposta HTTP — a auditoria é só um efeito colateral novo no banco.

---

### Task 1: Service, controller, wiring e testes

**Files:**
- Modify: `backend/src/services/request.service.ts`
- Modify: `backend/src/controllers/request.controller.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/tests/unit/request-service-criar.test.ts`
- Modify: `backend/tests/unit/request-service-consultas.test.ts`

**Interfaces:**
- Produz: `RequestService` constructor agora exige `auditLogRepo: AuditLogRepository`. `criar(input: CriarDemandaInput)` — `CriarDemandaInput` ganha `ip?: string`. `editar(id: string, input: EditarRequestInput, usuario: UsuarioAutenticado, ip?: string)` — novo 4º parâmetro.
- Consome: `AuditLogRepository.record()` (já existe, `backend/src/repositories/audit-log.repository.ts`), `getClientIp` (já existe, `backend/src/utils/request-ip.ts`), `createFakeAuditLogRepo()` (já existe, `backend/tests/helpers/fakes.ts`).

- [ ] **Step 1: Editar `backend/src/services/request.service.ts`**

Adicione o import no topo, junto aos demais:

```ts
import type { AuditLogRepository } from '../repositories/audit-log.repository.js';
```

Adicione `ip?: string;` ao final da interface `CriarDemandaInput` (por volta da linha 35-55), logo após `fotos: Buffer[];`:

```ts
export interface CriarDemandaInput {
  solicitanteNome: string;
  solicitanteTelefone: string;
  solicitanteNascimento?: Date;
  cep?: string;
  rua?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  pontoReferencia?: string;
  localExato: string;
  tituloResumido: string;
  descricao: string;
  descricaoOutroAssunto?: string;
  requestTypeId: string;
  autorizacaoDados: boolean;
  assessorResponsavelId: string;
  fotos: Buffer[];
  ip?: string;
}
```

Na classe `RequestService` (por volta da linha 100-116), adicione o campo e o parâmetro do construtor:

```ts
export class RequestService {
  private requestRepo: RequestRepository;
  private requestTypeRepo: RequestTypeRepository;
  private photoUploader: PhotoUploader;
  private userRepo: UserRepository;
  private auditLogRepo: AuditLogRepository;

  constructor(deps: {
    requestRepo: RequestRepository;
    requestTypeRepo: RequestTypeRepository;
    photoUploader: PhotoUploader;
    userRepo: UserRepository;
    auditLogRepo: AuditLogRepository;
  }) {
    this.requestRepo = deps.requestRepo;
    this.requestTypeRepo = deps.requestTypeRepo;
    this.photoUploader = deps.photoUploader;
    this.userRepo = deps.userRepo;
    this.auditLogRepo = deps.auditLogRepo;
  }
```

Em `criar()`, logo após a chamada a `this.requestRepo.create(...)` e antes do `return { status: 'ok', demanda: ... }` (por volta da linha 182-209):

```ts
    const demanda = await this.requestRepo.create(
      {
        codigoInterno: gerarCodigoInterno(),
        solicitanteNome: input.solicitanteNome,
        solicitanteTelefone,
        solicitanteNascimento: input.solicitanteNascimento,
        cep: input.cep,
        rua: input.rua,
        numero: input.numero,
        complemento: input.complemento,
        bairro: input.bairro,
        cidade: input.cidade,
        estado: input.estado,
        pontoReferencia: input.pontoReferencia,
        localExato: input.localExato,
        tituloResumido: input.tituloResumido,
        descricao: input.descricao,
        descricaoOutroAssunto: input.descricaoOutroAssunto,
        requestTypeId: input.requestTypeId,
        assessorResponsavelId: input.assessorResponsavelId,
        criadoPorId: input.assessorResponsavelId,
        autorizacaoDados: input.autorizacaoDados,
      },
      fotosEnviadas,
    );

    await this.auditLogRepo.record({
      actorUserId: input.assessorResponsavelId,
      acao: 'CRIAR_DEMANDA',
      entidade: 'Request',
      entidadeId: demanda.id,
      ip: input.ip,
    });

    return { status: 'ok', demanda: this.comFotosAssinadas(demanda) };
  }
```

Em `editar()`, mude a assinatura do método para aceitar `ip` e grave o log logo após `this.requestRepo.update(...)`:

```ts
  async editar(
    id: string,
    input: EditarRequestInput,
    usuario: UsuarioAutenticado,
    ip?: string,
  ): Promise<EditarDemandaResultado> {
```

(O corpo do método continua igual até o final — só a última parte muda:)

```ts
    const atualizado = await this.requestRepo.update(id, dados);

    await this.auditLogRepo.record({
      actorUserId: usuario.id,
      acao: 'EDITAR_DEMANDA',
      entidade: 'Request',
      entidadeId: id,
      ip,
    });

    return { status: 'ok', demanda: this.comFotosAssinadas(atualizado) };
  }
```

- [ ] **Step 2: Editar `backend/src/controllers/request.controller.ts`**

Adicione o import no topo:

```ts
import { getClientIp } from '../utils/request-ip.js';
```

No método `criar`, adicione `ip: getClientIp(req)` ao objeto passado para `requestService.criar`:

```ts
    async criar(req: Request, res: Response) {
      const dados = criarDemandaSchema.parse(req.body);
      const arquivos = (req.files as Express.Multer.File[] | undefined) ?? [];

      const resultado = await requestService.criar({
        ...dados,
        assessorResponsavelId: req.user!.id,
        fotos: arquivos.map((arquivo) => arquivo.buffer),
        ip: getClientIp(req),
      });
```

No método `editar`, passe `getClientIp(req)` como 4º argumento:

```ts
    async editar(req: Request, res: Response) {
      const { id } = demandaIdParamsSchema.parse(req.params);
      const dados = editarDemandaSchema.parse(req.body);
      const resultado = await requestService.editar(id, dados, req.user!, getClientIp(req));
```

- [ ] **Step 3: Editar `backend/src/app.ts`**

Troque a linha (por volta da linha 56):

```ts
  const requestService = new RequestService({ requestRepo, requestTypeRepo, photoUploader, userRepo });
```

por:

```ts
  const requestService = new RequestService({ requestRepo, requestTypeRepo, photoUploader, userRepo, auditLogRepo });
```

(`auditLogRepo` já existe nesse arquivo — é usado por `authService`/`userService`/`requestTypeService`. Não precisa de import novo.)

- [ ] **Step 4: Atualizar `backend/tests/unit/request-service-criar.test.ts`**

Troque a linha de import do topo:

```ts
import { createFakeRequestTypeRepo, createFakeRequestRepo, createFakePhotoUploader, createFakeUserRepo } from '../helpers/fakes.js';
```

por:

```ts
import { createFakeRequestTypeRepo, createFakeRequestRepo, createFakePhotoUploader, createFakeUserRepo, createFakeAuditLogRepo } from '../helpers/fakes.js';
```

Troque a função `buildService()` (o único ponto de construção deste arquivo):

```ts
function buildService(tipos: Parameters<typeof createFakeRequestTypeRepo>[0]) {
  const requestTypeRepo = createFakeRequestTypeRepo(tipos);
  const requestRepo = createFakeRequestRepo();
  const photoUploader = createFakePhotoUploader();
  const userRepo = createFakeUserRepo();
  const service = new RequestService({ requestRepo, requestTypeRepo, photoUploader, userRepo });
  return { service, requestRepo, photoUploader };
}
```

por:

```ts
function buildService(tipos: Parameters<typeof createFakeRequestTypeRepo>[0]) {
  const requestTypeRepo = createFakeRequestTypeRepo(tipos);
  const requestRepo = createFakeRequestRepo();
  const photoUploader = createFakePhotoUploader();
  const userRepo = createFakeUserRepo();
  const auditLogRepo = createFakeAuditLogRepo();
  const service = new RequestService({ requestRepo, requestTypeRepo, photoUploader, userRepo, auditLogRepo });
  return { service, requestRepo, photoUploader, auditLogRepo };
}
```

`inputBase()` (já existe neste arquivo, sem mudanças necessárias) tem `assessorResponsavelId: 'user-1'` como padrão. Adicione um teste novo dentro do `describe('RequestService.criar', ...)` já existente, logo após o teste `'cria a demanda quando tudo é válido'`:

```ts
  it('grava CRIAR_DEMANDA em auditoria com o assessor responsável como ator', async () => {
    const { service, auditLogRepo } = buildService([
      { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true },
    ]);
    const fotos = [await fotoValida(), await fotoValida()];

    const resultado = await service.criar(inputBase({ fotos }));

    expect(resultado.status).toBe('ok');
    expect(auditLogRepo.records).toHaveLength(1);
    expect(auditLogRepo.records[0]).toMatchObject({
      actorUserId: 'user-1',
      acao: 'CRIAR_DEMANDA',
      entidade: 'Request',
    });
  });
```

- [ ] **Step 5: Atualizar `backend/tests/unit/request-service-consultas.test.ts`**

Troque a linha de import do topo:

```ts
import { createFakeRequestTypeRepo, createFakeRequestRepo, createFakePhotoUploader, createFakeUserRepo } from '../helpers/fakes.js';
```

por:

```ts
import { createFakeRequestTypeRepo, createFakeRequestRepo, createFakePhotoUploader, createFakeUserRepo, createFakeAuditLogRepo } from '../helpers/fakes.js';
```

Este arquivo tem 5 pontos de construção de `RequestService`. Troque o `buildService()` principal (topo do arquivo):

```ts
function buildService() {
  const requestTypeRepo = createFakeRequestTypeRepo([
    { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true },
  ]);
  const requestRepo = createFakeRequestRepo();
  const photoUploader = createFakePhotoUploader();
  const userRepo = createFakeUserRepo([
    { id: 'gabinete-1', nome: 'Gabinete', telefone: '+5534988880001', role: 'ASSESSOR_GABINETE', ativo: true, pinDefinido: true, pinHash: null, createdAt: new Date(), updatedAt: new Date() },
  ]);
  const service = new RequestService({ requestRepo, requestTypeRepo, photoUploader, userRepo });
  return { service, requestRepo, userRepo };
}
```

por:

```ts
function buildService() {
  const requestTypeRepo = createFakeRequestTypeRepo([
    { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true },
  ]);
  const requestRepo = createFakeRequestRepo();
  const photoUploader = createFakePhotoUploader();
  const userRepo = createFakeUserRepo([
    { id: 'gabinete-1', nome: 'Gabinete', telefone: '+5534988880001', role: 'ASSESSOR_GABINETE', ativo: true, pinDefinido: true, pinHash: null, createdAt: new Date(), updatedAt: new Date() },
  ]);
  const auditLogRepo = createFakeAuditLogRepo();
  const service = new RequestService({ requestRepo, requestTypeRepo, photoUploader, userRepo, auditLogRepo });
  return { service, requestRepo, userRepo, auditLogRepo };
}
```

Os outros 4 pontos de construção ficam dentro de testes individuais do `describe('RequestService.editar', ...)`, cada um com seu próprio `requestTypeRepo`/`requestRepo`/`photoUploader`/`userRepo` locais. Localize e troque cada um dos 4 blocos abaixo (identificados pelo teste em que aparecem):

No teste `'rejeita editar para um requestTypeId desativado'`, troque:

```ts
    const requestTypeRepo = createFakeRequestTypeRepo([
      { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true },
      { id: 'tipo-desativado', nome: 'Desativado', exigeDescricaoObrigatoria: false, ativo: false },
    ]);
    const requestRepo = createFakeRequestRepo();
    const photoUploader = createFakePhotoUploader();
    const userRepo = createFakeUserRepo();
    const service = new RequestService({ requestRepo, requestTypeRepo, photoUploader, userRepo });
```

por:

```ts
    const requestTypeRepo = createFakeRequestTypeRepo([
      { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true },
      { id: 'tipo-desativado', nome: 'Desativado', exigeDescricaoObrigatoria: false, ativo: false },
    ]);
    const requestRepo = createFakeRequestRepo();
    const photoUploader = createFakePhotoUploader();
    const userRepo = createFakeUserRepo();
    const auditLogRepo = createFakeAuditLogRepo();
    const service = new RequestService({ requestRepo, requestTypeRepo, photoUploader, userRepo, auditLogRepo });
```

No teste `'exige descrição do assunto ao trocar para um tipo "Outros" sem descrição já armazenada'`, troque:

```ts
    const requestTypeRepo = createFakeRequestTypeRepo([
      { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true },
      { id: 'tipo-outros', nome: 'Outros', exigeDescricaoObrigatoria: true, ativo: true },
    ]);
    const requestRepo = createFakeRequestRepo();
    const photoUploader = createFakePhotoUploader();
    const userRepo = createFakeUserRepo();
    const service = new RequestService({ requestRepo, requestTypeRepo, photoUploader, userRepo });
    const demanda = await criarDemandaFake(requestRepo, 'user-eu');

    const resultado = await service.editar(
      demanda.id,
      { requestTypeId: 'tipo-outros' },
      { id: 'user-eu', role: 'ASSESSOR_RUA' },
    );
    expect(resultado.status).toBe('descricao_outro_obrigatoria');
```

por:

```ts
    const requestTypeRepo = createFakeRequestTypeRepo([
      { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true },
      { id: 'tipo-outros', nome: 'Outros', exigeDescricaoObrigatoria: true, ativo: true },
    ]);
    const requestRepo = createFakeRequestRepo();
    const photoUploader = createFakePhotoUploader();
    const userRepo = createFakeUserRepo();
    const auditLogRepo = createFakeAuditLogRepo();
    const service = new RequestService({ requestRepo, requestTypeRepo, photoUploader, userRepo, auditLogRepo });
    const demanda = await criarDemandaFake(requestRepo, 'user-eu');

    const resultado = await service.editar(
      demanda.id,
      { requestTypeId: 'tipo-outros' },
      { id: 'user-eu', role: 'ASSESSOR_RUA' },
    );
    expect(resultado.status).toBe('descricao_outro_obrigatoria');
```

(Essa segunda troca inclui as linhas seguintes ao `new RequestService(...)` só para tornar o trecho único dentro do arquivo — a única mudança real é a linha `const service = new RequestService(...)` e a linha `const auditLogRepo = ...` adicionada antes dela.)

No teste `'rejeita apagar a descrição de uma demanda que já é "Outros", mesmo sem mandar requestTypeId'`, troque:

```ts
    const requestTypeRepo = createFakeRequestTypeRepo([
      { id: 'tipo-outros', nome: 'Outros', exigeDescricaoObrigatoria: true, ativo: true },
    ]);
    const requestRepo = createFakeRequestRepo();
    const photoUploader = createFakePhotoUploader();
    const userRepo = createFakeUserRepo();
    const service = new RequestService({ requestRepo, requestTypeRepo, photoUploader, userRepo });
```

por:

```ts
    const requestTypeRepo = createFakeRequestTypeRepo([
      { id: 'tipo-outros', nome: 'Outros', exigeDescricaoObrigatoria: true, ativo: true },
    ]);
    const requestRepo = createFakeRequestRepo();
    const photoUploader = createFakePhotoUploader();
    const userRepo = createFakeUserRepo();
    const auditLogRepo = createFakeAuditLogRepo();
    const service = new RequestService({ requestRepo, requestTypeRepo, photoUploader, userRepo, auditLogRepo });
```

No teste `'permite trocar para um tipo "Outros" quando a descrição é fornecida junto'`, troque:

```ts
    const requestTypeRepo = createFakeRequestTypeRepo([
      { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true },
      { id: 'tipo-outros', nome: 'Outros', exigeDescricaoObrigatoria: true, ativo: true },
    ]);
    const requestRepo = createFakeRequestRepo();
    const photoUploader = createFakePhotoUploader();
    const userRepo = createFakeUserRepo();
    const service = new RequestService({ requestRepo, requestTypeRepo, photoUploader, userRepo });
    const demanda = await criarDemandaFake(requestRepo, 'user-eu');

    const resultado = await service.editar(
      demanda.id,
      { requestTypeId: 'tipo-outros', descricaoOutroAssunto: 'Detalhe do assunto' },
      { id: 'user-eu', role: 'ASSESSOR_RUA' },
    );
    expect(resultado.status).toBe('ok');
```

por:

```ts
    const requestTypeRepo = createFakeRequestTypeRepo([
      { id: 'tipo-1', nome: 'Tapa-buraco', exigeDescricaoObrigatoria: false, ativo: true },
      { id: 'tipo-outros', nome: 'Outros', exigeDescricaoObrigatoria: true, ativo: true },
    ]);
    const requestRepo = createFakeRequestRepo();
    const photoUploader = createFakePhotoUploader();
    const userRepo = createFakeUserRepo();
    const auditLogRepo = createFakeAuditLogRepo();
    const service = new RequestService({ requestRepo, requestTypeRepo, photoUploader, userRepo, auditLogRepo });
    const demanda = await criarDemandaFake(requestRepo, 'user-eu');

    const resultado = await service.editar(
      demanda.id,
      { requestTypeId: 'tipo-outros', descricaoOutroAssunto: 'Detalhe do assunto' },
      { id: 'user-eu', role: 'ASSESSOR_RUA' },
    );
    expect(resultado.status).toBe('ok');
```

Adicione um teste novo dentro do `describe('RequestService.editar', ...)` já existente, logo após o teste `'assessor de rua edita a própria demanda antes de protocolada'`:

```ts
  it('grava EDITAR_DEMANDA em auditoria com quem editou como ator, não com quem criou', async () => {
    const { service, requestRepo, auditLogRepo } = buildService();
    const demanda = await criarDemandaFake(requestRepo, 'user-eu');

    const resultado = await service.editar(
      demanda.id,
      { tituloResumido: 'Editado pelo gabinete' },
      { id: 'gabinete-1', role: 'ASSESSOR_GABINETE' },
    );

    expect(resultado.status).toBe('ok');
    expect(auditLogRepo.records).toHaveLength(1);
    expect(auditLogRepo.records[0]).toMatchObject({
      actorUserId: 'gabinete-1',
      acao: 'EDITAR_DEMANDA',
      entidade: 'Request',
      entidadeId: demanda.id,
    });
  });
```

- [ ] **Step 6: Rodar os testes unitários afetados**

Run: `cd backend && npx vitest run tests/unit/request-service-criar.test.ts tests/unit/request-service-consultas.test.ts`
Expected: todos os testes (existentes + os 2 novos) passando.

- [ ] **Step 7: Rodar a suíte completa do backend e o typecheck**

Run: `cd backend && npm test && npm run typecheck`
Expected: 100% dos arquivos e testes passando (confirma que a mudança na assinatura do construtor e dos métodos não quebrou nada em `app.ts` nem em nenhum outro teste), typecheck limpo. Pode levar ~10-15min via Neon real — não coloque em segundo plano, aguarde o resultado completo.

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/request.service.ts backend/src/controllers/request.controller.ts backend/src/app.ts backend/tests/unit/request-service-criar.test.ts backend/tests/unit/request-service-consultas.test.ts
git commit -m "feat(backend): grava CRIAR_DEMANDA e EDITAR_DEMANDA em AuditLog"
```

---

## Verificação final (após a Task 1)

Rodar a suíte completa do backend mais uma vez, sobre a árvore final do branch:

```bash
cd backend && npm test && npm run typecheck
```

Deve passar 100% antes da revisão final de branch.
