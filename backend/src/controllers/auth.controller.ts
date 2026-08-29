import type { Request, Response } from 'express';
import type { AuthService } from '../services/auth.service.js';
import { loginSchema, definirPinSchema, trocarPinSchema } from '../validators/auth.validators.js';
import { getClientIp } from '../utils/request-ip.js';
import { HttpError } from '../middlewares/error-handler.js';

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function setRefreshCookie(res: Response, value: string) {
  res.cookie(REFRESH_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    path: '/auth',
  });
}

export function createAuthController(authService: AuthService) {
  return {
    async login(req: Request, res: Response) {
      const input = loginSchema.parse(req.body);
      const result = await authService.login({
        telefone: input.telefone,
        pin: input.pin,
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'],
      });

      if (result.status === 'ok') {
        setRefreshCookie(res, result.refreshToken);
        res.json({ success: true, data: { status: 'ok', accessToken: result.accessToken, user: result.user } });
        return;
      }
      if (result.status === 'primeiro_acesso') {
        res.json({ success: true, data: { status: 'primeiro_acesso', userId: result.userId } });
        return;
      }
      if (result.status === 'bloqueado') {
        res.status(429).json({ success: false, error: 'Muitas tentativas. Tente novamente mais tarde.', data: { ate: result.ate } });
        return;
      }
      res.status(401).json({ success: false, error: 'Telefone ou PIN incorretos, ou usuário inativo.' });
    },

    async primeiroAcesso(req: Request, res: Response) {
      const input = definirPinSchema.parse(req.body);
      const result = await authService.definirPinInicial({
        userId: input.userId,
        novoPin: input.novoPin,
        ip: getClientIp(req),
      });

      if (result.status === 'ok') {
        setRefreshCookie(res, result.refreshToken);
        res.json({ success: true, data: { accessToken: result.accessToken, user: result.user } });
        return;
      }
      if (result.status === 'usuario_nao_encontrado') {
        throw new HttpError(404, 'Usuário não encontrado');
      }
      throw new HttpError(400, `PIN inválido (${result.motivo})`);
    },

    async refresh(req: Request, res: Response) {
      const token = req.cookies?.[REFRESH_COOKIE_NAME];
      if (!token) throw new HttpError(401, 'Sessão não encontrada');

      const result = await authService.refresh({ refreshToken: token, ip: getClientIp(req) });
      if (result.status !== 'ok') {
        res.clearCookie(REFRESH_COOKIE_NAME, { path: '/auth' });
        throw new HttpError(401, 'Sessão expirada, faça login novamente');
      }

      setRefreshCookie(res, result.refreshToken);
      res.json({ success: true, data: { accessToken: result.accessToken } });
    },

    async logout(req: Request, res: Response) {
      const token = req.cookies?.[REFRESH_COOKIE_NAME];
      if (token) await authService.logout({ refreshToken: token });
      res.clearCookie(REFRESH_COOKIE_NAME, { path: '/auth' });
      res.status(204).send();
    },

    async trocarPin(req: Request, res: Response) {
      const input = trocarPinSchema.parse(req.body);
      const result = await authService.trocarPin({ userId: req.user!.id, pinAtual: input.pinAtual, novoPin: input.novoPin });
      if (result.status === 'ok') {
        res.json({ success: true, data: { status: 'ok' } });
        return;
      }
      if (result.status === 'pin_atual_incorreto') {
        throw new HttpError(400, 'PIN atual incorreto');
      }
      throw new HttpError(400, `Novo PIN inválido (${result.motivo})`);
    },

    async resetarAcesso(req: Request, res: Response) {
      const userId = req.params.id;
      if (!userId) throw new HttpError(400, 'Parâmetro id ausente');
      await authService.resetarAcesso({ chefeId: req.user!.id, userId });
      res.json({ success: true, data: { status: 'ok' } });
    },
  };
}
