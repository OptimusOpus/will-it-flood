describe('Will It Flood?', () => {
  beforeEach(async () => {
    const extension = await browser.getExtensionPath();
    await browser.url(`${extension}/index.html`);
  });

  it('opens with both councils selected and the official map links', async () => {
    await expect($('h1')).toHaveText('Will it flood?');
    await expect($('form input')).toBeDisplayed();
    await expect($('#council')).toHaveValue('all');
    await expect($('a[href^="https://fam.brisbane.qld.gov.au/"]')).toBeDisplayed();
    await expect($('footer a[href*="logan.qld.gov.au"]')).toBeDisplayed();
  });

  it('keeps failed lookups distinct from a flood assessment and supports retry', async () => {
    await $('#council').selectByAttribute('value', 'brisbane');
    await browser.execute(() => {
      let fail = true;
      window.fetch = async () => {
        if (fail) {
          fail = false;
          throw new TypeError('Offline');
        }
        return Response.json({ total_count: 0, results: [] });
      };
    });
    await $('#property').setValue('2RP210504');
    await $('button[type=submit]').click();
    await expect($('[role=alert]')).toHaveText(expect.stringContaining('Address search unavailable'));
    const retry = $('button[type=submit]');
    await expect(retry).toHaveText(expect.stringContaining('Try address search again'));
    await retry.click();
    await expect($('.feedback h2')).toHaveText('No matching property');
  });

  it('checks every lot for a property and surfaces the highest likelihood', async () => {
    await $('#council').selectByAttribute('value', 'brisbane');
    await browser.execute(() => {
      window.fetch = async input => {
        const url = new URL(String(input));
        let results;
        if (url.pathname.includes('/property-address-locations/')) {
          results = [
            {
              property_id: '123',
              unit_number: null,
              house_number: '10',
              street_name: 'MAIN',
              street_type: 'Street',
              street_suffix: null,
              suburb: 'NEW FARM',
              postcode: '4005',
            },
          ];
        } else if (url.pathname.includes('/property-boundaries-parcel/')) {
          results = ['1RP12345', '2RP12345'].map(lotplan => ({
            lotplan,
            property_id: '123',
            plan: 'RP12345',
            lot_type: 'NS',
          }));
        } else if (url.searchParams.get('refine') === 'lotplan:1RP12345') {
          results = [{ lotplan: '1RP12345', metric: 'MIN_GROUND_RL', value: '20' }];
        } else if (url.searchParams.get('refine') === 'lotplan:2RP12345') {
          results = [{ lotplan: '2RP12345', metric: 'FL_HIGH_RIVER', value: '1' }];
        } else {
          throw new Error('Unexpected lookup');
        }
        return Response.json({ total_count: results.length, results });
      };
    });
    await $('#property').setValue('10 Main Street, New Farm');
    await $('button[type=submit]').click();
    await expect($('.property-summary')).toHaveText(expect.stringContaining('1 of 2 lots'));
    await expect($('.property-summary')).toHaveText(expect.stringContaining('High'));
    const mappedLot = $('details*=2RP12345');
    await mappedLot.$('summary').click();
    await expect($('a[href="https://fwpr.brisbane.qld.gov.au/?lotplan=2RP12345"]')).toBeDisplayed();
  });

  it('identifies the unavailable council when the other council has zero matches', async () => {
    await browser.execute(() => {
      window.fetch = async input => {
        if (new URL(String(input)).hostname === 'data.brisbane.qld.gov.au') {
          return Response.json({ total_count: 0, results: [] });
        }
        return new Response(null, { status: 503 });
      };
    });
    await $('#property').setValue('105 George St, Beenleigh');
    await $('button[type=submit]').click();
    await expect($('[role=alert]')).toHaveText(expect.stringContaining('Logan City Council'));
    await expect($('.finding')).not.toExist();
  });

  it('lets the user confirm the available match when only one council replied', async () => {
    await browser.execute(() => {
      window.fetch = async input => {
        const url = new URL(String(input));
        if (url.hostname !== 'data.brisbane.qld.gov.au') return new Response(null, { status: 503 });
        const lotplan = '2RP210504';
        const results = url.pathname.includes('/property-boundaries-parcel/')
          ? [{ lotplan, locality: 'New Farm', property_id: '473920' }]
          : [{ lotplan, metric: 'FL_HIGH_RIVER', value: '1' }];
        return Response.json({ total_count: 1, results });
      };
    });
    await $('#property').setValue('2RP210504');
    await $('button[type=submit]').click();
    await expect($('#choose-address')).toBeDisplayed();
    await expect($('.feedback')).toHaveText(expect.stringContaining('Logan City Council'));
    await expect($('.finding')).not.toExist();
    await $('button*=2RP210504').click();
    await expect($('a[href="https://fwpr.brisbane.qld.gov.au/?lotplan=2RP210504"]')).toBeDisplayed();
  });

  it('retries a missing Logan boundary before reporting a fully checked lot with no overlap', async () => {
    await $('#council').selectByAttribute('value', 'logan');
    await browser.execute(() => {
      const parcel = {
        Property_Key: 296422,
        Formatted_Lot_Plan: 'Lot 1 RP 128941',
        Address_Formatted: '105 George Street BEENLEIGH QLD 4207',
      };
      let boundaryMissing = true;
      window.fetch = async (input, init) => {
        const isCadastre = String(input).includes('/VIEW_Latest_Cadastre/');
        if (isCadastre && init?.method !== 'POST') return Response.json({ features: [{ attributes: parcel }] });
        const params = init?.body as URLSearchParams;
        const fields = params
          .get('outFields')!
          .split(',')
          .map(name => ({ name }));
        if (!isCadastre) return Response.json({ fields, features: [] });
        const geometry = {
          rings: [
            [
              [0, 0],
              [0, 1],
              [1, 1],
              [0, 0],
            ],
          ],
        };
        const features = boundaryMissing ? [] : [{ attributes: parcel, geometry }];
        boundaryMissing = false;
        return Response.json({
          fields,
          features,
          geometryType: 'esriGeometryPolygon',
          spatialReference: { wkid: 7856 },
        });
      };
    });
    await $('#property').setValue('1RP128941');
    await $('button[type=submit]').click();
    await expect($('.finding h3')).toHaveText('Flood lookup unavailable');
    await expect($('.finding')).toHaveText(expect.stringContaining('parcel boundary'));
    await expect($('a.primary')).toHaveHref('https://flood.logan.qld.gov.au/?propertyKey=296422');
    await $('button=Retry flood lookup').click();
    await expect($('.finding h3')).toHaveText('No overlap in the checked layers');
    await expect($('.finding')).toHaveText(expect.stringContaining('flooding is possible'));
  });

  if (process.env.E2E_LIVE_COUNCIL === 'true') {
    it('shows modelled creek coverage on a Brisbane lot with no awareness flag', async () => {
      await $('#council').selectByAttribute('value', 'brisbane');
      await $('#property').setValue('84 Pritchard Rd, Virginia QLD 4014');
      await $('button[type=submit]').click();
      await $('.finding').waitForDisplayed({ timeout: 40000 });
      await expect($('.finding')).toHaveText(expect.stringContaining('5% annual chance'));
      await expect($('.finding')).toHaveText(expect.stringContaining('Creek'));
      const ground = $('section[aria-label="Estimated ground elevations"]');
      await expect(ground).toHaveText(expect.stringContaining('7.2 m AHD'));
      await expect(ground).toHaveText(expect.stringContaining('8.4 m AHD'));
    });

    it('distinguishes a strata unit from mapped common property in its holding summary', async () => {
      await $('#council').selectByAttribute('value', 'brisbane');
      await $('#property').setValue('4/9 Elma Street, Salisbury');
      await $('button[type=submit]').click();
      await $('.property-summary').waitForDisplayed({ timeout: 40000 });
      await expect($('.property-summary')).toHaveText(expect.stringContaining('1 of 2 lots'));
      const common = $('details*=Common property CPSP170677');
      await common.$('summary').click();
      await expect(common.$('.source-list')).toHaveText(expect.stringContaining('High'));
    });

    it('finds Brisbane Powerhouse in Council’s live address and parcel records', async () => {
      await $('#property').setValue('119 Lamington Street, New Farm');
      await $('button[type=submit]').click();
      const report = $('a[href="https://fwpr.brisbane.qld.gov.au/?lotplan=2RP210504"]');
      await report.waitForDisplayed({ timeout: 40000 });
      await expect($('.history')).toHaveText(expect.stringContaining('January 2011'));
      await $('button=Change address').click();
      await expect($('#property')).toBeFocused();
    });

    it('matches Beenleigh Customer Service Centre to its Logan parcel in an all-councils search', async () => {
      await $('#property').setValue('105 George St, Beenleigh QLD 4207');
      await $('button[type=submit]').click();
      await $('.finding').waitForDisplayed({ timeout: 40000 });
      await expect($('.property-meta')).toHaveText(expect.stringContaining('1RP128941'));
      await expect($('.source-list')).toHaveText(expect.stringMatching(/overland flow/i));
      await expect($('a.primary[href="https://flood.logan.qld.gov.au/?propertyKey=296422"]')).toBeDisplayed();
    });
  }
});
