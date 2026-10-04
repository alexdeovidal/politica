# Cartography for election browsing

Retrieved on 2026-10-04. These are geographic boundaries and approximate city centres,
not election results. All counts still come exclusively from the live TSE files.

- Brazilian states and simplified municipal boundaries: official IBGE v3 malhas API.
  Every generated JSON preserves its exact source URL.
- Mato Grosso: official `MT_Municipios_2024.zip` from IBGE's territorial meshes.
  This replaces the entire state, including the revised parent municipalities,
  because the simplified API still omits Boa Esperança do Norte (IBGE 5101837).
  Polygon rings are simplified at 0.003 geographic degrees for browser rendering.
- Country boundaries: Natural Earth, `ne_50m_admin_0_countries`, public domain.
  Rings are simplified at 0.04 geographic degrees; minor islands below 0.025
  square degrees are omitted, retaining the largest polygon of every territory.
  This is a browsing map; overseas city points remain independently selectable.
  https://www.naturalearthdata.com/downloads/50m-cultural-vectors/50m-admin-0-countries-2/
  https://github.com/nvkelso/natural-earth-vector/tree/master/geojson
- Overseas city centres: GeoNames `cities500.zip`, Creative Commons Attribution.
  https://download.geonames.org/export/dump/
  Each city retains its GeoNames ID. Attribution links are shown beside the map.
- TSE's public geographic catalogue was used to disambiguate translated city names
  and homonyms: https://www.tse.jus.br/hotsites/locais-votacao-exterior/
  Its historical list is used only for geographic association. Current electoral
  availability comes from EA12's 2026 city codes, not from this older catalogue.
  Geographic exceptions such as Ljubljana (SI), Hong Kong (HK) and French Guiana
  (GF) follow GeoNames. They do not alter electoral identities or result scopes.

Files use `[longitude, -latitude]` coordinates for SVG. `bounds` holds
`[minX, minY, maxX, maxY]`. Country shape identifiers are ISO A2; state identifiers
are lowercase UFs; municipality shapes use IBGE's seven-digit code. The client
joins municipal shapes to TSE's explicit `cdi` field. It never uses a fuzzy name
to choose an electoral city.

The bundled files cover all 5,571 EA12 Brazilian electoral localities (including
the Federal District and Fernando de Noronha) and all 186 overseas city codes.
Cities missing from a future cartographic edition remain accessible through the
official textual selectors. Country browsing opens its cities; a city must be
selected to narrow votes, since the TSE files do not publish a country aggregate.
