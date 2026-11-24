import { config as baseConfig } from './wdio.conf.js';
import { getChromeExtensionPath, getFirefoxExtensionPath } from '../utils/extension-path.js';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const firefox = process.env.CLI_CEB_FIREFOX === 'true';
const dist = resolve(import.meta.dirname, '../../../dist');
const chromeBinary = process.env.CHROME_BINARY;

const chromeCapabilities = {
  browserName: 'chrome',
  ...(chromeBinary ? {} : { browserVersion: 'stable' }),
  'goog:chromeOptions': {
    ...(chromeBinary ? { binary: chromeBinary } : {}),
    args: ['--headless', `--load-extension=${dist}`],
  },
};

export const config: WebdriverIO.Config = {
  ...baseConfig,
  specs: ['../specs/page-popup.test.ts'],
  capabilities: firefox
    ? [{ browserName: 'firefox', 'moz:firefoxOptions': { args: ['-headless'] } }]
    : [chromeCapabilities],
  maxInstances: 1,
  logLevel: 'error',
  before: async (_caps, _specs, browser) => {
    if (firefox) {
      const archiveDir = resolve(dist, '../dist-zip');
      const file = (await readdir(archiveDir))
        .filter(path => path.endsWith('.xpi'))
        .sort()
        .at(-1);
      if (!file) throw new Error('Build the Firefox extension before starting the browser test.');
      await browser.installAddOn((await readFile(resolve(archiveDir, file))).toString('base64'), true);
      browser.addCommand('getExtensionPath', () => getFirefoxExtensionPath(browser));
    } else {
      browser.addCommand('getExtensionPath', () => getChromeExtensionPath(browser));
    }
  },
};
