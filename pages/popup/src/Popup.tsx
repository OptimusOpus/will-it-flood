import './Popup.css';
import { AddressSearchError } from './address-input';
import { FLOOD_DATA_URL, FLOOD_MAP_URL } from './flood';
import { getListingAddress } from './listing';
import { LOGAN_MAP_URL } from './logan-flood';
import { LOGAN_GUIDE_URL } from './LoganFloodDetails';
import { assessLots } from './property-flood';
import { councilNames, searchProperties } from './property-search';
import { PropertyFloodDetails } from './PropertyFloodDetails';
import { useEffect, useRef, useState } from 'react';
import type { LotAssessment } from './property-flood';
import type { PropertyCandidate, SearchArea } from './property-search';
import type { FormEvent } from 'react';

type View =
  | { kind: 'idle' | 'searching' | 'empty' }
  | { kind: 'refine'; message: string }
  | { kind: 'choices'; candidates: PropertyCandidate[]; message: string }
  | { kind: 'loading'; candidate: PropertyCandidate }
  | { kind: 'result'; candidate: PropertyCandidate; lots: LotAssessment[] }
  | { kind: 'error'; candidate?: PropertyCandidate; message?: string };

const Popup = () => {
  const [area, setArea] = useState<SearchArea>('all');
  const [query, setQuery] = useState('');
  const [fromListing, setFromListing] = useState(false);
  const [view, setView] = useState<View>({ kind: 'idle' });
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const request = useRef<AbortController | null>(null);
  const untouched = useRef(true);

  useEffect(() => {
    let mounted = true;
    void getListingAddress().then(address => {
      if (mounted && untouched.current && address) {
        setQuery(address);
        setFromListing(true);
      }
    });
    return () => {
      mounted = false;
      request.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (view.kind === 'choices' || view.kind === 'result') heading.current?.focus();
  }, [view.kind]);

  const changeQuery = (value: string) => {
    untouched.current = false;
    request.current?.abort();
    setQuery(value);
    setFromListing(false);
    setView({ kind: 'idle' });
  };

  const beginRequest = () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    return controller.signal;
  };

  const checkProperty = async (candidate: PropertyCandidate) => {
    const signal = beginRequest();
    setView({ kind: 'loading', candidate });
    try {
      const lots = await assessLots(candidate.parcels, signal);
      if (!signal.aborted) setView({ kind: 'result', candidate, lots });
    } catch {
      if (!signal.aborted) setView({ kind: 'error', candidate });
    }
  };

  const findAddress = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    untouched.current = false;
    const value = query.trim();
    if (!value) {
      input.current?.setCustomValidity('Enter a street address or lot and plan.');
      input.current?.reportValidity();
      return;
    }
    const signal = beginRequest();
    setView({ kind: 'searching' });
    try {
      const { candidates, issues, unavailable } = await searchProperties(value, area, signal);
      if (signal.aborted) return;
      const message = issues.join(' ');
      if (candidates.length === 1 && !message) {
        await checkProperty(candidates[0]);
      } else if (candidates.length) {
        setView({ kind: 'choices', candidates, message });
      } else if (message) {
        setView({ kind: unavailable ? 'error' : 'refine', message });
      } else {
        setView({ kind: 'empty' });
      }
    } catch (error) {
      if (!signal.aborted) {
        setView(error instanceof AddressSearchError ? { kind: 'refine', message: error.message } : { kind: 'error' });
      }
    }
  };

  const editAddress = () => {
    request.current?.abort();
    setView({ kind: 'idle' });
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.select();
    });
  };

  const candidate = 'candidate' in view ? view.candidate : undefined;
  const showSearch = !candidate;
  const displayedArea = candidate?.council ?? area;
  const isResult = view.kind === 'result';

  return (
    <>
      <header className="masthead">
        <p>Brisbane &amp; Logan, Queensland</p>
        <h1>Will it flood?</h1>
      </header>
      <main>
        {showSearch && (
          <form onSubmit={findAddress}>
            <div className="council-filter">
              <label htmlFor="council">Search area</label>
              <select
                id="council"
                value={area}
                onChange={event => {
                  request.current?.abort();
                  setArea(event.target.value as SearchArea);
                  setView({ kind: 'idle' });
                }}>
                <option value="all">Brisbane and Logan</option>
                <option value="brisbane">Brisbane only</option>
                <option value="logan">Logan only</option>
              </select>
            </div>
            <label className="field-label" htmlFor="property">
              Property address
            </label>
            <div className="address-input">
              <span className="pin" aria-hidden="true" />
              <input
                ref={input}
                type="text"
                id="property"
                value={query}
                onChange={event => {
                  event.currentTarget.setCustomValidity('');
                  changeQuery(event.currentTarget.value);
                }}
                placeholder={
                  area === 'logan' ? 'e.g. 105 George Street, Beenleigh' : 'e.g. 119 Lamington Street, New Farm'
                }
                required
                autoComplete="off"
                aria-describedby="address-hint"
              />
            </div>
            <p id="address-hint" className="hint">
              {fromListing
                ? 'Address found on this listing. Check it before searching.'
                : 'Enter a street address with suburb, or a lot and plan.'}
            </p>
            <button className="primary" type="submit" disabled={view.kind === 'searching'}>
              {view.kind === 'searching'
                ? 'Finding address…'
                : view.kind === 'error'
                  ? 'Try address search again'
                  : 'Check flood mapping'}
              {view.kind === 'searching' ? (
                <span className="spinner" aria-hidden="true" />
              ) : (
                <span aria-hidden="true">→</span>
              )}
            </button>
          </form>
        )}
        {candidate && (
          <div className="property">
            <p className="eyebrow">{councilNames[candidate.council]}</p>
            <h2 ref={heading} tabIndex={-1} aria-describedby={isResult ? 'finding-title' : undefined}>
              {candidate.label}
            </h2>
            <div className="property-meta">
              <span>
                {candidate.parcels.length === 1
                  ? `Lot/plan ${candidate.parcels[0].lotPlan}`
                  : `${candidate.parcels.length} lots`}
              </span>
              <button className="text-action" type="button" onClick={editAddress}>
                Change address
              </button>
            </div>
          </div>
        )}
        {view.kind === 'choices' && (
          <section className="feedback" aria-labelledby="choose-address">
            <h2 id="choose-address" tabIndex={-1} ref={heading}>
              Choose a property
            </h2>
            {view.message && <p role="status">{view.message} Confirm the property below or narrow the search area.</p>}
            <ul className="candidate-list">
              {view.candidates.map(item => (
                <li key={item.id}>
                  <button type="button" onClick={() => void checkProperty(item)}>
                    <span>
                      {item.label}
                      <small>
                        {councilNames[item.council]} ·{' '}
                        {item.parcels.length === 1
                          ? `Lot/plan ${item.parcels[0].lotPlan}`
                          : `${item.parcels.length} lots`}
                      </small>
                    </span>
                    <span aria-hidden="true">→</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {view.kind === 'refine' && (
          <section className="feedback" role="status">
            <h2>Refine your address</h2>
            <p>{view.message}</p>
          </section>
        )}
        {view.kind === 'empty' && (
          <section className="feedback" role="status">
            <h2>No matching property</h2>
            <p>
              Check the street number and suburb, or try a lot and plan. The search covers{' '}
              {area === 'all' ? 'Brisbane and Logan City Council areas' : `the ${councilNames[area]} area`}.
            </p>
          </section>
        )}
        {view.kind === 'loading' && (
          <p className="working" role="status">
            <span className="spinner" aria-hidden="true" /> Checking Council flood mapping…
          </p>
        )}
        {view.kind === 'error' && (
          <section className="feedback" role="alert">
            <h2>{candidate ? 'Flood lookup unavailable' : 'Address search unavailable'}</h2>
            <p>{view.message || 'We couldn’t retrieve Council data.'} Try again or open the official map below.</p>
            {candidate && (
              <button className="text-action" type="button" onClick={() => void checkProperty(candidate)}>
                Retry flood lookup
              </button>
            )}
          </section>
        )}
        {view.kind === 'result' && (
          <PropertyFloodDetails lots={view.lots} retry={() => void checkProperty(view.candidate)} />
        )}
        <span className="sr-only" role="status">
          {view.kind === 'searching' ? 'Finding address.' : ''}
        </span>
      </main>
      <footer>
        <p className="footer-label">Official sources</p>
        <div className="footer-links">
          {displayedArea !== 'logan' && (
            <a href={FLOOD_MAP_URL} target="_blank" rel="noreferrer">
              Brisbane Flood Awareness Map <span aria-hidden="true">↗</span>
            </a>
          )}
          {displayedArea !== 'brisbane' && !isResult && (
            <a href={LOGAN_MAP_URL} target="_blank" rel="noreferrer">
              Logan Flood Portal <span aria-hidden="true">↗</span>
            </a>
          )}
          {isResult && displayedArea === 'brisbane' && (
            <a href={FLOOD_DATA_URL} target="_blank" rel="noreferrer">
              Source data <span aria-hidden="true">↗</span>
            </a>
          )}
          {isResult && displayedArea === 'logan' && (
            <a href={LOGAN_GUIDE_URL} target="_blank" rel="noreferrer">
              Council flood studies <span aria-hidden="true">↗</span>
            </a>
          )}
          <a href="./credits.txt" target="_blank" rel="noreferrer">
            Data credits
          </a>
        </div>
      </footer>
    </>
  );
};

export default Popup;
