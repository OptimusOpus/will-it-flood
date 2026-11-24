import { AddressSearchError, searchAddresses } from '../pages/popup/src/address';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';

const address = {
  property_id: '739690',
  unit_number: '86',
  house_number: '95',
  street_name: 'CHARLOTTE',
  street_type: 'Street',
  street_suffix: null,
  suburb: 'BRISBANE CITY',
  postcode: '4000',
};

const mockRecords = (t: TestContext, ...pages: object[][]) => {
  const requests: URL[] = [];
  t.mock.method(globalThis, 'fetch', async (url: URL) => {
    requests.push(url);
    const results = pages.shift();
    assert.ok(results, 'unexpected request');
    return Response.json({ results, total_count: results.length });
  });
  return requests;
};

test('matches a unit address against exact street and postcode, then joins on the Council property ID', async t => {
  const urls = mockRecords(
    t,
    [address],
    [{ property_id: '739690', lotplan: '86BUP106964', plan: 'BUP106964', lot_type: 'S' }],
    [{ lotplan: 'CPBUP106964' }],
  );
  assert.deepEqual(await searchAddresses('Unit 86/95 Charlotte St, Brisbane QLD 4000, Australia'), [
    { label: '86/95 Charlotte Street, Brisbane City QLD 4000', lotPlan: '86BUP106964', propertyId: '739690' },
    {
      label: '86/95 Charlotte Street, Brisbane City QLD 4000',
      lotPlan: 'CPBUP106964',
      propertyId: '739690',
      commonProperty: true,
    },
  ]);
  assert.equal(urls[0].hostname, 'data.brisbane.qld.gov.au');
  assert.match(urls[0].pathname, /property-address-locations\/records$/);
  const where = urls[0].searchParams.get('where')!;
  assert.match(where, /house_number="95"/);
  assert.match(where, /street_name="CHARLOTTE" and street_type="Street" and suburb="BRISBANE CITY"/);
  assert.match(where, /unit_number="86"/);
  assert.match(where, /postcode="4000"/);
  assert.match(urls[1].pathname, /property-boundaries-parcel\/records$/);
  assert.equal(urls[1].searchParams.get('where'), 'property_id in ("739690") and lot_retirement_date is null');
  assert.equal(
    urls[2].searchParams.get('where'),
    'lotplan in ("CPBUP106964") and lot="CP" and lot_retirement_date is null',
  );
});

test('returns distinct parcels and never guesses the first lot for a multi-lot address', async t => {
  mockRecords(
    t,
    [{ ...address, unit_number: null }],
    [
      { property_id: '739690', lotplan: '2SP12345', plan: 'SP12345', lot_type: 'NS' },
      { property_id: '739690', lotplan: '1SP12345', plan: 'SP12345', lot_type: 'NS' },
      { property_id: '739690', lotplan: '1SP12345', plan: 'SP12345', lot_type: 'NS' },
    ],
  );
  const options = await searchAddresses('95 Charlotte St Brisbane City');
  assert.ok(options.every(option => option.propertyId === '739690' && !option.commonProperty));
  assert.deepEqual(
    options.map(option => option.lotPlan),
    ['1SP12345', '2SP12345'],
  );
});

test('retains the suburb for an out-of-area search and stops before the parcel join', async t => {
  const urls = mockRecords(t, []);
  assert.deepEqual(await searchAddresses('95 Charlotte Street, Cairns QLD 4870'), []);
  assert.match(urls[0].searchParams.get('where')!, /suburb="CAIRNS"/);
  assert.match(urls[0].searchParams.get('where')!, /postcode="4870"/);
  assert.equal(urls.length, 1);
});

test('a house number range cannot combine unrelated properties', async t => {
  mockRecords(t, [address, { ...address, house_number: '97', property_id: 'different' }]);
  assert.deepEqual(await searchAddresses('95–97 Charlotte Street, Brisbane City'), []);
});

