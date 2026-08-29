import { createApp } from '../../src/app.js';
import { testPrisma } from './reset-db.js';

export function buildTestApp() {
  return createApp(testPrisma);
}
