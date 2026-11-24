import { AddressSearchError, directions, parseAddress, streetTypes, titleCase } from './address-input';

type AddressCandidate = { label: string; lotPlan: string; propertyId: string | null; commonProperty?: true };

const datasetBase = 'https://data.brisbane.qld.gov.au/api/explore/v2.1/catalog/datasets/';
const addresses = 'property-address-locations';
const parcels = 'property-boundaries-parcel';
const pageSize = 100;
const currentParcels = 'lot_retirement_date is null';

const quoted = (value: string) => JSON.stringify(value);
type CouncilRecord = Record<string, string | null>;

const queryRecords = async (dataset: string, select: string, where: string, signal: AbortSignal) => {
  const url = new URL(`${datasetBase}${dataset}/records`);
  url.search = new URLSearchParams({ select, where, limit: String(pageSize) }).toString();
  const response = await fetch(url, { signal, credentials: 'omit' });
  if (!response.ok) throw new Error('The Council address service is unavailable.');
  const body = await response.json();
  const fields = select.split(',');
  const validRow = (row: unknown): row is CouncilRecord => {
    if (!row || typeof row !== 'object') return false;
    const record = row as Record<string, unknown>;
    return fields.every(key => record[key] === null || typeof record[key] === 'string');
  };
  if (!Number.isInteger(body?.total_count) || !Array.isArray(body.results) || !body.results.every(validRow)) {
    throw new Error('The Council address service returned an unexpected response.');
  }
  if (body.total_count > pageSize) {
    throw new AddressSearchError('Many parcels match. Include the unit number and suburb, or search by lot and plan.');
  }
  if (body.results.length !== body.total_count) throw new Error('The Council address search was incomplete.');
  return body.results as CouncilRecord[];
};

const suburbWhere = (name: string) => `suburb=${quoted(name === 'BRISBANE' ? 'BRISBANE CITY' : name)}`;

// Build complete street/locality interpretations. In "Stanley St East, Coorparoo",
// East is a street suffix. In "Gray Rd, West End", West belongs to the suburb.
const streetWhere = (words: string[]) => {
  const options: string[] = [];
  for (let end = 1; end <= words.length; end++) {
    const name = `street_name=${quoted(words.slice(0, end).join(' '))}`;
    const suburb = words.slice(end).join(' ');
    options.push(suburb ? `(${name} and ${suburbWhere(suburb)})` : name);
    const type = streetTypes.get(words[end]);
    if (!type) continue;
    const street = `${name} and street_type=${quoted(type)}`;
    const tail = words.slice(end + 1);
    options.push(tail.length ? `(${street} and ${suburbWhere(tail.join(' '))})` : `(${street})`);
    const direction = directions[tail[0]];
    if (direction) {
      const locality = tail.slice(1).join(' ');
      options.push(
        `(${street} and street_suffix=${quoted(direction)}${locality ? ` and ${suburbWhere(locality)}` : ''})`,
      );
    }
  }
  return `(${options.join(' or ')})`;
};

const addressFields = 'property_id,unit_number,house_number,street_name,street_type,street_suffix,suburb,postcode';
const addressLabel = (row: CouncilRecord, house: string) => {
  const unit = row.unit_number ? `${row.unit_number}/` : '';
  const street = [unit + house, titleCase(row.street_name || ''), row.street_type, row.street_suffix]
    .filter(Boolean)
    .join(' ');
  return `${street}, ${titleCase(row.suburb || '')} QLD ${row.postcode || ''}`.trim();
};