test('looks up a typed lot/plan directly and accepts common-property identifiers', async t => {
  const urls = mockRecords(
    t,
    [{ lotplan: '2RP210504', locality: 'New Farm', property_id: '473920' }],
    [{ lotplan: 'CPBUP106964', locality: 'Brisbane City', property_id: null }],
  );
  assert.equal((await searchAddresses('Lot 2 on RP210504'))[0].lotPlan, '2RP210504');
  assert.equal((await searchAddresses('CPBUP106964'))[0].lotPlan, 'CPBUP106964');
  assert.deepEqual(
    urls.map(url => url.searchParams.get('where')),
    ['lotplan="2RP210504" and lot_retirement_date is null', 'lotplan="CPBUP106964" and lot_retirement_date is null'],
  );
});

test('broad input and incomplete or failed provider replies remain distinguishable from zero matches', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ total_count: 150, results: [] }));
  await assert.rejects(searchAddresses('95 Charlotte St'), AddressSearchError);
  fetchMock.mock.mockImplementation(async () => Response.json({ total_count: 1, results: [] }));
  await assert.rejects(searchAddresses('95 Charlotte St'), /incomplete/);
  fetchMock.mock.mockImplementation(async () => Response.json({ total_count: 1, results: [{}] }));
  await assert.rejects(searchAddresses('95 Charlotte St'), /unexpected response/);
  fetchMock.mock.mockImplementation(async () => new Response(null, { status: 429 }));
  await assert.rejects(searchAddresses('95 Charlotte St'), /unavailable/);
});

test('a suburb alone needs a street address or lot before making a request', async t => {
  const urls = mockRecords(t);
  await assert.rejects(searchAddresses('Paddington'), AddressSearchError);
  assert.equal(urls.length, 0);
});

test('keeps the same common-property lot with each matching unit and skips unconfirmed common lots', async t => {
  const urls = mockRecords(
    t,
    [
      { ...address, property_id: '928866', unit_number: '4' },
      { ...address, property_id: '928870', unit_number: '8' },
      { ...address, property_id: '123', unit_number: '12' },
    ],
    [
      { property_id: '928866', lotplan: '4SP170677', plan: 'SP170677', lot_type: 'S' },
      { property_id: '928870', lotplan: '8SP170677', plan: 'SP170677', lot_type: 'S' },
      { property_id: '123', lotplan: '12GTP1234', plan: 'GTP1234', lot_type: 'S' },
    ],
    [{ lotplan: 'CPSP170677' }],
  );
  const matches = await searchAddresses('95 Charlotte Street, Brisbane City');
  assert.equal(urls.length, 3);
  assert.equal(matches.length, 5);
  assert.deepEqual(
    matches.filter(row => row.commonProperty).map(row => [row.propertyId, row.lotPlan]),
    [
      ['928866', 'CPSP170677'],
      ['928870', 'CPSP170677'],
    ],
  );
});

test('a directly entered strata lot stays lot-specific; retired-only holdings cannot produce a current assessment', async t => {
  const urls = mockRecords(
    t,
    [{ lotplan: '4SP170677', locality: 'Salisbury', property_id: '928866' }],
    [],
    [{ ...address, property_id: '1259902', unit_number: null }],
    [],
  );
  assert.deepEqual(
    (await searchAddresses('4SP170677')).map(row => row.lotPlan),
    ['4SP170677'],
  );
  assert.deepEqual(await searchAddresses('1RP106197'), []);
  await assert.rejects(searchAddresses('35 Swann Road, Taringa'), /current parcel/);
  assert.ok(
    [urls[0], urls[1], urls[3]].every(url => url.searchParams.get('where')?.includes('lot_retirement_date is null')),
  );
});

test('rejects a missing or unrelated parcel join even when another property has an active lot', async t => {
  const lots = [{ property_id: '739690', lotplan: '1RP123', plan: 'RP123', lot_type: 'NS' }];
  mockRecords(
    t,
    [address, { ...address, property_id: 'other' }],
    lots,
    [address],
    [{ ...lots[0], property_id: 'unrelated' }],
  );
  await assert.rejects(searchAddresses('95 Charlotte Street, Brisbane City'), /current parcel/);
  await assert.rejects(searchAddresses('95 Charlotte Street, Brisbane City'), /could not be confirmed/);
});
