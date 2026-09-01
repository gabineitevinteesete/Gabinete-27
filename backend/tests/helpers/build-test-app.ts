import { createApp } from '../../src/app.js';
import { testPrisma } from './reset-db.js';
import { createFakePhotoUploader } from './fakes.js';

export function buildTestApp() {
  return createApp(testPrisma, { photoUploader: createFakePhotoUploader() });
}
