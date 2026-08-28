import type { UserRepository, PublicUser } from '../repositories/user.repository.js';
import type { RefreshTokenRepository } from '../repositories/refresh-token.repository.js';
import type { LoginAttemptRepository } from '../repositories/login-attempt.repository.js';
import type { AuditLogRepository } from '../repositories/audit-log.repository.js';
import { hashPin, verifyPin, isPinFormatValid, isPinObvious } from '../utils/pin.js';
import { signAccessToken, generateRefreshTokenValue, hashRefreshTokenValue } from '../utils/jwt.js';

const JANELA_BLOQUEIO_MS = 15 * 60 * 1000;
const LIMITE_TENTATIVAS = 5;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type LoginResult =
  | { status: 'ok'; accessToken: string; refreshToken: string; user: PublicUser }
  | { status: 'primeiro_acesso'; userId: string }
  | { status: 'bloqueado'; ate: Date }
  | { status: 'credenciais_invalidas' }
  | { status: 'inativo' };

export type RefreshResult =
  | { status: 'ok'; accessToken: string; refreshToken: string }
  | { status: 'invalido' }
  | { status: 'usuario_inativo' };

export type DefinirPinResult =
  | { status: 'ok'; accessToken: string; refreshToken: string; user: PublicUser }
  | { status: 'pin_invalido'; motivo: 'formato' | 'obvio' }
  | { status: 'usuario_nao_encontrado' };

export type TrocarPinResult =
  | { status: 'ok' }
  | { status: 'pin_atual_incorreto' }
  | { status: 'pin_novo_invalido'; motivo: 'formato' | 'obvio' };

export class AuthService {
  private userRepo: UserRepository;
  private refreshTokenRepo: RefreshTokenRepository;
  private loginAttemptRepo: LoginAttemptRepository;
  private auditLogRepo: AuditLogRepository;

  constructor(deps: {
    userRepo: UserRepository;
    refreshTokenRepo: RefreshTokenRepository;
    loginAttemptRepo: LoginAttemptRepository;
    auditLogRepo: AuditLogRepository;
  }) {
    this.userRepo = deps.userRepo;
    this.refreshTokenRepo = deps.refreshTokenRepo;
    this.loginAttemptRepo = deps.loginAttemptRepo;
    this.auditLogRepo = deps.auditLogRepo;
  }

  async login(input: { telefone: string; pin: string; ip?: string; userAgent?: string }): Promise<LoginResult> {
    const falhasRecentes = await this.loginAttemptRepo.countRecentFailures(input.telefone, JANELA_BLOQUEIO_MS);
    if (falhasRecentes >= LIMITE_TENTATIVAS) {
      const oldestFailureAt = await this.loginAttemptRepo.getOldestRecentFailureAt(input.telefone, JANELA_BLOQUEIO_MS);
      const ate = oldestFailureAt ? new Date(oldestFailureAt.getTime() + JANELA_BLOQUEIO_MS) : new Date(Date.now() + JANELA_BLOQUEIO_MS);
      return { status: 'bloqueado', ate };
    }

    const user = await this.userRepo.findByTelefone(input.telefone);

    if (!user) {
      await this.loginAttemptRepo.record({ telefone: input.telefone, sucesso: false, ip: input.ip, userAgent: input.userAgent });
      return { status: 'credenciais_invalidas' };
    }

    if (!user.ativo) {
      await this.loginAttemptRepo.record({ telefone: input.telefone, sucesso: false, ip: input.ip, userAgent: input.userAgent });
      return { status: 'inativo' };
    }

    if (!user.pinDefinido || !user.pinHash) {
      // Sem PIN ainda: a identificação (telefone ativo) foi validada, então registra como
      // sucesso para manter a trilha de auditoria completa, mesmo sem PIN conferido.
      await this.loginAttemptRepo.record({ telefone: input.telefone, sucesso: true, ip: input.ip, userAgent: input.userAgent });
      return { status: 'primeiro_acesso', userId: user.id };
    }

    const pinValido = await verifyPin(input.pin, user.pinHash);
    if (!pinValido) {
      await this.loginAttemptRepo.record({ telefone: input.telefone, sucesso: false, ip: input.ip, userAgent: input.userAgent });
      return { status: 'credenciais_invalidas' };
    }

    await this.loginAttemptRepo.record({ telefone: input.telefone, sucesso: true, ip: input.ip, userAgent: input.userAgent });

    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    const refreshTokenValue = generateRefreshTokenValue();
    await this.refreshTokenRepo.create({
      userId: user.id,
      tokenHash: hashRefreshTokenValue(refreshTokenValue),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      createdByIp: input.ip,
    });

    const { pinHash: _pinHash, ...publicUser } = user;
    return { status: 'ok', accessToken, refreshToken: refreshTokenValue, user: publicUser };
  }

