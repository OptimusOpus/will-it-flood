import { AddressSearchError } from '../pages/popup/src/address-input';
import { searchLoganAddresses } from '../pages/popup/src/logan-address';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';

const address = {
  Property_Key: 296422,
  Address_Formatted: '105 George Street\rBEENLEIGH  QLD  4207',
  Street_Name: 'GEORGE STREET',
  Suburb: 'BEENLEIGH',
  Postcode: '4207',
};
const parcel = {
  Property_Key: 296422,
  Address_Formatted: '105 George Street BEENLEIGH  QLD  4207',
  Formatted_Lot_Plan: 'Lot 1 RP 128941',
};

const reply = (t: TestContext, ...pages: object[][]) => {
  const urls: URL[] = [];
  t.mock.method(globalThis, 'fetch', async (url: URL) => {
    urls.push(url);
    const rows = pages.shift();
    assert.ok(rows, 'unexpected service request');
    return Response.json({ features: rows.map(attributes => ({ attributes })) });
  });
  return urls;
};

test('joins Logan’s public Beenleigh office address to its current parcel using the Council property key', async t => {
  const urls = reply(t, [address], [parcel]);
  assert.deepEqual(await searchLoganAddresses('105 George St, Beenleigh QLD 4207'), [
    {
      council: 'logan',
      label: '105 George Street, Beenleigh QLD 4207',
      lotPlan: '1RP128941',
      formattedLotPlan: 'Lot 1 RP 128941',
      propertyKey: 296422,
    },
  ]);
  assert.match(urls[0].pathname, /LCC_Primary_Property_Address/);
  assert.match(urls[0].searchParams.get('where')!, /Postcode='4207'/);
  assert.match(urls[0].searchParams.get('where')!, /'GEORGE STREET'\)\) AND Suburb='BEENLEIGH'/);
  assert.match(urls[0].searchParams.get('where')!, /LIKE '105 GEORGE%'/);
  assert.equal(urls[1].searchParams.get('where'), 'Property_Key IN (296422)');
});

test('keeps unit, letter, range, street suffix, locality and postcode exact', async t => {
  const unit = {
    ...address,
    Address_Formatted: "Civic Centre\r2A/105A-109B O'Neil Road East\rBEENLEIGH  QLD  4207",
    Street_Name: "O'NEIL ROAD EAST",
  };
  const input = "Unit 2A/105A–109B O'Neil Rd E, Beenleigh QLD 4207";
  const variants = [
    input.replace('2A/', '2/'),
    input.replace('105A', '105'),
    input.replace('109B', '109'),
    input.replace('105A–109B', '106B'),
    input.replace('Rd E,', 'Rd,'),
    input.replace('Beenleigh', 'Cairns'),
    input.replace('4207', '4870'),
  ];
  const urls = reply(t, [unit], [parcel], ...variants.map(() => [unit]));
  assert.equal((await searchLoganAddresses(input))[0].label, "2A/105A-109B O'Neil Road East, Beenleigh QLD 4207");
  assert.match(urls[0].searchParams.get('where')!, /O''NEIL/);
  assert.match(urls[0].searchParams.get('where')!, /LIKE '2A\/105A-109B O''NEIL%'/);
  for (const variant of variants) assert.deepEqual(await searchLoganAddresses(variant), []);
});

test('returns every distinct parcel joined to the address', async t => {
  reply(t, [address], [parcel, parcel, { ...parcel, Formatted_Lot_Plan: 'Lot 2 RP 128941' }]);
  assert.deepEqual(
    (await searchLoganAddresses('105 George Beenleigh')).map(x => x.lotPlan),
    ['1RP128941', '2RP128941'],
  );
});

test('confirms a directly entered lot in the Logan cadastre, preserving an explicit letter suffix', async t => {
  const urls = reply(t, [parcel], [], [{ ...parcel, Formatted_Lot_Plan: 'Lot 2A RP 1234' }]);
  assert.equal((await searchLoganAddresses('Lot 1 on RP128941'))[0].lotPlan, '1RP128941');
  assert.deepEqual(await searchLoganAddresses('123RP7890'), []);
  assert.equal((await searchLoganAddresses('Lot 2A on RP1234'))[0].lotPlan, '2ARP1234');
  assert.match(urls[0].pathname, /VIEW_Latest_Cadastre/);
  assert.equal(urls[2].searchParams.get('where'), "Formatted_Lot_Plan IN ('Lot 2A RP 1234')");
});

