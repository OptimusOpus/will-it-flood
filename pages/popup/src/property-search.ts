import { searchAddresses } from './address';
import { AddressSearchError, parseAddress } from './address-input';
import { searchLoganAddresses } from './logan-address';
import type { AddressCandidate } from './address';
import type { LoganCandidate } from './logan-address';

type Parcel = (AddressCandidate & { council: 'brisbane' }) | LoganCandidate;
type Council = Parcel['council'];
type PropertyCandidate = { id: string; council: Council; label: string; parcels: Parcel[] };
type SearchArea = Council | 'all';

const councilNames = { brisbane: 'Brisbane City Council', logan: 'Logan City Council' } as const;
const councils = ['brisbane', 'logan'] as const;

const searchProperties = async (input: string, area: SearchArea, signal?: AbortSignal) => {
  const lotLookup = 'lotPlan' in parseAddress(input);
  const selected = area === 'all' ? councils : [area];
  const results = await Promise.allSettled(
    selected.map(async (council): Promise<Parcel[]> => {
      if (council === 'logan') return searchLoganAddresses(input, signal);
      const matches = await searchAddresses(input, signal);
      return matches.map(match => ({ ...match, council: 'brisbane' }));
    }),
  );
  const properties = new Map<string, PropertyCandidate>();
  const issues: string[] = [];
  let unavailable = false;
  for (const [index, result] of results.entries()) {
    if (result.status === 'fulfilled') {
      for (const parcel of result.value) {
        const key = parcel.council === 'logan' ? parcel.propertyKey : (parcel.propertyId ?? parcel.lotPlan);
        const descriptor = parcel.council === 'logan' ? parcel.formattedLotPlan : parcel.lotPlan;
        const id = lotLookup ? `${parcel.council}/${key}/${descriptor}` : `${parcel.council}/${key}`;
        const property = properties.get(id);
        if (property) property.parcels.push(parcel);
        else properties.set(id, { id, council: parcel.council, label: parcel.label, parcels: [parcel] });
      }
    } else {
      const council = councilNames[selected[index]];
      if (result.reason instanceof AddressSearchError) {
        issues.push(`${council} — ${result.reason.message}`);
      } else {
        unavailable = true;
        issues.push(`The ${council} address search is unavailable.`);
      }
    }
  }
  return { candidates: [...properties.values()], issues, unavailable };
};

export { councilNames, searchProperties };
export type { Council, Parcel, PropertyCandidate, SearchArea };
