import { loganCadastre } from './logan-address';
import type { LoganCandidate } from './logan-address';

const LOGAN_MAP_URL = 'https://flood.logan.qld.gov.au/';
const floodPortal = 'https://arcgis.lcc.wspdigital.com/server/rest/services/FloodPortal';
// These are the published May 2025 awareness maps. The separately staged 2026
// planning changes were still pending approval when checked in November 2026.
const riskMap = floodPortal + '/ConsolidatedFloodData_20250505/MapServer/';
const studyExtents = floodPortal + '/AllStudyExtent_20250505/MapServer/0';
const spatialReference = 7856; // GDA2020 / MGA zone 56, native to both services.

type Finding = { name: string; value: string };
type LoganFloodResult = {
  status: 'mapped' | 'no-flags' | 'unavailable';
  findings: Finding[];
  notes: string[];
  unavailableLayers: string[];
  reportUrl: string;
};
type Attributes = Record<string, unknown>;
type Feature = { attributes: Attributes; geometry?: { rings?: number[][][] } };

const query = async (layer: string, params: Record<string, string>, signal: AbortSignal) => {
  // A complex cadastral polygon can exceed a browser or proxy's GET URL limit.
  const response = await fetch(layer + '/query', {
    method: 'POST',
    body: new URLSearchParams({ f: 'json', ...params }),
    credentials: 'omit',
    signal,
  });
  if (!response.ok) throw new Error('Council map service unavailable.');
  const page = await response.json();
  if (page?.error || page?.exceededTransferLimit || !Array.isArray(page?.features)) {
    throw new Error('Incomplete Council map response.');
  }
  const features: Feature[] = page.features;
  const fields = params.outFields.split(',');
  if (
    !fields.every(field => page.fields?.some((entry: { name: string }) => entry?.name === field)) ||
    !features.every(feature => feature?.attributes && fields.every(field => Object.hasOwn(feature.attributes, field)))
  ) {
    throw new Error('Unexpected Council map fields.');
  }
  return { features, geometryType: page.geometryType, wkid: page.spatialReference?.wkid };
};

const parcelBoundary = async (candidate: LoganCandidate, signal: AbortSignal) => {
  const lot = candidate.formattedLotPlan.replaceAll("'", "''");
  if (!Number.isSafeInteger(candidate.propertyKey) || candidate.propertyKey < 1)
    throw new Error('Invalid property key.');
  const { features, geometryType, wkid } = await query(
    loganCadastre,
    {
      where: `Property_Key = ${candidate.propertyKey} AND Formatted_Lot_Plan = '${lot}'`,
      outFields: 'Property_Key,Formatted_Lot_Plan',
      returnGeometry: 'true',
      outSR: String(spatialReference),
    },
    signal,
  );
  if (geometryType !== 'esriGeometryPolygon' || wkid !== spatialReference || !features.length) {
    throw new Error('The parcel boundary is unavailable.');
  }
  const polygons = new Set<string>();
  for (const { attributes, geometry } of features) {
    const rings = geometry?.rings;
    if (
      attributes.Property_Key !== candidate.propertyKey ||
      attributes.Formatted_Lot_Plan !== candidate.formattedLotPlan ||
      !Array.isArray(rings) ||
      !rings.length ||
      !rings.every(
        ring =>
          Array.isArray(ring) &&
          ring.length >= 4 &&
          ring.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)) &&
          ring[0][0] === ring.at(-1)?.[0] &&
          ring[0][1] === ring.at(-1)?.[1],
      )
    ) {
      throw new Error('The returned parcel boundary could not be verified.');
    }
    polygons.add(JSON.stringify({ rings }));
  }
  return Array.from(polygons);
};

type Layer = {
  name: string;
  url: string;
  fields: string;
  findings: (attributes: Attributes[]) => Finding[];
};

const labelsLayer = (name: string, id: number, labels: Record<string, string>): Layer => ({
  name,
  url: riskMap + id,
  fields: 'Description',
  findings(rows) {
    const values = new Set<string>();
    for (const row of rows) {
      if (typeof row.Description !== 'string' || !Object.hasOwn(labels, row.Description)) {
        throw new Error('Unknown flood map category.');
      }
      values.add(labels[row.Description]);
    }
    const orderedValues = [...new Set(Object.values(labels))].filter(label => values.has(label));
    return values.size ? [{ name, value: orderedValues.join(', ') }] : [];
  },
});

// AEP is the annual chance of the modelled event. Council's property summary
// uses the most frequent mapped event for each source. PMF has no assigned AEP.
const events = [
  ['20pcCC', '20% annual chance'],
  ['10pcCC', '10% annual chance'],
  ['5pcCC', '5% annual chance'],
  ['2pcCC', '2% annual chance'],
  ['1pcCC', '1% annual chance'],
  ['0p5pcCC', '0.5% annual chance'],
  ['0p2pcCC', '0.2% annual chance'],
  ['0p05pc', '0.05% annual chance'],
  ['PMF', 'Probable maximum flood'],
] as const;

