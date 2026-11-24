import { AddressSearchError, directions, parseAddress, streetTypes, titleCase } from './address-input';
import type { StreetAddress } from './address-input';

type LoganCandidate = {
  council: 'logan';
  label: string;
  lotPlan: string;
  formattedLotPlan: string;
  propertyKey: number;
};

const councilServices = 'https://services5.arcgis.com/ZUCWDRj8F77Xo351/arcgis/rest/services';
const loganCadastre = `${councilServices}/VIEW_Latest_Cadastre/FeatureServer/0`;
const primaryAddress = `${councilServices}/LCC_Primary_Property_Address/FeatureServer/0`;
const sqlString = (value: string) => `'${value.replaceAll("'", "''")}'`;

type Attributes = { Property_Key: number } & Record<string, string | number | null>;

const query = async (layer: string, where: string, fields: string[], signal: AbortSignal): Promise<Attributes[]> => {
  const url = new URL(`${layer}/query`);
  url.search = new URLSearchParams({
    f: 'json',
    where,
    outFields: ['Property_Key', ...fields].join(','),
    returnGeometry: 'false',
    resultRecordCount: '200',
  }).toString();
  const response = await fetch(url, { signal, credentials: 'omit' });
  if (!response.ok) throw new Error('The Logan property service is unavailable.');
  const body = await response.json();
  if (body?.error || !Array.isArray(body?.features)) throw new Error('The Logan property service is unavailable.');
  if (body.exceededTransferLimit) {
    throw new AddressSearchError(
      'Many Logan parcels match. Include the unit, suburb and postcode or search by lot and plan.',
    );
  }
  return body.features.map((feature: { attributes?: Attributes } | null) => {
    const row = feature?.attributes;
    if (
      !row ||
      !Number.isSafeInteger(row.Property_Key) ||
      !fields.every(k => row[k] === null || typeof row[k] === 'string')
    ) {
      throw new Error('The Logan property service returned an unexpected record.');
    }
    return row;
  });
};

// The complete street name in the Council register includes its type and any direction.
const streetForms = (words: string[]) => {
  const forms = [words.join(' ')];
  const [last, previous] = words.slice(-2).reverse();
  const suffix = directions[last];
  if (suffix && streetTypes.has(previous)) {
    forms.push([...words.slice(0, -2), streetTypes.get(previous), suffix].join(' ').toUpperCase());
  }
  if (streetTypes.has(last)) forms.push([...words.slice(0, -1), streetTypes.get(last)].join(' ').toUpperCase());
  return forms;
};

// The register stores the range endpoints as strings, so use numeric comparisons.
const numberCondition = (kind: 'House' | 'Unit', input: string) => {
  const digits = /^\d+/.exec(input)?.[0];
  if (!digits || Number(digits) > 2147483647) return null;
  const start = `Start_${kind}_Number`;
  const end = `End_${kind}_Number`;
  return `(${start}=${sqlString(digits)} OR (CAST(${start} AS INTEGER)<=${digits} AND CAST(${end} AS INTEGER)>=${digits}))`;
};

const addressWhere = ({ words, house, upperHouse, unit, postcode }: StreetAddress) => {
  // The comma is optional, so each complete street/locality split is an alternative.
  // Scope the query before limiting results, including when the user omitted the street type.
  const locations = words.map((_, index) => {
    const street = words.slice(0, index + 1);
    const suburb = words.slice(index + 1).join(' ');
    const forms = streetForms(street);
    const names = [`Street_Name IN (${forms.map(sqlString).join(',')})`];
    if (!streetTypes.has(words[index])) names.push(`Street_Name LIKE ${sqlString(street.join(' ') + ' %')}`);
    const condition = `(${names.join(' OR ')})`;
    return suburb ? `(${condition} AND Suburb=${sqlString(suburb)})` : condition;
  });
  const number = `${unit ? unit + '/' : ''}${house}${upperHouse ? '-' + upperHouse : ''}`;
  // Council stores the numbered street on its own line. An omitted unit may match
  // several properties at one street number. Never let 5 match 105 or 15.
  const prefixes = ['', '%\r', '%\n'];
  if (!unit) prefixes.push('%/');
  const numbers = prefixes.map(
    prefix => `UPPER(Address_Formatted) LIKE ${sqlString(prefix + number + ' ' + words[0] + '%')}`,
  );
  const houseMatch = numberCondition('House', house);
  const unitMatch = unit && numberCondition('Unit', unit);
  if (houseMatch && (!unit || unitMatch)) numbers.push(unitMatch ? `(${houseMatch} AND ${unitMatch})` : houseMatch);
  const conditions = [`(${locations.join(' OR ')})`, `(${numbers.join(' OR ')})`];
  if (postcode) conditions.push(`Postcode=${sqlString(postcode)}`);
  return conditions.join(' AND ');
};

