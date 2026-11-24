import { addressFromListing } from '../pages/popup/src/listing';
import assert from 'node:assert/strict';
import test from 'node:test';

test('prefills only individual Queensland listings with an address in the tab title', () => {
  assert.equal(
    addressFromListing(
      'https://www.realestate.com.au/property-apartment-qld-toowong-123456789',
      '3/20 Main Street, Toowong, Qld 4066 - Apartment for Sale',
    ),
    '3/20 Main Street, Toowong, Qld 4066',
  );
  const domain = 'https://www.domain.com.au/20-main-street-toowong-qld-4066-2012345678';
  assert.equal(
    addressFromListing(domain, '20 Main Street, Toowong QLD 4066 | Domain'),
    '20 Main Street, Toowong QLD 4066',
  );
  for (const url of [
    'chrome://extensions',
    'https://www.domain.com.au/sale/',
    'https://other.com/property-123456789',
  ]) {
    assert.equal(addressFromListing(url, '20 Main Street, Toowong QLD 4066'), null);
  }
  assert.equal(addressFromListing(domain, '20 Main Street, Richmond VIC 3121 | Domain'), null);
  assert.equal(addressFromListing(domain, 'Contact agent | Domain'), null);
});

test('retains the unit, locality and postcode from Logan listing titles on either supported site', () => {
  const address = '2/10 Main Street, Beenleigh, QLD 4207';
  assert.equal(
    addressFromListing(
      'https://www.realestate.com.au/property-unit-qld-beenleigh-123456789',
      `${address} - Unit for Rent`,
    ),
    address,
  );
  assert.equal(
    addressFromListing(
      'https://www.domain.com.au/2-10-main-street-beenleigh-qld-4207-2012345678',
      `Sold - ${address} | Domain`,
    ),
    address,
  );
});
