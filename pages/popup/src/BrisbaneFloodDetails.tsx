import type { FloodResult } from './flood';

const formatElevation = (value: number) =>
  value.toLocaleString('en-AU', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

const BrisbaneFloodDetails = ({ result, headingId = 'finding-title' }: { result: FloodResult; headingId?: string }) => {
  const { status, sources, coverage, history, ground } = result;
  const elevationTitle = history.length ? 'Recorded historical flood levels' : 'Estimated ground elevations';
  return (
    <>
      <div className={`finding finding--${status}`}>
        <h3 id={headingId}>
          {status === 'mapped' && 'Flood exposure mapped'}
          {status === 'no-flags' && 'No mapped overlap recorded'}
          {status === 'unavailable' && 'Flood data unavailable'}
        </h3>
        {status === 'no-flags' && (
          <p>
            Council’s parcel record shows no likelihood or overland flow flags and no positive modelled flood coverage
            for the scenarios checked. Flooding is still possible.
          </p>
        )}
        {status === 'unavailable' && (
          <p>
            Council has no usable flood assessment for this lot. Check the Flood Awareness Map for more information.
          </p>
        )}
        {sources.length > 0 && (
          <>
            <p>Flood Awareness Map flags for this lot. Each likelihood is the highest band mapped on any part of it.</p>
            <dl className="source-list">
              {sources.map(({ name, level }) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{level}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        {coverage.length > 0 && (
          <>
            <h4>Modelled flood coverage</h4>
            <p>
              For each source, this is the most frequent modelled flood with recorded coverage on the lot. The
              percentage is the chance of a flood that size or larger in any year.
            </p>
            <dl className="source-list">
              {coverage.map(({ source, annualChance }) => (
                <div key={source}>
                  <dt>{source}</dt>
                  <dd>{annualChance}% annual chance</dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </div>
      {(history.length > 0 || ground.min !== null || ground.max !== null) && (
        <section className="history" aria-label={elevationTitle}>
          <h3>{elevationTitle}</h3>
          <p>
            These elevations use the Australian Height Datum (AHD). Water depth at a building requires site-specific
            information.
          </p>
          <ul>
            {history.map(({ source, date, level }, index) => (
              <li key={`${source}-${index}`}>
                <span>
                  {source}
                  {date && ` · ${date}`}
                </span>
                <span>{level === null ? 'Level unavailable' : `${formatElevation(level)} m AHD`}</span>
              </li>
            ))}
            {ground.min !== null && (
              <li>
                <span>Estimated minimum ground level</span>
                <span>{formatElevation(ground.min)} m AHD</span>
              </li>
            )}
            {ground.max !== null && (
              <li>
                <span>Estimated maximum ground level</span>
                <span>{formatElevation(ground.max)} m AHD</span>
              </li>
            )}
          </ul>
        </section>
      )}
      {status !== 'unavailable' && (
        <a className="primary" href={result.reportUrl} target="_blank" rel="noreferrer">
          Open FloodWise property report <span aria-hidden="true">↗</span>
        </a>
      )}
    </>
  );
};

export { BrisbaneFloodDetails };
