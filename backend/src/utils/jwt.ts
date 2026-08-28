import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'node:crypto';
import { loadEnv } from '../config/env.js';

export type UserRoleValue = 'CHEFE' | 'ASSESSOR_RUA' | 'ASSESSOR_GABINETE';

export interface AccessTokenPayload {
  sub: string;
  role: UserRoleValue;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const env = loadEnv();
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: '15m' });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const env = loadEnv();
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
  if (typeof decoded === 'string' || !('sub' in decoded) || !('role' in decoded)) {
    throw new Error('Token inválido');
  }
  return { sub: decoded.sub as string, role: decoded.role as UserRoleValue };
}

export function generateRefreshTokenValue(): string {
  return randomBytes(32).toString('hex');
}

export function hashRefreshTokenValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
