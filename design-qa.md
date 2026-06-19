source visual truth path: Conversation ImageGen result, "Agenda First" option selected by the user.
implementation screenshot path: qa-mobile.png
viewport: 390 x 844 mobile
state: default date selection, all cinemas, all networks
full-view comparison evidence: Agenda-first concept versus local Chrome screenshot saved at qa-mobile.png.
focused region comparison evidence: Header/date rail/filter controls and first three agenda rows inspected in mobile Chrome.

**Findings**
- No actionable P0/P1/P2 findings.

**Required Fidelity Surfaces**
- Fonts and typography: mobile hierarchy is clear, readable, and stable; no negative letter spacing or clipped labels observed.
- Spacing and layout rhythm: one continuous product surface, sticky header/filter area, lightweight row dividers, and no card-inside-card structure.
- Colors and visual tokens: restrained off-white surface, charcoal text, red primary action/accent, blue version badge, green partner badge; not a one-hue palette.
- Image quality and asset fidelity: the selected direction was data/list-first and did not require photographic assets; icons use Lucide via CDN.
- Copy and content: French UI labels, future date chips, official booking links, and source/update status are present.

**Checks Performed**
- Page and JSON returned HTTP 200 locally.
- Mobile Chrome render at 390 px loaded 3 rows for June 19, 2026 with no console errors, failed requests, or horizontal overflow.
- Future date chip for June 20, 2026 displayed the MK2 future session.
- MK2 network filter preserved the expected future row.
- Details dialog opened and showed time, cinema, city, version, genre, and reservation action.
- UGC parser sample extracted 111 showtimes from UGC Les Halles for June 19, 2026.
- MK2 parser sample extracted 74 cinema/session objects and 382 sessions from one MK2 page.

**Patches Made Since Previous QA Pass**
- Added favicon data URL to prevent browser favicon 404.
- Added French accents to primary UI labels and sample data.
- Fixed MK2 parser object marker from `film` to `cinema` because MK2 flight data orders objects as cinema, sessions, film.
- Made the update script import-safe so parser helpers can be tested without running the full refresh.

**Open Questions**
- The live update job depends on public website structures for UGC and MK2. If either site changes markup or React flight structure, `scripts/update-data.mjs` may need adjustment.

**Implementation Checklist**
- Static mobile app implemented.
- Local mobile render checked.
- Interaction states checked.
- Data parser samples checked.
- GitHub Pages workflow included.

**Follow-up Polish**
- Add a small app icon set if the page is saved to the phone home screen.
- Add optional "near me" sorting later if geolocation becomes useful.

final result: passed
