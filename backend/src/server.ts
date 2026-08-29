import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { prisma } from './config/prisma.js';

const env = loadEnv();
const app = createApp(prisma);

app.listen(env.PORT, () => {
  console.log(`Gabinete Digital API rodando na porta ${env.PORT}`);
});