const layers: Layer[] = [
  labelsLayer('Flood risk areas', 4, {
    'High Flood Risk Area': 'High',
    'Moderate Flood Risk Area': 'Moderate',
    'Low Flood Risk Area': 'Low',
  }),
  {
    name: 'River and creek scenarios',
    url: studyExtents,
    fields: 'Type,AEP',
    findings(rows) {
      if (
        rows.some(row => (row.Type !== 'River' && row.Type !== 'Creek') || !events.some(([code]) => code === row.AEP))
      ) {
        throw new Error('Unknown flood study scenario.');
      }
      return ['River', 'Creek'].flatMap(source => {
        const match = events.find(([code]) => rows.some(row => row.Type === source && row.AEP === code));
        return match ? [{ name: source + ' flooding', value: match[1] }] : [];
      });
    },
  },
  labelsLayer('Overland flow', 9, { 'Overland Flow Extent': 'Mapped stormwater runoff' }),
  labelsLayer('Flood investigation area', 1, { 'Flood Investigation Area': 'Further study needed' }),
  labelsLayer('High flow area', 3, {
    'High Flow Conveyance Areas within the Investigation Areas Zone': 'Conveys floodwater',
    'High Flow Conveyance Areas within the Flood Risk Areas': 'Conveys floodwater',
  }),
  labelsLayer('Low flood island', 0, { 'Low Flood Island': 'Potential isolation and inundation' }),
  labelsLayer('High flood island', 2, { 'High Flood Island': 'Potential isolation' }),
  {
    name: 'Other property information',
    url: floodPortal + '/OtherInformation_20241120/MapServer/2',
    fields: 'Subject,Detail',
    findings(rows) {
      const notes = new Set<string>();
      for (const row of rows) {
        if (typeof row.Detail !== 'string' || !row.Detail.trim()) throw new Error('Unreadable Council property note.');
        notes.add(row.Detail.trim());
      }
      return Array.from(notes, value => ({ name: 'Council property note', value }));
    },
  },
];

const lookupLoganFlood = async (candidate: LoganCandidate, signal?: AbortSignal): Promise<LoganFloodResult> => {
  const reportUrl = new URL(LOGAN_MAP_URL);
  reportUrl.searchParams.set('propertyKey', String(candidate.propertyKey));
  const result: LoganFloodResult = {
    status: 'unavailable',
    findings: [],
    notes: [],
    unavailableLayers: [],
    reportUrl: reportUrl.href,
  };
  const timeout = AbortSignal.timeout(20000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let polygons: string[];
  try {
    polygons = await parcelBoundary(candidate, requestSignal);
  } catch {
    signal?.throwIfAborted();
    result.unavailableLayers.push('Parcel boundary');
    return result;
  }
  const checks = await Promise.allSettled(
    layers.map(async layer => {
      // The whole polygon (including holes and its boundary) is checked. A
      // council property key can refer to multiple lots, hence the exact lot join.
      const pages = await Promise.all(
        polygons.map(geometry =>
          query(
            layer.url,
            {
              geometry,
              geometryType: 'esriGeometryPolygon',
              inSR: String(spatialReference),
              spatialRel: 'esriSpatialRelIntersects',
              outFields: layer.fields,
              returnGeometry: 'false',
              returnDistinctValues: 'true',
            },
            requestSignal,
          ),
        ),
      );
      return layer.findings(pages.flatMap(page => page.features.map(feature => feature.attributes)));
    }),
  );
  signal?.throwIfAborted();
  checks.forEach((check, index) => {
    if (check.status === 'fulfilled') result.findings.push(...check.value);
    else result.unavailableLayers.push(layers[index].name);
  });
  // The portal qualifies its modelled scenarios when Council identifies a gap in the flood studies.
  const has = (name: string) => result.findings.some(finding => finding.name === name);
  const river = has('River flooding');
  const creek = has('Creek flooding');
  const overland = has('Overland flow');
  const investigation = has('Flood investigation area');
  const investigationOnly =
    investigation && !has('Flood risk areas') && !result.unavailableLayers.includes('Flood risk areas');
  const possibleCreekFlooding = river && !creek && overland;
  const propertyNotes = result.findings.filter(finding => finding.name === 'Council property note');
  result.notes = propertyNotes.map(finding => finding.value);
  result.findings = result.findings.filter(finding => finding.name !== 'Council property note');
  if (investigationOnly) {
    const qualified = ['River flooding', 'Creek flooding', 'High flood island', 'Low flood island'];
    result.findings = result.findings.filter(finding => !qualified.includes(finding.name));
    result.notes.push(
      possibleCreekFlooding
        ? 'Further study is needed to assess river flooding, isolation risk and possible creek flooding in this investigation area.'
        : 'River flooding, creek flooding and isolation risk are subject to further study in this investigation area.',
    );
  } else if (investigation) {
    const pending: string[] = [];
    if (!result.unavailableLayers.includes('River and creek scenarios')) {
      if (!river) pending.push('river flooding');
      if (!creek && !possibleCreekFlooding) pending.push('creek flooding');
    }
    if (
      !has('High flood island') &&
      !has('Low flood island') &&
      !result.unavailableLayers.some(name => name === 'High flood island' || name === 'Low flood island')
    ) {
      pending.push('isolation risk');
    }
    if (pending.length)
      result.notes.push(`Further study is needed to assess ${pending.join(', ')} in this investigation area.`);
  }
  if (possibleCreekFlooding && !investigationOnly)
    result.notes.push('Creek flooding may also apply, subject to further study.');
  if (result.findings.length) result.status = 'mapped';
  else if (!result.unavailableLayers.length) result.status = 'no-flags';
  return result;
};

export { LOGAN_MAP_URL, lookupLoganFlood };
export type { LoganFloodResult };
