# Will It Flood?

A local Chrome extension by Taylor for checking flood mapping in the Brisbane and Logan City Council areas. Enter a street address or lot and plan in the toolbar popup. If several properties match, choose the property you want. An address lookup checks each current parcel linked to that property. A lot-and-plan lookup checks the specified lot. Each council’s result uses its own map terminology.

## Load or reload in Chrome

1. Open `chrome://extensions` and turn on **Developer mode**.
2. If you already loaded this checkout’s `dist/` folder, click **Reload** on the **Will It Flood?** card. For a first installation, choose **Load unpacked** and select `dist/`.
3. If you use the portable ZIP, extract the new ZIP into the folder Chrome already loads and click **Reload**, or choose **Load unpacked** for a new folder. Select the folder that directly contains `manifest.json`.
4. Open the Extensions menu, pin **Will It Flood?**, then open the toolbar popup.

The extension queries public services directly. It needs an internet connection and works without an account, API key or local server. [Chrome’s unpacked extension guide](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)

## Install on an Android phone

Copy `dist-zip/will-it-flood-android.apk` to the phone, open the file in **Files** or **Downloads**, and tap **Install**. If Android asks, allow that file manager to install this app. Open **Will It Flood?** from the app drawer and type or paste an address. This standalone app uses the same council lookups and opens official reports in your browser. Automatic listing prefill is available in the desktop Chrome extension.

## Try a property

