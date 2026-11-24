import { BrisbaneFloodDetails } from './BrisbaneFloodDetails';
import { LoganFloodDetails } from './LoganFloodDetails';
import { highestPropertyBand, lotIncomplete, lotStatus } from './property-flood';
import type { LotAssessment } from './property-flood';

const LotDetails = ({ lot, headingId, retry }: { lot: LotAssessment; headingId: string; retry: () => void }) => {
  if (lot.kind === 'logan') return <LoganFloodDetails headingId={headingId} result={lot.result} retry={retry} />;
  if (lot.kind === 'brisbane') return <BrisbaneFloodDetails headingId={headingId} result={lot.result} />;
  return (
    <section className="feedback" role="alert">
      <h3 id={headingId}>Flood lookup unavailable</h3>
      <p>We couldn’t retrieve Council data for this lot.</p>
      <button className="text-action" type="button" onClick={retry}>
        Retry flood lookup
      </button>
    </section>
  );
};

const PropertyFloodDetails = ({ lots, retry }: { lots: LotAssessment[]; retry: () => void }) => {
  if (lots.length === 1) return <LotDetails lot={lots[0]} headingId="finding-title" retry={retry} />;

  const mappedCount = lots.filter(lot => lotStatus(lot) === 'mapped').length;
  const incompleteCount = lots.filter(lotIncomplete).length;
  const band = highestPropertyBand(lots);
  const bandLabel = lots[0].parcel.council === 'brisbane' ? 'likelihood band' : 'flood risk category';
  const coverage = lots.flatMap(lot => (lot.kind === 'brisbane' ? lot.result.coverage : []));
  const maxChance = Math.max(...coverage.map(entry => entry.annualChance));
  const sources = [...new Set(coverage.filter(entry => entry.annualChance === maxChance).map(entry => entry.source))];
  const summary = mappedCount
    ? `Flood mapping on ${mappedCount} of ${lots.length} lots`
    : incompleteCount
      ? 'Property assessment incomplete'
      : 'No mapped exposure in the checked records';
  return (
    <>
      <section className="finding property-summary" aria-labelledby="finding-title">
        <h3 id="finding-title">{summary}</h3>
        {band && (
          <p>
            The highest recorded {bandLabel} is <strong>{band}</strong>.
          </p>
        )}
        {sources.length > 0 && (
          <p>
            The most frequent modelled overlap is the {maxChance}% annual-chance event (
            {sources.join(', ').toLowerCase()}).
          </p>
        )}
        {incompleteCount > 0 && (
          <p>
            Incomplete flood data for {incompleteCount} of {lots.length} lots.
          </p>
        )}
        {!mappedCount && !incompleteCount && <p>Flooding is still possible.</p>}
      </section>
      {lots.map((lot, index) => {
        const { parcel } = lot;
        const parcelName =
          parcel.council === 'logan'
            ? parcel.formattedLotPlan
            : `${parcel.commonProperty ? 'Common property' : 'Lot'} ${parcel.lotPlan}`;
        const status = lotStatus(lot);
        const label =
          status === 'mapped'
            ? 'Mapped exposure'
            : status === 'unavailable'
              ? 'Data unavailable'
              : 'No mapped exposure';
        const key = parcel.council === 'logan' ? parcel.formattedLotPlan : parcel.lotPlan;
        return (
          <details className="lot-details" key={key}>
            <summary>
              {parcelName}
              <small>
                {label}
                {status === 'mapped' && lotIncomplete(lot) ? ' · Partial data' : ''}
              </small>
            </summary>
            <LotDetails lot={lot} headingId={`lot-finding-${index}`} retry={retry} />
          </details>
        );
      })}
    </>
  );
};

export { PropertyFloodDetails };