  async refresh(input: { refreshToken: string; ip?: string }): Promise<RefreshResult> {
    const tokenHash = hashRefreshTokenValue(input.refreshToken);
    const stored = await this.refreshTokenRepo.findValidByHash(tokenHash);

    if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      return { status: 'invalido' };
    }

    const user = await this.userRepo.findById(stored.userId);
    if (!user || !user.ativo) {
      await this.refreshTokenRepo.revoke(stored.id);
      return { status: 'usuario_inativo' };
    }

    await this.refreshTokenRepo.revoke(stored.id);

    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    const newRefreshValue = generateRefreshTokenValue();
    await this.refreshTokenRepo.create({
      userId: user.id,
      tokenHash: hashRefreshTokenValue(newRefreshValue),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      createdByIp: input.ip,
    });

    return { status: 'ok', accessToken, refreshToken: newRefreshValue };
  }

  async logout(input: { refreshToken: string }): Promise<void> {
    const tokenHash = hashRefreshTokenValue(input.refreshToken);
    const stored = await this.refreshTokenRepo.findValidByHash(tokenHash);
    if (stored && !stored.revokedAt) {
      await this.refreshTokenRepo.revoke(stored.id);
    }
  }

  private validarNovoPin(pin: string): { status: 'pin_invalido'; motivo: 'formato' | 'obvio' } | null {
    if (!isPinFormatValid(pin)) return { status: 'pin_invalido', motivo: 'formato' };
    if (isPinObvious(pin)) return { status: 'pin_invalido', motivo: 'obvio' };
    return null;
  }

  async definirPinInicial(input: { userId: string; novoPin: string; ip?: string }): Promise<DefinirPinResult> {
    const user = await this.userRepo.findById(input.userId);
    if (!user) return { status: 'usuario_nao_encontrado' };

    const erroFormato = this.validarNovoPin(input.novoPin);
    if (erroFormato) return erroFormato;

    const pinHash = await hashPin(input.novoPin);
    await this.userRepo.setPinHash(user.id, pinHash);

    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    const refreshTokenValue = generateRefreshTokenValue();
    await this.refreshTokenRepo.create({
      userId: user.id,
      tokenHash: hashRefreshTokenValue(refreshTokenValue),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      createdByIp: input.ip,
    });

    const { pinHash: _pinHash, ...publicUser } = user;
    return { status: 'ok', accessToken, refreshToken: refreshTokenValue, user: { ...publicUser, pinDefinido: true } };
  }

  async trocarPin(input: { userId: string; pinAtual: string; novoPin: string }): Promise<TrocarPinResult> {
    const user = await this.userRepo.findById(input.userId);
    if (!user || !user.pinHash || !(await verifyPin(input.pinAtual, user.pinHash))) {
      return { status: 'pin_atual_incorreto' };
    }

    const erroFormato = this.validarNovoPin(input.novoPin);
    if (erroFormato) return { status: 'pin_novo_invalido', motivo: erroFormato.motivo };

    const novoPinHash = await hashPin(input.novoPin);
    await this.userRepo.setPinHash(user.id, novoPinHash);
    return { status: 'ok' };
  }

  async resetarAcesso(input: { chefeId: string; userId: string }): Promise<void> {
    await this.userRepo.clearPin(input.userId);
    await this.refreshTokenRepo.revokeAllForUser(input.userId);
    await this.auditLogRepo.record({
      actorUserId: input.chefeId,
      acao: 'RESETAR_ACESSO',
      entidade: 'User',
      entidadeId: input.userId,
    });
  }
}
