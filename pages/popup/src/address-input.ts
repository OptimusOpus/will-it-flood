class AddressSearchError extends Error {}

// Council's address register spells these out. Accept the abbreviations used in listings.
const streetTypes = new Map<string, string>();
for (const forms of [
  'Avenue AV AVE',
  'Bend',
  'Boulevard BVD BLVD',
  'Circuit CCT CRCT',
  'Close CL',
  'Corso CSO',
  'Court CT',
  'Crescent CRES CR',
  'Drive DR',
  'Esplanade ESP',
  'Freeway FWY FRWY',
  'Grove GR',
  'Highway HWY',
  'Island ISL',
  'Lane LN',
  'Motorway MWY',
  'Outlook OTLK',
  'Parade PDE',
  'Parkway PKWY PKY',
  'Place PL',
  'Quay QY',
  'Rise',
  'Road RD',
  'Row',
  'Square SQ',
  'Street ST',
  'Terrace TCE',
  'Walk',
  'Way',
]) {
  const [name, ...aliases] = forms.split(' ');
  for (const alias of [name.toUpperCase(), ...aliases]) streetTypes.set(alias, name);
}

const directions: Record<string, string> = {
  E: 'East',
  EAST: 'East',
  N: 'North',
  NORTH: 'North',
  S: 'South',
  SOUTH: 'South',
  W: 'West',
  WEST: 'West',
};
const titleCase = (value: string) => value.toLowerCase().replace(/\b[a-z]/g, letter => letter.toUpperCase());
type LotInput = { lotPlan: string; loganDescriptors: string[] };

const lotPlanInput = (query: string): LotInput | null => {
  // A street name followed by a postcode can look like a spaced lot/plan.
  if (query.includes(' ') && !/^(?:(?:PT|BAL) )?LOT |^[A-Z] |\bON\b|\b(?:SP|RP|BUP|GTP|SL|AP)\s*\d/.test(query)) {
    return null;
  }
  const explicit = /^(?:(?:(PT|BAL) )?LOT )?(CP|\d+[A-Z]?|[A-Z])(?: ON |\s*\/\s*| )([A-Z]{1,6})\s*(\d{1,9})$/.exec(
    query,
  );
  const compact = /^(?:(?:(PT|BAL) )?LOT )?(CP|\d+|[A-Z])([A-Z]{1,7})(\d{1,9})$/.exec(query);
  const match = explicit || compact;
  if (!match) return null;
  const [, qualifier, lot, plan, number] = match;
  const prefix = qualifier ? titleCase(qualifier) + ' Lot' : 'Lot';
  const format = (lotNumber: string, planCode: string) =>
    `${prefix} ${lotNumber === 'CP' ? '0' : lotNumber} ${planCode} ${number}`;
  const descriptors = [format(lot, plan)];
  // In 2ARP123, A may belong to lot 2A or to the plan prefix.
  if (!explicit && /^\d+$/.test(lot) && plan.length > 1) descriptors.push(format(lot + plan[0], plan.slice(1)));
  return { lotPlan: qualifier ? descriptors[0] : lot + plan + number, loganDescriptors: descriptors };
};

type StreetAddress = {
  unit?: string;
  house: string;
  upperHouse?: string;
  words: string[];
  postcode?: string;
};

const parseAddress = (input: string): StreetAddress | LotInput => {
  const query = input.toUpperCase().trim().replace(/’/g, "'").replace(/[–—]/g, '-').replace(/\s+/g, ' ');
  const lotPlan = lotPlanInput(query);
  if (lotPlan) return lotPlan;

  const cleaned = query
    .replace(/[,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+AUSTRALIA$/, '');
  const postal = /\s+(\d{4})$/.exec(cleaned);
  const withoutState = cleaned.slice(0, postal?.index ?? cleaned.length).replace(/\s+(?:QLD|QUEENSLAND)$/, '');
  const parts =
    /^(?:(?:UNIT|APARTMENT|APT|FLAT|TOWNHOUSE)\s+([A-Z0-9]+(?:\s*-\s*[A-Z0-9]+)?)(?:\s*\/\s*|\s+)|([A-Z0-9]+(?:\s*-\s*[A-Z0-9]+)?)\s*\/\s*)?(\d+[A-Z]?)(?:\s*-\s*(\d+[A-Z]?))?\s+([A-Z0-9' -]+)$/.exec(
      withoutState,
    );
  if (!parts || query.length > 160)
    throw new AddressSearchError('Enter a street number and street name, or a lot and plan.');
  const [, namedUnit, slashUnit, house, upperHouse, remainder] = parts;
  const unit = (namedUnit || slashUnit)?.replace(/\s/g, '');
  const words = remainder.trim().split(/\s+/);
  if (words.length > 14) throw new AddressSearchError('Use just the street address, suburb and postcode.');
  return { unit, house, upperHouse, words, postcode: postal?.[1] };
};

export { AddressSearchError, directions, parseAddress, streetTypes, titleCase };
export type { StreetAddress };
