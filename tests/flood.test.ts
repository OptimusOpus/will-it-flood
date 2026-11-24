import { lookupFlood } from '../pages/popup/src/flood';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const lot = '28SP103292';
const parcelResponse = (metrics: [string, string][], lotplan = lot) =>
  Response.json({
    total_count: metrics.length,
    results: metrics.map(([metric, value]) => ({ lotplan, metric, value })),
  });

test('returns the highest flagged likelihood for each source and keeps overland flow distinct', async context => {
  context.mock.method(globalThis, 'fetch', async (url: URL, init: RequestInit) => {
    assert.equal(url.searchParams.get('refine'), `lotplan:${lot}`);
    assert.equal(init.credentials, 'omit');
    return parcelResponse([
      ['FL_VLOW_RIVER', '1'],
      ['FL_LOW_RIVER', '2'],
      ['FL_HIGH_RIVER', '5'],
      ['FL_MED_CREEK', '3'],
      ['OLF_FLAG', '1'],
      ['FL_HIS1_RIVER_DATE', 'February 2022'],
    ]);
  });
  assert.deepEqual(await lookupFlood(lot), {
    status: 'mapped',
    sources: [
      { name: 'River', level: 'High' },
      { name: 'Creek', level: 'Medium' },
      { name: 'Overland flow', level: 'Mapped' },
    ],
    coverage: [],
    history: [{ source: 'River', date: 'February 2022', level: null }],
    ground: { min: null, max: null },
    reportUrl: 'https://fwpr.brisbane.qld.gov.au/?lotplan=28SP103292',
  });
});

test('positive creek coverage on 2RP226458 gives a mapped result without a likelihood flag', async context => {
  const pritchard = '2RP226458';
  context.mock.method(globalThis, 'fetch', async () =>
    parcelResponse(
      [
        ['FL_05_COV_CREEK', '5138.43'],
        ['FL_02_COV_CREEK', '5527.64'],
        ['FL_01_COV_CREEK', '5527.64'],
        ['05AEP_CREEK', '8.1'],
        ['MIN_GROUND_RL', '7.2'],
        ['MAX_GROUND_RL', '8.4'],
      ],
      pritchard,
    ),
  );
  const result = await lookupFlood(pritchard);
  assert.equal(result.status, 'mapped');
  assert.deepEqual(result.sources, []);
  assert.deepEqual(result.coverage, [{ source: 'Creek', annualChance: 5 }]);
});

test('keeps a likelihood flag independent of its source’s most frequent modelled flood coverage', async context => {
  context.mock.method(globalThis, 'fetch', async () =>
    parcelResponse([
      ['FL_LOW_ST', '2'],
      ['FL_20_COV_ST', '385.4'],
      ['FL_05_COV_ST', '416.36'],
      ['FL_02_COV_CREEK', '0.01'],
    ]),
  );
  const result = await lookupFlood(lot);
  assert.deepEqual(result.sources, [{ name: 'Storm tide', level: 'Low' }]);
  assert.deepEqual(result.coverage, [
    { source: 'Creek', annualChance: 2 },
    { source: 'Storm tide', annualChance: 20 },
  ]);
});

test('distinguishes zero coverage from malformed coverage and modelled elevation alone', async context => {
  const fetch = context.mock.method(globalThis, 'fetch', async () =>
    parcelResponse([
      ['FL_20_COV_ST', '0.00'],
      ['20AEP_RIVER', '3.0'],
    ]),
  );
  assert.equal((await lookupFlood(lot)).status, 'no-flags');
  for (const invalid of ['', 'n/a', '-1']) {
    fetch.mock.mockImplementation(async () => parcelResponse([['FL_20_COV_ST', invalid]]));
    await assert.rejects(lookupFlood(lot));
  }
});

test('preserves the 2011 Powerhouse flood level and the estimated ground range', async context => {
  const powerhouse = '2RP210504';
  context.mock.method(globalThis, 'fetch', async () =>
    parcelResponse(
      [
        ['FL_HIS1_RIVER_DATE', 'January 2011'],
        ['FL_HIS1_RIVER', '3.0'],
        ['MIN_GROUND_RL', '3.4'],
        ['MAX_GROUND_RL', '4.8'],
      ],
      powerhouse,
    ),
  );
  const result = await lookupFlood(powerhouse);
  assert.deepEqual(result.history, [{ source: 'River', date: 'January 2011', level: 3 }]);
  assert.deepEqual(result.ground, { min: 3.4, max: 4.8 });
});

test('distinguishes absent mapping flags from missing and out-of-bounds parcel data', async context => {
  const fetch = context.mock.method(globalThis, 'fetch', async () => parcelResponse([['MIN_GROUND_RL', '74.9']]));
  assert.equal((await lookupFlood(lot)).status, 'no-flags');
  fetch.mock.mockImplementation(async () => parcelResponse([]));
  assert.equal((await lookupFlood(lot)).status, 'unavailable');
  fetch.mock.mockImplementation(async () => parcelResponse([['OOB_AREA', '1']]));
  assert.equal((await lookupFlood(lot)).status, 'unavailable');
});

test('rejects failed, incomplete and mismatched council responses', async context => {
  const fetch = context.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 503 }));
  await assert.rejects(lookupFlood(lot));
  fetch.mock.mockImplementation(async () => Response.json({ total_count: 1, results: [] }));
  await assert.rejects(lookupFlood(lot));
  fetch.mock.mockImplementation(async () =>
    Response.json({ total_count: 1, results: [{ lotplan: 'OTHER', metric: 'MIN_GROUND_RL', value: '74.9' }] }),
  );
  await assert.rejects(lookupFlood(lot));
  fetch.mock.mockImplementation(async () => parcelResponse([['FL_HIGH_CREEK', 'unknown']]));
  await assert.rejects(lookupFlood(lot));
});
