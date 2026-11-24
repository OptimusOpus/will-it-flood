const dataset = 'flood-awareness-property-parcel-metrics';
const recordsUrl = `https://data.brisbane.qld.gov.au/api/explore/v2.1/catalog/datasets/${dataset}/records`;
const FLOOD_DATA_URL = `https://data.brisbane.qld.gov.au/explore/dataset/${dataset}/`;
const FLOOD_MAP_URL = 'https://fam.brisbane.qld.gov.au/';

interface FloodResult {
  status: 'mapped' | 'no-flags' | 'unavailable';
  sources: { name: string; level: string }[];
  coverage: { source: string; annualChance: number }[];
  history: { source: string; date: string | null; level: number | null }[];
  ground: { min: number | null; max: number | null };
  reportUrl: string;
}

const floodSources = [
  { code: 'RIVER', name: 'River' },
  { code: 'CREEK', name: 'Creek' },
  { code: 'ST', name: 'Storm tide' },
];

// The same parcel can overlap several likelihood bands. Take its highest band per source.
const likelihoods = [
  { code: 'HIGH', label: 'High' },
  { code: 'MED', label: 'Medium' },
  { code: 'LOW', label: 'Low' },
  { code: 'VLOW', label: 'Very low' },
];

const lookupFlood = async (lotPlan: string, signal?: AbortSignal): Promise<FloodResult> => {
  const url = new URL(recordsUrl);
  url.search = new URLSearchParams({
    refine: `lotplan:${lotPlan}`,
    select: 'lotplan,metric,value',
    order_by: 'objectid',
    limit: '100',
  }).toString();
  const timeout = AbortSignal.timeout(15000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const metrics = new Map<string, string>();
  let offset = 0;
  let total: number;
  do {
    url.searchParams.set('offset', String(offset));
    const response = await fetch(url, { signal: requestSignal, credentials: 'omit' });
    if (!response.ok) throw new Error('The council flood data service is unavailable.');
    const page = await response.json();
    if (!page || !Number.isSafeInteger(page.total_count) || page.total_count < 0 || !Array.isArray(page.results)) {
      throw new Error('The council returned unreadable flood data.');
    }
    total = page.total_count;
    if ((page.results.length === 0 && offset < total) || offset + page.results.length > total) {
      throw new Error('The council returned incomplete flood data.');
    }
    for (const row of page.results) {
      if (row?.lotplan !== lotPlan || typeof row.metric !== 'string' || typeof row.value !== 'string') {
        throw new Error('The council returned unexpected parcel data.');
      }
      metrics.set(row.metric, row.value);
    }
    offset += page.results.length;
  } while (offset < total);

  const result: FloodResult = {
    status: 'unavailable',
    sources: [],
    coverage: [],
    history: [],
    ground: { min: null, max: null },
    reportUrl: `https://fwpr.brisbane.qld.gov.au/?lotplan=${encodeURIComponent(lotPlan)}`,
  };

  const isFlagged = (metric: string) => {
    const value = metrics.get(metric);
    if (value === undefined) return false;
    if (!/^\d+$/.test(value)) throw new Error('The council returned an unrecognised flood flag.');
    return Number(value) > 0;
  };
  if (!metrics.size || isFlagged('OOB_AREA')) return result;

  const measurement = (key: string) => {
    const text = metrics.get(key);
    if (text === undefined) return null;
    const value = Number(text);
    if (!text.trim() || !Number.isFinite(value)) throw new Error('The council returned an unreadable measurement.');
    return value;
  };
  result.ground = { min: measurement('MIN_GROUND_RL'), max: measurement('MAX_GROUND_RL') };
  for (const { code, name } of floodSources) {
    const band = likelihoods.find(level => isFlagged(`FL_${level.code}_${code}`));
    if (band) result.sources.push({ name, level: band.label });

    // Coverage measures area within a modelled flood extent, separately from the awareness likelihood bands.
    for (const annualChance of [20, 5, 2, 1]) {
      const percent = String(annualChance).padStart(2, '0');
      const area = measurement(`FL_${percent}_COV_${code}`);
      if (area === null || area === 0) continue;
      if (area < 0) throw new Error('The council returned an invalid flood coverage area.');
      result.coverage.push({ source: name, annualChance });
      break;
    }

    for (const rank of [1, 2]) {
      const key = `FL_HIS${rank}_${code}`;
      const date = metrics.get(`${key}_DATE`)?.trim() || null;
      const level = measurement(key);
      if (date || level !== null) result.history.push({ source: name, date, level });
    }
  }
  if (isFlagged('OLF_FLAG')) result.sources.push({ name: 'Overland flow', level: 'Mapped' });
  result.status = result.sources.length || result.coverage.length ? 'mapped' : 'no-flags';
  return result;
};

export { FLOOD_DATA_URL, FLOOD_MAP_URL, lookupFlood };
export type { FloodResult };
