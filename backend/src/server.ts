import { createApp } from './app.js';
import { loadEnv } from './config/env.js';

const env = loadEnv();
const app = createApp();

app.listen(env.PORT, () => {
  console.log(`Gabinete Digital API rodando na porta ${env.PORT}`);
});