test('rejects missing parcel joins, unrelated keys and ArcGIS errors instead of treating them as no matches', async t => {
  reply(
    t,
    [address],
    [],
    [address],
    [{ ...parcel, Property_Key: 999 }],
    [{ ...parcel, Formatted_Lot_Plan: 'Lot 2 SP 456' }],
  );
  await assert.rejects(searchLoganAddresses('105 George St'), /confirm all its parcels/);
  await assert.rejects(searchLoganAddresses('105 George St'), /could not be confirmed/);
  await assert.rejects(searchLoganAddresses('1RP128941'), /could not be confirmed/);
});

test('distinguishes an ArcGIS error, incomplete results, malformed attributes and an empty search', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { code: 499 } }));
  await assert.rejects(searchLoganAddresses('105 George St'), /unavailable/);
  fetch.mock.mockImplementation(async () => Response.json({ exceededTransferLimit: true, features: [] }));
  await assert.rejects(searchLoganAddresses('105 George St'), AddressSearchError);
  fetch.mock.mockImplementation(async () =>
    Response.json({ features: [{ attributes: { ...address, Street_Name: {} } }] }),
  );
  await assert.rejects(searchLoganAddresses('105 George St'), /unexpected record/);
  fetch.mock.mockImplementation(async () => Response.json({ features: [] }));
  assert.deepEqual(await searchLoganAddresses('105 George St'), []);
});

test('matches house range members on the correct side of the street and preserves full Council labels', async t => {
  const ranges = ['29-31', '24-30'].map((number, index) => ({
    ...address,
    Property_Key: 100 + index,
    Address_Formatted: number + ' Sunningdale Avenue\rROCHEDALE SOUTH  QLD  4123',
    Street_Name: 'SUNNINGDALE AVENUE',
    Suburb: 'ROCHEDALE SOUTH',
    Postcode: '4123',
  }));
  const urls = reply(
    t,
    ranges,
    [{ ...parcel, Property_Key: 100 }],
    ranges,
    [{ ...parcel, Property_Key: 100 }],
    ranges,
    [{ ...parcel, Property_Key: 101 }],
    ranges,
    [{ ...parcel, Property_Key: 101 }],
    ranges,
  );
  for (const [input, expected] of [
    ['29', '29-31'],
    ['31', '29-31'],
    ['30', '24-30'],
    ['26', '24-30'],
  ]) {
    const hits = await searchLoganAddresses(input + ' Sunningdale Ave, Rochedale South QLD 4123');
    assert.deepEqual(
      hits.map(hit => hit.label),
      [expected + ' Sunningdale Avenue, Rochedale South QLD 4123'],
    );
  }
  assert.deepEqual(await searchLoganAddresses('24-28 Sunningdale Ave, Rochedale South QLD 4123'), []);
  assert.match(urls[0].searchParams.get('where')!, /Start_House_Number/);
  assert.match(urls[0].searchParams.get('where')!, /End_House_Number/);
});

test('matches a unit range written in full or one of its units without widening an explicit range', async t => {
  const row = {
    ...address,
    Address_Formatted: '9-10/22 Allgas Street\rSLACKS CREEK  QLD  4127',
    Street_Name: 'ALLGAS STREET',
    Suburb: 'SLACKS CREEK',
    Postcode: '4127',
  };
  const urls = reply(t, [row], [parcel], [row], [parcel], [row], [parcel], [row], [row]);
  for (const unit of ['9-10', '9', 'Unit 10']) {
    const hits = await searchLoganAddresses(unit + '/22 Allgas St, Slacks Creek 4127');
    assert.equal(hits[0]?.label, '9-10/22 Allgas Street, Slacks Creek QLD 4127');
  }
  for (const other of ['8-10', '11']) assert.deepEqual(await searchLoganAddresses(other + '/22 Allgas St'), []);
  assert.match(urls[4].searchParams.get('where')!, /End_Unit_Number/);
});

test('preserves letter, part and balance lot descriptors on address and direct lookups', async t => {
  const descriptors = ['Lot A PER 2376', 'Pt Lot 9 RP 127143', 'Bal Lot 60 RP 118009'];
  const rows = descriptors.map(Formatted_Lot_Plan => ({ ...parcel, Formatted_Lot_Plan }));
  const urls = reply(t, [address], rows, ...rows.map(row => [row]));
  const hits = await searchLoganAddresses('105 George St, Beenleigh QLD 4207');
  assert.deepEqual(hits.map(x => x.formattedLotPlan).sort(), [...descriptors].sort());
  for (const [i, descriptor] of descriptors.entries()) {
    const match = await searchLoganAddresses(descriptor);
    assert.equal(match[0]?.formattedLotPlan, descriptor);
    assert.equal(urls[2 + i].searchParams.get('where'), "Formatted_Lot_Plan IN ('" + descriptor + "')");
  }
  assert.equal(hits.find(x => x.formattedLotPlan.startsWith('Pt'))?.lotPlan, 'Pt Lot 9 RP 127143');
});
