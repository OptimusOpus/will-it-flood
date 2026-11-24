import { lookupFlood } from './flood';
import { lookupLoganFlood } from './logan-flood';
import type { FloodResult } from './flood';
import type { LoganFloodResult } from './logan-flood';
import type { Parcel } from './property-search';

type LotAssessment = { parcel: Parcel } & (
  | { kind: 'brisbane'; result: FloodResult }
  | { kind: 'logan'; result: LoganFloodResult }
  | { kind: 'failed' }
);

const assessLots = async (parcels: Parcel[], signal: AbortSignal) => {
  const assessments: LotAssessment[] = [];
  // Logan runs several layer queries per parcel. Bound concurrent parcels for large holdings.
  const remaining = parcels.entries();
  const assessNext = async () => {
    for (const [index, parcel] of remaining) {
      signal.throwIfAborted();
      try {
        assessments[index] =
          parcel.council === 'logan'
            ? { kind: 'logan', parcel, result: await lookupLoganFlood(parcel, signal) }
            : { kind: 'brisbane', parcel, result: await lookupFlood(parcel.lotPlan, signal) };
      } catch {
        signal.throwIfAborted();
        assessments[index] = { kind: 'failed', parcel };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, parcels.length) }, assessNext));
  return assessments;
};

const lotStatus = (lot: LotAssessment) => (lot.kind === 'failed' ? 'unavailable' : lot.result.status);

const lotIncomplete = (lot: LotAssessment) =>
  lotStatus(lot) === 'unavailable' || (lot.kind === 'logan' && lot.result.unavailableLayers.length > 0);

// Keep Brisbane's likelihood bands distinct from Logan's flood risk categories.
const highestPropertyBand = (assessments: LotAssessment[]) => {
  const levels = new Set<string>();
  for (const lot of assessments) {
    if (lot.kind === 'brisbane') {
      lot.result.sources.forEach(source => levels.add(source.level));
    } else if (lot.kind === 'logan') {
      const risk = lot.result.findings.find(finding => finding.name === 'Flood risk areas');
      risk?.value.split(', ').forEach(level => levels.add(level));
    }
  }
  return ['High', 'Moderate', 'Medium', 'Low', 'Very low'].find(level => levels.has(level));
};

export { assessLots, highestPropertyBand, lotIncomplete, lotStatus };
export type { LotAssessment };
