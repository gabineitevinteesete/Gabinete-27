# Guia de publicação (deploy) — Gabinete Digital

Roteiro para colocar uma versão nova no ar sem quebrar nada. Marque cada passo na ordem.

## 1. Antes de tudo

- [ ] A branch `fase1-fundacao` tem tudo o que você quer publicar (PRs unidos).
- [ ] Os testes passam: `cd backend && npm test` (precisa do banco de **testes**) e `cd frontend && npm test`.
- [ ] Você sabe qual banco é qual: **desenvolvimento** (`neondb`), **testes** (`gabinete_test`) e **produção**. Nunca rode um script que apaga ou escreve dados sem conferir o nome do banco antes.

## 2. Ordem obrigatória

1. **Migração do banco** (sempre primeiro):
   ```bash
   cd backend
   npm run prisma:migrate:deploy
   ```
   Use a connection string **sem** `-pooler` em `DIRECT_URL` (a migração não funciona pelo pooler). Para confirmar: `npx prisma migrate status` deve dizer "Database schema is up to date".
2. **Backend** (Render): publique só depois da migração. Se o backend novo subir antes, as rotas de demanda dão erro 500 (a coluna nova não existe).
3. **Frontend** (Vercel): por último.

Migrações pendentes que ainda não foram aplicadas nos bancos de desenvolvimento e produção costumam ser a causa nº 1 de erro 500 depois de publicar. Confira o `migrate status` nos dois.

## 3. Variáveis de ambiente

**Backend** (Render) — ver `backend/.env.example`:

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Neon, connection string **com** `-pooler` (uso do app) |
| `DIRECT_URL` | Neon, connection string **sem** `-pooler` (só migrações) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | segredos aleatórios longos (não reutilize os de desenvolvimento) |
| `FRONTEND_URL` | endereço exato do frontend (CORS e cookies), ex.: `https://seu-app.vercel.app` |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | fotos das demandas |
| `COOKIE_SAME_SITE` | `none` quando frontend e backend ficam em domínios diferentes (Vercel + Render). Com `lax` o login não sobrevive a um reload |
| `NODE_ENV` | `production` |

**Frontend** (Vercel): `NEXT_PUBLIC_API_URL` = endereço do backend.

## 4. Primeiro chefe

Um banco novo não tem usuário nenhum. Crie o primeiro chefe uma única vez, no ambiente certo:

```bash
cd backend
SEED_CHEFE_TELEFONE="+5534999990000" SEED_CHEFE_NOME="Nome do Chefe" SEED_CHEFE_PIN="<PIN de 6 dígitos não óbvio>" npm run prisma:seed
```

O seed também cria os assuntos iniciais (pode rodar de novo sem duplicar). Depois do primeiro login, troque o PIN pelo próprio sistema. Não deixe o PIN em histórico de terminal compartilhado.

## 5. Cloudinary (fotos)

- Antes de publicar, confirme que a conta está ativa: um envio de demanda com fotos precisa terminar com sucesso. Se aparecer `cloud_name is disabled`, a conta do Cloudinary está desativada — reative-a ou troque as credenciais, senão nenhuma demanda com foto será salva.
- As fotos são guardadas como "authenticated" (só links assinados abrem).

## 6. App instalável e uso sem internet (PWA)

- O service worker (`frontend/public/sw.js`) só é registrado em **produção** e exige **HTTPS** (a Vercel já entrega).
- Quando mudar o `sw.js`, troque `VERSAO` (`gd-v1` → `gd-v2`…) para os aparelhos descartarem o cache antigo.
- Depois de publicar uma versão nova, quem está com o app aberto pode precisar fechá-lo e abri-lo de novo para pegar a versão nova.
- Demandas criadas sem sinal ficam no aparelho até o envio. Ao sair do app, o sistema avisa se há demandas não enviadas.

## 7. Conferência depois de publicar

- [ ] Entrar como chefe e como assessor de rua.
- [ ] Recarregar a página (F5) e continuar logado (confirma o cookie `COOKIE_SAME_SITE`).
- [ ] Criar uma demanda com 2 fotos e ver a demanda no detalhe.
- [ ] Filtrar a lista e exportar a planilha (como chefe).
- [ ] No celular: instalar o app, ativar o modo avião, criar uma demanda, voltar a rede e ver a demanda sair da barra "aguardando envio".
- [ ] Abrir `/painel/privacidade` como chefe e conferir o aviso de privacidade.

## 8. Pendências conhecidas antes de uso real com dados de cidadãos

- `next@14.2.x` tem avisos de segurança sem correção na linha 14. Planejar o upgrade para uma versão maior antes do uso amplo.
- O texto do aviso de privacidade deve ser revisado pelo responsável jurídico/encarregado de dados.
- Não há política de exclusão automática: as demandas ficam até o chefe decidir; a anonimização manual existe em `/painel/privacidade`.
