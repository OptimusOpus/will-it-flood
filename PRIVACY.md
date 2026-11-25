# Will It Flood? — Chrome extension privacy policy

Effective 25 November 2026. Taylor publishes Will It Flood?, an independent extension that checks official flood mapping for a property you choose in Queensland, Australia.

## Opening the popup

When you open the extension, Chrome gives it temporary access to the active tab’s URL and title. The popup checks them on your device. On a supported Domain or realestate.com.au listing, it extracts a property address from the title and puts it in an editable search field. Opening the popup or typing in that field does not send a search. The extension does not transmit the tab URL or full title, read the page body, or monitor other tabs.

## Running a search

Choosing **Check flood mapping** sends the address components you confirm, or the lot and plan you enter, directly to the public data services for the selected council areas. The default searches all areas supported by your version. You can select one area before searching. To match the property and check the flood map, the extension can send the resulting parcel identifiers, a property’s registered coordinates or its boundary outline to the relevant services. These locations describe the property in your search. The extension does not ask for your device’s GPS location.

| Area | Services that can receive lookup data |
| --- | --- |
| Brisbane | Brisbane City Council’s open data service at `data.brisbane.qld.gov.au`. |
| Logan | Logan City Council’s address and parcel records hosted by Esri at `services5.arcgis.com`, and its flood service at `arcgis.lcc.wspdigital.com`. |
| Ipswich | Ipswich City Council’s Development.i records hosted on Microsoft Azure at `web-prod-geoserver-icc-e-01.azurewebsites.net`, and Queensland Government parcel and historical flood services at `spatial-gis.information.qld.gov.au`. |
| Gold Coast | Queensland Government address, postcode and parcel services at `spatial-gis.information.qld.gov.au`, and City of Gold Coast flood layers hosted by Esri at `services.arcgis.com` and `services-ap1.arcgis.com`. |

Requests use HTTPS. The services receive your connection’s IP address in the ordinary course of answering a request and may keep logs under their own policies. Following an official map or report link opens the provider’s website in a new tab. A property-specific link can include the selected lot, land number or council property identifier.

## Storage and sharing

Your search and results are held in the popup’s memory. Closing the popup discards them. The extension has no user accounts, saved search history, analytics or advertising. Taylor operates no server that receives your searches. Lookup information is shared only with the services needed for the property check you request. Taylor does not sell it or use it for advertising, credit or lending decisions.

Will It Flood?’s use of information received from Google APIs complies with the Chrome Web Store User Data Policy, including its Limited Use requirements. [Chrome Web Store Limited Use policy](https://developer.chrome.com/docs/webstore/program-policies/limited-use)

## Contact

For privacy questions, contact Taylor through the project’s support page. Issues are public, so please leave personal details and private addresses out of your message. [Will It Flood? support](https://github.com/OptimusOpus/will-it-flood/issues)
