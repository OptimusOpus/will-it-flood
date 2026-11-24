import { version } from '../package.json';

const manifest = {
  manifest_version: 3,
  name: 'Will It Flood?',
  version,
  description: 'Check flood mapping for Brisbane and Logan properties and open the official council map or report.',
  permissions: ['activeTab'],
  host_permissions: ['https://data.brisbane.qld.gov.au/*', 'https://arcgis.lcc.wspdigital.com/*'],
  action: {
    default_title: 'Will It Flood?',
    default_popup: 'index.html',
  },
  icons: {
    '16': 'icon-16.png',
    '32': 'icon-32.png',
    '48': 'icon-48.png',
    '128': 'icon-128.png',
  },
} satisfies chrome.runtime.ManifestV3;

export default manifest;
