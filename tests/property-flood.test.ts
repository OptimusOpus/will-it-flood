import { assessLots, highestPropertyBand, lotIncomplete, lotStatus } from '../pages/popup/src/property-flood';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Parcel } from '../pages/popup/src/property-search';

const property: Parcel[] = ['1RP12345', '2RP12345', '3RP12345'].map(lotPlan => ({
  council: 'brisbane',
  label: '10 Main Street',
  propertyId: '77',
  lotPlan,
}));

test('one failed lot cannot erase a confirmed exposure or turn an incomplete holding into a clean result', async t => {
  t.mock.method(globalThis, 'fetch', async (url: URL) => {
    const lotplan = url.searchParams.get('refine')?.slice('lotplan:'.length);
    if (lotplan === '1RP12345') return new Response(null, { status: 503 });
    const results =
      lotplan === '2RP12345'
        ? [{ lotplan, metric: 'FL_HIGH_CREEK', value: '5' }]
        : [{ lotplan, metric: 'MIN_GROUND_RL', value: '25' }];
    return Response.json({ total_count: results.length, results });
  });
  const lots = await assessLots(property, new AbortController().signal);
  assert.deepEqual(lots.map(lotStatus), ['unavailable', 'mapped', 'no-flags']);
  assert.deepEqual(lots.map(lotIncomplete), [true, false, false]);
  assert.equal(highestPropertyBand(lots), 'High');
});

test('cancelling an address assessment stops queued parcel requests', async t => {
  const abort = new AbortController();
  const fetchData = t.mock.method(globalThis, 'fetch', async () => {
    abort.abort();
    throw abort.signal.reason;
  });
  await assert.rejects(assessLots(property, abort.signal), { name: 'AbortError' });
  assert.equal(fetchData.mock.callCount(), 1);
});