| Search for | What to look for |
| --- | --- |
| **105 George Street, Beenleigh QLD 4207** | Logan City Council’s Beenleigh Customer Service Centre. The popup resolves it to **1RP128941**. On 24 November 2026 the overland flow layer intersected the lot. |
| **12 Cardwell Court, Meadowbrook QLD 4131** | Riverdale Park, lot **997SP104713**. On 24 November 2026 different parts of the lot intersected high, moderate and low risk areas. Both the river and creek results showed a 20% annual-chance scenario. [Council park directory](https://www.logan.qld.gov.au/community/parks-and-gardens/holding-an-event-in-a-park) |
| **119 Lamington Street, New Farm** | Brisbane Powerhouse, lot **2RP210504**. The January 2011 river level is 3.0 m AHD. Council estimates minimum ground at 3.4 m AHD. The popup links to the FloodWise report. |

Choose **Check flood mapping**, or paste the lot and plan directly. **Change address** returns to the search. By default both council registers are searched. You can also select one council. If only one register answers, you can confirm a returned parcel or retry the search.

On an individual Queensland realestate.com.au or Domain listing, the popup can prefill the address from the tab title. Check the prefilled address and submit it. Manual entry works from any tab.

For a property with several lots, the popup summarises the findings across the holding. Expand a lot to see its result. A missing assessment appears separately. For a Brisbane strata address, a separate **Common property** entry shows the scheme land when Council confirms a current common lot.

## Reading a Logan result

The lookup matches a Logan City Council primary address to its current cadastral lots via Council’s property key. It checks each lot boundary against layers from the **May 2025 Logan Flood Portal** map service. One lot can intersect several features or risk categories. A result describes the land. It cannot tell you whether floodwater entered a building, reached a particular floor, or how deep it was there. [Council’s flood studies and reports](https://www.logan.qld.gov.au/residents/disasters-and-emergencies/types-of-disasters/flood) · [Map layers](https://arcgis.lcc.wspdigital.com/server/rest/services/FloodPortal/ConsolidatedFloodData_20250505/MapServer)

- **Flood risk areas** combine the likelihood of flooding with how hazardous floodwater may be, including its depth and speed. **Investigation area** means Council needs further study to establish the risk. Where Council identifies an investigation area without a risk category, the popup qualifies the river, creek and isolation information. Council’s local property notices also appear alongside the map findings.
- **River flooding** and **Creek flooding** show the most frequent modelled scenario from the published study extents that intersects the lot, including its boundary. The annual percentage is the chance of an event of that size or larger in a given year. The study scenarios include projected climate conditions. Council also models the probable maximum flood, which has no assigned annual percentage here. The portal separately maps current-climate scenarios and local depths. [Logan flood study extents](https://arcgis.lcc.wspdigital.com/server/rest/services/FloodPortal/AllStudyExtent_20250505/MapServer/0)
- **High flow area** identifies land that carries hazardous floodwater. **Overland flow** identifies land that surface runoff may cross during heavy rain. **Isolation** means rising water can cut access. A low flood island can subsequently go under water. A high flood island can lose access while higher ground remains above water. [Council’s Flood Portal guide](https://s3-ap-southeast-2.amazonaws.com/lcc-docs-planning/root/Flood/Logan%20Flood%20Portal%20-%20Help%20Guide.pdf)
- **No overlap in the checked layers** applies only to this lot and the layers the popup successfully checked. Local waterways can lack a completed study, and flooding remains possible. If only some layers answer, the popup names the unavailable layers and displays any verified intersections. A missing boundary or incomplete checks without a verified intersection give **Flood lookup unavailable**.
- **Open property in Logan Flood Portal** uses Council’s property key. Select **Property Flood Report** there for Council’s assessment and maps. Council’s guide says the interactive portal is available from Australia. A multi-lot property report may cover a larger area than a directly entered lot. Council publishes changes to its mapping and future planning instruments separately. [Logan Flood Portal](https://flood.logan.qld.gov.au/) · [Council mapping updates](https://www.logan.qld.gov.au/planning-and-building/Flood-maps)

Council lists the Beenleigh example as a public service centre. Queensland’s land parcel register independently identifies its lot as Beenleigh, Logan City. The extension does not need to contact the state register during a lookup. [Council service centres](https://www.logan.qld.gov.au/connect-with-us) · [Queensland record for 1RP128941](https://spatial-gis.information.qld.gov.au/arcgis/rest/services/PlanningCadastre/QSCF_LandParcelPropertyFramework/MapServer/120/query?where=lotplan%3D%271RP128941%27&f=pjson&outFields=lotplan%2Clocality%2Clga&returnGeometry=false)

## Reading a Brisbane result

- River, creek and storm tide show the highest Council likelihood band recorded on any part of the selected lot. The overland flow entry means some part of the lot overlaps a mapped overland flow area.
- **Modelled flood coverage** shows the most frequent modelled event with a positive area of overlap for each source among the 20%, 5%, 2% and 1% annual-chance scenarios. Council publishes these areas separately from its likelihood bands. A lot can have modelled coverage without a likelihood flag.
- Recorded historical flood levels are elevations in metres above the Australian Height Datum (m AHD). Compare them with the estimated ground elevations on the lot. A date or modelled elevation alone does not establish whether water reached a building.
- **No mapped overlap recorded** means the available record contains no likelihood or overland flow flags and no positive coverage in the modelled scenarios checked. Flooding is still possible. The popup reports an unavailable assessment separately when the parcel has no usable flood data.
- For flood depths, planning details or an official FloodWise property report, follow the Council links. [Brisbane’s guide to flood maps and property reports](https://www.brisbane.qld.gov.au/community-support-and-safety/natural-disasters-and-emergencies/flooding-in-brisbane/flood-maps-and-reports)

## Data and privacy

The popup reads the active tab’s title and URL locally to prefill supported listings. Submitting a search sends address components or the lot and plan to the selected councils’ data hosts. Brisbane uses `data.brisbane.qld.gov.au`. Logan uses `services5.arcgis.com` for address and parcel records and `arcgis.lcc.wspdigital.com` for parcel intersections with flood mapping. Opening a report or map sends its parcel identifier or property key to the council website. The extension keeps no search history.

Logan City Council supplies the primary address register, cadastre and flood mapping. The primary address dataset is licensed under CC BY 3.0 Australia. The popup joins Council records and summarises map intersections. [Primary property addresses and licence](https://www.arcgis.com/home/item.html?id=38de8363dd93425199ac449eac4b1891) · [Logan cadastre](https://services5.arcgis.com/ZUCWDRj8F77Xo351/arcgis/rest/services/VIEW_Latest_Cadastre/FeatureServer/0) · [Logan flood map service](https://arcgis.lcc.wspdigital.com/server/rest/services/FloodPortal/ConsolidatedFloodData_20250505/MapServer)

Brisbane parcel boundaries are © Brisbane City Council and © State of Queensland (Department of Resources). Address and flood records are © Brisbane City Council. The extension matches addresses to parcels and summarises Council’s likelihood flags, modelled flood coverage, historical levels and estimated ground elevations. The four Brisbane datasets are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

- [Property address locations](https://data.brisbane.qld.gov.au/explore/dataset/property-address-locations/)
- [Property boundaries — Parcel](https://data.brisbane.qld.gov.au/explore/dataset/property-boundaries-parcel/)
- [Flood awareness property parcel metrics](https://data.brisbane.qld.gov.au/explore/dataset/flood-awareness-property-parcel-metrics/)
- [Council’s metric definitions](https://data.brisbane.qld.gov.au/explore/dataset/flood-awareness-property-parcel-metrics-reference/)

## Build from source

Use Node.js 22.15.1 or newer and pnpm 10.11.0. Run these commands from the repository root.

```sh
pnpm install --frozen-lockfile
pnpm build
```

This writes the unpacked extension to `dist/`. Run `pnpm zip` to rebuild it and create `dist-zip/will-it-flood.zip`.

For a personal Android APK, run `pnpm build` followed by `bash android/build.sh`. The script uses a JDK, Android SDK Platform 36, Android Build Tools 35.0.0 and the local Android debug signing key. It writes `dist-zip/will-it-flood-android.apk`.

Run `pnpm test` for the lookup and listing tests, `pnpm type-check` for TypeScript, and `pnpm e2e` to exercise the packaged popup in Chrome for Testing. Set `E2E_LIVE_COUNCIL=true` to include live lookups for Brisbane Powerhouse and the Beenleigh Customer Service Centre.
