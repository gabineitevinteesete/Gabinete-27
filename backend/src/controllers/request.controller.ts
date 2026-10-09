import type { Request, Response } from 'express';
import { LIMITE_EXPORTACAO, type RequestService } from '../services/request.service.js';
import { idempotencyKeySchema, criarDemandaSchema, editarDemandaSchema, listarDemandasQuerySchema, exportarDemandasQuerySchema, demandaIdParamsSchema, mudarStatusSchema, reatribuirSchema } from '../validators/request.validators.js';
import { HttpError } from '../middlewares/error-handler.js';
import { getClientIp } from '../utils/request-ip.js';

export function createRequestController(requestService: RequestService) {
  return {
    async criar(req: Request, res: Response) {
      const dados = criarDemandaSchema.parse(req.body);
      const arquivos = (req.files as Express.Multer.File[] | undefined) ?? [];
      const cabecalhoChave = req.header('idempotency-key');
      // Minúsculas: o mesmo UUID escrito em maiúsculas e em minúsculas é a mesma chave.
      const chave = cabecalhoChave === undefined ? undefined : idempotencyKeySchema.safeParse(cabecalhoChave.toLowerCase());
      if (chave && !chave.success) {
        throw new HttpError(400, 'Cabeçalho Idempotency-Key inválido');
      }

      const resultado = await requestService.criar({
        ...dados,
        assessorResponsavelId: req.user!.id,
        fotos: arquivos.map((arquivo) => arquivo.buffer),
        ip: getClientIp(req),
        idempotencyKey: chave?.data,
      });

      if (resultado.status === 'ok') {
        res.status(201).json({ success: true, data: resultado.demanda });
        return;
      }
      if (resultado.status === 'ok_reenvio_sem_acesso') {
        res.status(201).json({ success: true, data: { id: resultado.id, codigoInterno: resultado.codigoInterno } });
        return;
      }
      if (resultado.status === 'tipo_invalido') {
        throw new HttpError(400, 'Tipo de demanda inválido ou desativado');
      }
      if (resultado.status === 'descricao_outro_obrigatoria') {
        throw new HttpError(400, 'Descrição do assunto é obrigatória quando o tipo é "Outros"');
      }
      if (resultado.status === 'telefone_invalido') {
        throw new HttpError(400, 'Telefone do solicitante inválido');
      }
      if (resultado.status === 'quantidade_fotos_invalida') {
        throw new HttpError(400, 'Envie de 2 a 4 fotos');
      }
      if (resultado.status === 'autorizacao_obrigatoria') {
        throw new HttpError(400, 'É necessário autorizar o uso e armazenamento dos dados');
      }
      throw new HttpError(400, `Foto inválida (posição ${resultado.indice + 1}). Envie apenas JPG, PNG ou WebP.`);
    },

    async listar(req: Request, res: Response) {
      const query = listarDemandasQuerySchema.parse(req.query);
      const { pagina, tamanhoPagina, ...filtro } = query;
      const resultado = await requestService.listar(filtro, { pagina, tamanhoPagina }, req.user!);
      res.json({
        success: true,
        data: { items: resultado.items, total: resultado.total, pagina, tamanhoPagina },
      });
    },

    async exportar(req: Request, res: Response) {
      const filtro = exportarDemandasQuerySchema.parse(req.query);
      const resultado = await requestService.exportar(filtro, req.user!.id, getClientIp(req));
      if (resultado.status === 'limite_excedido') {
        throw new HttpError(400, `Muitos resultados (${resultado.total}). O limite é de ${LIMITE_EXPORTACAO} linhas; refine os filtros.`);
      }
      // en-CA formata como AAAA-MM-DD.
      const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Disposition', `attachment; filename="demandas-${hoje}.csv"`);
      res.send(resultado.csv);
    },

    async buscarPorId(req: Request, res: Response) {
      const { id } = demandaIdParamsSchema.parse(req.params);
      const resultado = await requestService.buscarPorId(id, req.user!);
      if (resultado.status === 'nao_encontrada') throw new HttpError(404, 'Demanda não encontrada');
      if (resultado.status === 'sem_permissao') throw new HttpError(403, 'Você não tem acesso a esta demanda');
      res.json({ success: true, data: resultado.demanda });
    },

    async editar(req: Request, res: Response) {
      const { id } = demandaIdParamsSchema.parse(req.params);
      const dados = editarDemandaSchema.parse(req.body);
      const resultado = await requestService.editar(id, dados, req.user!, getClientIp(req));
      if (resultado.status === 'nao_encontrada') throw new HttpError(404, 'Demanda não encontrada');
      if (resultado.status === 'sem_permissao') throw new HttpError(403, 'Você não tem permissão para editar esta demanda');
      if (resultado.status === 'tipo_invalido') {
        throw new HttpError(400, 'Tipo de demanda inválido ou desativado');
      }
      if (resultado.status === 'descricao_outro_obrigatoria') {
        throw new HttpError(400, 'Descrição do assunto é obrigatória quando o tipo é "Outros"');
      }
      if (resultado.status === 'telefone_invalido') {
        throw new HttpError(400, 'Telefone do solicitante inválido');
      }
      res.json({ success: true, data: resultado.demanda });
    },

    async mudarStatus(req: Request, res: Response) {
      const { id } = demandaIdParamsSchema.parse(req.params);
      const dados = mudarStatusSchema.parse(req.body);
      const resultado = await requestService.mudarStatus(id, dados.novoStatus, dados.motivo, req.user!.id);
      if (resultado.status === 'nao_encontrada') throw new HttpError(404, 'Demanda não encontrada');
      if (resultado.status === 'transicao_invalida') throw new HttpError(400, 'Transição de status inválida');
      if (resultado.status === 'motivo_obrigatorio') {
        throw new HttpError(400, 'É necessário informar o motivo para esta transição');
      }
      res.json({ success: true, data: resultado.demanda });
    },

    async historicoStatus(req: Request, res: Response) {
      const { id } = demandaIdParamsSchema.parse(req.params);
      const resultado = await requestService.listarHistoricoStatus(id, req.user!);
      if (resultado.status === 'nao_encontrada') throw new HttpError(404, 'Demanda não encontrada');
      if (resultado.status === 'sem_permissao') throw new HttpError(403, 'Você não tem acesso a esta demanda');
      res.json({ success: true, data: resultado.historico });
    },

    async reatribuir(req: Request, res: Response) {
      const { id } = demandaIdParamsSchema.parse(req.params);
      const dados = reatribuirSchema.parse(req.body);
      const resultado = await requestService.reatribuir(id, dados.novoAssessorId, req.user!.id);
      if (resultado.status === 'nao_encontrada') throw new HttpError(404, 'Demanda não encontrada');
      if (resultado.status === 'assessor_invalido') throw new HttpError(400, 'Assessor inválido ou inativo');
      res.json({ success: true, data: resultado.demanda });
    },

    async anonimizar(req: Request, res: Response) {
      const { id } = demandaIdParamsSchema.parse(req.params);
      const resultado = await requestService.anonimizar(id, req.user!.id, getClientIp(req));
      if (resultado.status === 'nao_encontrada') throw new HttpError(404, 'Demanda não encontrada');
      res.json({ success: true, data: { status: 'ok' } });
    },
  };
}
