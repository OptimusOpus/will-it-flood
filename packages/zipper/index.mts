import { resolve } from 'node:path';
import { zipBundle } from './lib/index.js';
import { IS_FIREFOX } from '@extension/env';

await zipBundle({
  distDirectory: resolve(import.meta.dirname, '..', '..', '..', 'dist'),
  buildDirectory: resolve(import.meta.dirname, '..', '..', '..', 'dist-zip'),
  archiveName: IS_FIREFOX ? 'will-it-flood.xpi' : 'will-it-flood.zip',
});