const searchAddresses = async (input: string, signal?: AbortSignal): Promise<AddressCandidate[]> => {
  const timeout = AbortSignal.timeout(20000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const parsed = parseAddress(input);
  if ('lotPlan' in parsed) {
    const { lotPlan } = parsed;
    const rows = await queryRecords(
      parcels,
      'lotplan,locality,property_id',
      `lotplan=${quoted(lotPlan)} and ${currentParcels}`,
      requestSignal,
    );
    if (!rows.length) return [];
    if (rows.some(row => row.lotplan !== lotPlan)) throw new Error('Council returned an unexpected lot.');
    const propertyId = rows.every(row => row.property_id === rows[0].property_id) ? rows[0].property_id : null;
    return [{ lotPlan, propertyId, label: [`Lot ${lotPlan}`, rows[0].locality].filter(Boolean).join(', ') }];
  }

  const { unit, house, upperHouse, words, postcode } = parsed;
  const conditions = [
    upperHouse ? `house_number in (${quoted(house)},${quoted(upperHouse)})` : `house_number=${quoted(house)}`,
    streetWhere(words),
  ];
  if (unit) conditions.push(`unit_number=${quoted(unit)}`);
  if (postcode) conditions.push(`postcode=${quoted(postcode)}`);

  const matches = await queryRecords(addresses, addressFields, conditions.join(' and '), requestSignal);
  const labels = new Map<string, string>();
  for (const row of matches) {
    if (!row.property_id || !row.house_number) continue;
    // A range must resolve to the same property on the same street at both endpoints.
    if (
      upperHouse &&
      (row.house_number !== house ||
        !matches.some(
          other =>
            other.house_number === upperHouse &&
            other.property_id === row.property_id &&
            other.unit_number === row.unit_number &&
            other.street_name === row.street_name &&
            other.street_type === row.street_type &&
            other.street_suffix === row.street_suffix &&
            other.suburb === row.suburb,
        ))
    )
      continue;
    labels.set(row.property_id, addressLabel(row, upperHouse ? `${house}–${upperHouse}` : house));
  }
  if (!labels.size) return [];

  const propertyIds = Array.from(labels.keys(), quoted).join(',');
  const lots = await queryRecords(
    parcels,
    'property_id,lotplan,plan,lot_type',
    `property_id in (${propertyIds}) and ${currentParcels}`,
    requestSignal,
  );
  const candidates = new Map<string, AddressCandidate>();
  const matchedHoldings = new Set<string>();
  const commonLotOwners = new Map<string, Set<string>>();
  for (const { property_id: propertyId, lotplan: lotPlan, plan, lot_type: lotType } of lots) {
    const label = propertyId && labels.get(propertyId);
    if (!label || !lotPlan) throw new Error('Council returned a parcel that could not be confirmed.');
    candidates.set(`${propertyId}/${lotPlan}`, { label, lotPlan, propertyId });
    matchedHoldings.add(propertyId);
    if (lotType === 'S' && plan && /^(?:BUP|GTP|SP)\d+$/.test(plan)) {
      // A survey plan can also contain ordinary freehold land. Only scheme lots
      // in the cadastre are candidates for related common-property assessments.
      const commonLot = `CP${plan}`;
      const owners = commonLotOwners.get(commonLot) ?? new Set<string>();
      owners.add(propertyId);
      commonLotOwners.set(commonLot, owners);
    }
  }
  if (matchedHoldings.size !== labels.size) {
    throw new AddressSearchError(
      'Council matched the address but could not confirm a current parcel for every property. Check the lot and plan on the official map.',
    );
  }
  if (commonLotOwners.size) {
    const lotPlans = Array.from(commonLotOwners.keys(), quoted).join(',');
    const commonLots = await queryRecords(
      parcels,
      'lotplan',
      `lotplan in (${lotPlans}) and lot="CP" and ${currentParcels}`,
      requestSignal,
    );
    for (const { lotplan: lotPlan } of commonLots) {
      const owners = lotPlan && commonLotOwners.get(lotPlan);
      if (!owners) throw new Error('Council returned an unrelated common-property parcel.');
      for (const propertyId of owners) {
        candidates.set(`${propertyId}/${lotPlan}`, {
          label: labels.get(propertyId)!,
          lotPlan,
          propertyId,
          commonProperty: true,
        });
      }
    }
  }
  return Array.from(candidates.values()).sort(
    (a, b) => a.label.localeCompare(b.label, 'en-AU', { numeric: true }) || a.lotPlan.localeCompare(b.lotPlan),
  );
};

export { AddressSearchError, searchAddresses };
export type { AddressCandidate };
