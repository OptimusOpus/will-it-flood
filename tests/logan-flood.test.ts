import { lookupLoganFlood } from '../pages/popup/src/logan-flood';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LoganCandidate } from '../pages/popup/src/logan-address';

const example: LoganCandidate = {
  council: 'logan',
  label: '105 George Street, Beenleigh QLD 4207',
  lotPlan: '1RP128941',
  formattedLotPlan: 'Lot 1 RP 128941',
  propertyKey: 296422,
};
const geometry = {
  rings: [
    [
      [10, 10],
      [10, 20],
      [20, 20],
      [20, 10],
      [10, 10],
    ],
    [
      [15, 15],
      [18, 15],
      [18, 18],
      [15, 18],
      [15, 15],
    ],
  ],
};
const fields = (names: string) => names.split(',').map(name => ({ name }));
const parcel = {
  geometryType: 'esriGeometryPolygon',
  spatialReference: { wkid: 7856 },
  fields: fields('Property_Key,Formatted_Lot_Plan'),
  features: [{ attributes: { Property_Key: 296422, Formatted_Lot_Plan: 'Lot 1 RP 128941' }, geometry }],
};

type Row = Record<string, string>;
const council =
  (layerRows: Record<string, Row[] | Response> = {}, boundary: unknown = parcel): typeof fetch =>
  async (url, init) => {
    assert.ok(typeof url === 'string' && init);
    const p = init.body as URLSearchParams;
    assert.equal(init.credentials, 'omit');
    assert.equal(init.method, 'POST');
    if (url.includes('VIEW_Latest_Cadastre')) {
      assert.equal(p.get('where'), "Property_Key = 296422 AND Formatted_Lot_Plan = 'Lot 1 RP 128941'");
      assert.equal(p.get('outSR'), '7856');
      return Response.json(boundary);
    }
    assert.equal(p.get('spatialRel'), 'esriSpatialRelIntersects');
    assert.deepEqual(JSON.parse(p.get('geometry')!), geometry);
    assert.equal(p.get('inSR'), '7856');
    const id = url.includes('OtherInformation')
      ? 'other'
      : url.includes('AllStudyExtent')
        ? 'scenarios'
        : url.split('/').at(-2)!;
    const rows = layerRows[id] || [];
    if (rows instanceof Response) return rows;
    return Response.json({ fields: fields(p.get('outFields')!), features: rows.map(attributes => ({ attributes })) });
  };

test('checks the whole verified parcel, including holes, and links the selected Council property', async context => {
  context.mock.method(globalThis, 'fetch', council({ 9: [{ Description: 'Overland Flow Extent' }] }));
  assert.deepEqual(await lookupLoganFlood(example), {
    status: 'mapped',
    findings: [{ name: 'Overland flow', value: 'Mapped stormwater runoff' }],
    notes: [],
    unavailableLayers: [],
    reportUrl: 'https://flood.logan.qld.gov.au/?propertyKey=296422',
  });
});

test('keeps every risk category and each source’s most frequent published flood scenario', async context => {
  context.mock.method(
    globalThis,
    'fetch',
    council({
      4: [{ Description: 'Moderate Flood Risk Area' }, { Description: 'High Flood Risk Area' }],
      scenarios: [
        { Type: 'River', AEP: '0p2pcCC' },
        { Type: 'River', AEP: '10pcCC' },
        { Type: 'Creek', AEP: 'PMF' },
      ],
    }),
  );
  assert.deepEqual((await lookupLoganFlood(example)).findings, [
    { name: 'Flood risk areas', value: 'High, Moderate' },
    { name: 'River flooding', value: '10% annual chance' },
    { name: 'Creek flooding', value: 'Probable maximum flood' },
  ]);
});

test('requires a complete set of successful layer checks for an unmapped result', async context => {
  const mock = context.mock.method(globalThis, 'fetch', council());
  assert.equal((await lookupLoganFlood(example)).status, 'no-flags');
  mock.mock.mockImplementation(
    council({
      1: Response.json({ error: { code: 500 } }),
      9: Response.json({ exceededTransferLimit: true, features: [] }),
      4: [{ Description: 'New category' }],
      scenarios: [{ Type: 'Creek', AEP: 'unknown' }],
    }),
  );
  const result = await lookupLoganFlood(example);
  assert.equal(result.status, 'unavailable');
  assert.deepEqual(result.unavailableLayers, [
    'Flood risk areas',
    'River and creek scenarios',
    'Overland flow',
    'Flood investigation area',
  ]);
});

test('preserves confirmed findings when another layer is offline', async context => {
  context.mock.method(
    globalThis,
    'fetch',
    council({
      2: [{ Description: 'High Flood Island' }],
      9: new Response(null, { status: 503 }),
    }),
  );
  const result = await lookupLoganFlood(example);
  assert.equal(result.status, 'mapped');
  assert.deepEqual(result.findings, [{ name: 'High flood island', value: 'Potential isolation' }]);
  assert.deepEqual(result.unavailableLayers, ['Overland flow']);
});

test('a missing, mismatched or malformed boundary never becomes a negative flood result', async context => {
  const mock = context.mock.method(globalThis, 'fetch');
  for (const boundary of [
    { ...parcel, features: [] },
    { ...parcel, exceededTransferLimit: true },
    { ...parcel, spatialReference: { wkid: 4326 } },
    {
      ...parcel,
      features: [
        { ...parcel.features[0], attributes: { Property_Key: 1, Formatted_Lot_Plan: example.formattedLotPlan } },
      ],
    },
    { ...parcel, features: [{ ...parcel.features[0], geometry: { rings: [[]] } }] },
  ]) {
    mock.mock.mockImplementation(council({}, boundary));
    const result = await lookupLoganFlood(example);
    assert.equal(result.status, 'unavailable');
    assert.deepEqual(result.unavailableLayers, ['Parcel boundary']);
    assert.equal(result.reportUrl, 'https://flood.logan.qld.gov.au/?propertyKey=296422');
  }
});

test('propagates user cancellation', async context => {
  const abort = new AbortController();
  context.mock.method(globalThis, 'fetch', async () => {
    abort.abort();
    throw abort.signal.reason;
  });
  await assert.rejects(lookupLoganFlood(example, abort.signal), { name: 'AbortError' });
});

test('keeps planning advisories separate from mapped exposure and includes Council study qualifications', async t => {
  const mock = t.mock.method(
    globalThis,
    'fetch',
    council({ other: [{ Subject: 'TEST', Detail: 'Flood works may have changed local risk.' }] }),
  );
  let result = await lookupLoganFlood(example);
  assert.equal(result.status, 'no-flags');
  assert.deepEqual(result.notes, ['Flood works may have changed local risk.']);
  mock.mock.mockImplementation(
    council({
      1: [{ Description: 'Flood Investigation Area' }],
      scenarios: [{ Type: 'River', AEP: '10pcCC' }],
      9: [{ Description: 'Overland Flow Extent' }],
    }),
  );
  result = await lookupLoganFlood(example);
  assert.equal(result.status, 'mapped');
  assert.ok(result.findings.every(finding => finding.name !== 'River flooding'));
  assert.deepEqual(result.notes, [
    'Further study is needed to assess river flooding, isolation risk and possible creek flooding in this investigation area.',
  ]);
  mock.mock.mockImplementation(
    council({ scenarios: [{ Type: 'River', AEP: '10pcCC' }], 9: [{ Description: 'Overland Flow Extent' }] }),
  );
  result = await lookupLoganFlood(example);
  assert.deepEqual(result.notes, ['Creek flooding may also apply, subject to further study.']);
});
