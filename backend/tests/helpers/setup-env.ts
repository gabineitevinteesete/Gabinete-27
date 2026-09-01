import { config } from 'dotenv';

// Carrega opcionalmente um .env.test local (gitignorado) com uma connection string real
// de teste (ex: uma branch do Neon) — se o arquivo não existir, isso não faz nada.
config({ path: '.env.test' });

process.env.NODE_ENV ??= 'test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-0123456789';
process.env.FRONTEND_URL ??= 'http://localhost:3000';
process.env.DATABASE_URL ??= 'postgresql://gabinete:gabinete@localhost:5433/gabinete_test';
process.env.DIRECT_URL ??= process.env.DATABASE_URL;
