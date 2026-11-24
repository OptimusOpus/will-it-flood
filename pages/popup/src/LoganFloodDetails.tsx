import type { LoganFloodResult } from './logan-flood';

const titles = {
  mapped: 'Flood mapping intersects this lot',
  'no-flags': 'No overlap in the checked layers',
  unavailable: 'Flood lookup unavailable',
} as const;

const LOGAN_GUIDE_URL = 'https://www.logan.qld.gov.au/residents/disasters-and-emergencies/types-of-disasters/flood';

const LoganFloodDetails = ({
  result,
  retry,
  headingId = 'finding-title',
}: {
  result: LoganFloodResult;
  retry: () => void;
  headingId?: string;
}) => {
  const { status, findings, unavailableLayers, reportUrl } = result;
  return (
    <>
      <section className={`finding finding--${status}`} aria-labelledby={headingId}>
        <h3 id={headingId}>{titles[status]}</h3>
        {status === 'mapped' && (
          <p>
            Logan’s May 2025 flood maps show these features on the lot or its boundary. Flooding at a particular
            building or floor cannot be determined from this map.
          </p>
        )}
        {status === 'no-flags' && (
          <p>
            The May 2025 risk, isolation, flow and river/creek scenario layers show no intersection with this lot. Some
            waterways still need flood studies, and flooding is possible.
          </p>
        )}
        {status === 'unavailable' && (
          <p>There isn’t enough usable mapping to assess this lot. Check Council’s property report.</p>
        )}
        {findings.length > 0 && (
          <dl className="source-list">
            {findings.map(({ name, value }) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {findings.some(finding => finding.name === 'Flood risk areas') && (
          <p>Risk areas combine a flood’s likelihood with how deep and fast the water may be.</p>
        )}
        {findings.some(finding => ['River flooding', 'Creek flooding'].includes(finding.name)) && (
          <p>
            Each source shows the most frequent modelled event reaching the lot. The studies include projected climate
            conditions. Annual chance is the chance of an event that size or larger in any year.
          </p>
        )}
        {result.notes.map(note => (
          <p key={note}>{note}</p>
        ))}
        {unavailableLayers.length > 0 && (
          <p>Mapping unavailable for {unavailableLayers.map(layer => layer.toLowerCase()).join(', ')}.</p>
        )}
        {(status === 'unavailable' || unavailableLayers.length > 0) && (
          <button className="text-action" type="button" onClick={retry}>
            Retry flood lookup
          </button>
        )}
      </section>
      <a className="primary" href={reportUrl} target="_blank" rel="noreferrer">
        Open property in Logan Flood Portal <span aria-hidden="true">↗</span>
      </a>
      <p className="hint report-hint">
        Choose <strong>Property Flood Report</strong> in the portal for detailed maps and flood scenarios.
      </p>
    </>
  );
};

export { LOGAN_GUIDE_URL, LoganFloodDetails };