const matchesNumber = (requested: string, published: string, kind: 'house' | 'unit') => {
  if (requested === published) return true;
  const ends = published.split('-');
  if (ends.length !== 2 || requested.includes('-')) return false;
  if (ends.includes(requested)) return true;
  if (![requested, ...ends].every(n => /^\d+$/.test(n))) return false;
  const [first, last] = ends.map(Number);
  const n = Number(requested);
  // Street numbers on the opposite side can belong to a different lot.
  return first < n && n < last && (kind === 'unit' || first % 2 !== last % 2 || first % 2 === n % 2);
};

const matchingLabel = (input: StreetAddress, row: Attributes) => {
  const { Address_Formatted: address, Street_Name: street, Suburb: suburb, Postcode: postcode } = row;
  if (typeof address !== 'string' || typeof street !== 'string' || typeof suburb !== 'string') return;
  if (input.postcode && postcode !== input.postcode) return;

  const streetName = street.trim().toUpperCase();
  const suburbName = suburb.trim().toUpperCase();
  const supplied = input.words.join(' ');
  const withoutSuburb = supplied.endsWith(` ${suburbName}`) ? supplied.slice(0, -(suburbName.length + 1)) : supplied;
  const forms = streetForms(withoutSuburb.split(' '));
  const type = streetName.split(' ').at(-1)!;
  const bareName = streetTypes.has(type) ? streetName.slice(0, -(type.length + 1)) : streetName;
  if (!forms.includes(streetName) && !forms.includes(bareName)) return;

  // A building name can precede the numbered street line. The numeric fields omit
  // letter suffixes and may differ from Council's published display number.
  const house = input.upperHouse ? `${input.house}-${input.upperHouse}` : input.house;
  for (const line of address.split(/[\r\n]+/)) {
    const normalized = line.trim().replace(/\s+/g, ' ').toUpperCase();
    if (!normalized.endsWith(` ${streetName}`)) continue;
    const parts = normalized.slice(0, -(streetName.length + 1)).split('/');
    if (
      parts.length > 2 ||
      !matchesNumber(house, parts.at(-1)!, 'house') ||
      (input.unit && (parts.length !== 2 || !matchesNumber(input.unit, parts[0], 'unit')))
    )
      continue;
    return `${line.trim()}, ${titleCase(suburb)} QLD ${postcode || ''}`.trim();
  }
  return undefined;
};

const searchLoganAddresses = async (input: string, signal?: AbortSignal): Promise<LoganCandidate[]> => {
  const parsed = parseAddress(input);
  const timeout = AbortSignal.timeout(20000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let where: string;
  let requestedLots: string[] | undefined;
  const labels = new Map<number, string>();
  if ('lotPlan' in parsed) {
    requestedLots = parsed.loganDescriptors;
    where = `Formatted_Lot_Plan IN (${requestedLots.map(sqlString).join(',')})`;
  } else {
    const rows = await query(
      primaryAddress,
      addressWhere(parsed),
      ['Address_Formatted', 'Street_Name', 'Suburb', 'Postcode'],
      requestSignal,
    );
    for (const row of rows) {
      const label = matchingLabel(parsed, row);
      if (label) labels.set(row.Property_Key, label);
    }
    if (!labels.size) return [];
    where = `Property_Key IN (${Array.from(labels.keys()).join(',')})`;
  }

  // Both datasets belong to Logan City Council. Join on its property key, then use
  // the current cadastre's individual lot descriptors (a property can span lots).
  const parcels = await query(loganCadastre, where, ['Formatted_Lot_Plan', 'Address_Formatted'], requestSignal);
  const candidates = new Map<string, LoganCandidate>();
  const matchedKeys = new Set<number>();
  for (const { Property_Key: propertyKey, Formatted_Lot_Plan: formatted, Address_Formatted: address } of parcels) {
    const label = labels.get(propertyKey);
    if (typeof formatted !== 'string' || (requestedLots ? !requestedLots.includes(formatted) : !label)) {
      throw new Error('Logan returned a parcel that could not be confirmed.');
    }
    const parts = /^(?:(Pt|Bal) )?Lot (\d+[A-Z]?|[A-Z]) ([A-Z]{1,6}) (\d+)$/i.exec(formatted);
    if (!parts) throw new Error('Logan returned an unrecognised parcel identifier.');
    const lotPlan = parts[1] ? formatted : parts.slice(2).join('').toUpperCase();
    candidates.set(`${propertyKey}/${formatted}`, {
      council: 'logan',
      lotPlan,
      formattedLotPlan: formatted,
      propertyKey,
      label: label || (typeof address === 'string' && address.trim().replace(/\s+/g, ' ')) || formatted,
    });
    matchedKeys.add(propertyKey);
  }
  if (Array.from(labels.keys()).some(key => !matchedKeys.has(key))) {
    throw new Error('Logan matched the address but could not confirm all its parcels.');
  }
  return Array.from(candidates.values()).sort(
    (a, b) =>
      a.label.localeCompare(b.label, 'en-AU', { numeric: true }) ||
      a.formattedLotPlan.localeCompare(b.formattedLotPlan),
  );
};

export { loganCadastre, searchLoganAddresses };
export type { LoganCandidate };
