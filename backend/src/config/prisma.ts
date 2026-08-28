import { PrismaClient } from '@prisma/client';
import { loadEnv } from './env.js';

loadEnv();

export const prisma = new PrismaClient();
