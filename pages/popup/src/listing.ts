// These sites include the property address in the title of individual listing pages.
const addressFromListing = (url: string, title: string): string | null => {
  let page: URL;
  try {
    page = new URL(url);
  } catch {
    return null;
  }
  if (page.protocol !== 'https:') return null;
  const host = page.hostname.replace(/^www\./, '');
  const isListing =
    (host === 'realestate.com.au' && /^\/(?:property-[^/]+-\d+|property\/[^/]+)\/?$/i.test(page.pathname)) ||
    (host === 'domain.com.au' && /^\/(?:[^/]+-\d{6,}|property-profile\/[^/]+)\/?$/i.test(page.pathname));
  if (!isListing) return null;

  const text = title.replace(/\s+/g, ' ').trim();
  const match =
    /^(?:(?:sold|leased)\s*[-:|]\s*)?((?:unit\s+)?\d[^|]{2,150}?,\s*[^|,]+?,?\s+(?:QLD|Queensland)\s+4\d{3})\b/i.exec(
      text,
    );
  return match?.[1] ?? null;
};

const getListingAddress = async (): Promise<string | null> => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.url && tab.title ? addressFromListing(tab.url, tab.title) : null;
  } catch {
    return null;
  }
};

export { addressFromListing, getListingAddress };
