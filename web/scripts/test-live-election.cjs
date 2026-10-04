// Official snapshots captured on 2026-10-04 before counting. Changes below are
// test scenarios only; the application never seeds or simulates election data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Database = require('better-sqlite3');
const root = path.resolve(__dirname, '..');
function moduleFrom(file, dependencies = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const js = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  const module = {exports: {}};
  new Function('require', 'module', 'exports', js)(name => dependencies[name] || require(name), module, module.exports);
  return module.exports;
}
const model = moduleFrom('src/lib/live-election/model.ts');
const geography = moduleFrom('src/lib/live-election/geography.ts');
const fixture = name => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/live-election', `${name}.json`), 'utf8'));
const elections = model.parseElections(fixture('ele-c'));
const states = model.parseStates(fixture('municipios'));
const mapStates = model.parseStates(fixture('municipios-map'));
const selection = model.selectionFromParams(new URLSearchParams());
const election = model.findElection(elections, selection);
let checks = 0;
function check(name, run) {run(); checks++; console.log(`PASS ${name}`);}
function parse(raw, selected = selection) {return model.parseResult(raw, model.findElection(elections, selected), selected, states);}
check('map clicks retain explicit cities and clear incompatible zones', () => {
  assert.deepEqual(geography.changeElectionSelection({...selection, state: 'sp', municipality: '71072', zone: '0001'}, {state: 'zz', municipality: '30805'}), {...selection, state: 'zz', municipality: '30805', zone: ''});
  assert.equal(geography.changeElectionSelection({...selection, state: 'sp', office: '7'}, {state: 'df'}).office, '8');
  assert.equal(geography.changeElectionSelection({...selection, state: 'df', office: '8'}, {state: 'sp'}).office, '7');
  assert.equal(geography.changeElectionSelection({...selection, state: 'sp', zone: '0001'}, {municipality: '71072'}).zone, '');
  assert.equal(geography.changeElectionSelection({...selection, state: 'pe', office: '25', municipality: '12345'}, {municipality: '54321'}).office, '1');
});
check('cartographic joins use official IBGE codes instead of similar names', () => {
  const city = states.find(state => state.code === 'sp').municipalities.find(city => city.code === '71072');
  assert.equal(city.ibgeCode, '3550308');
  const shapes = [{code: '3550308', d: 'M0,0Z', bounds: [0,0,1,1], point: [.5,.5]}, {code: '9999999', name: city.name, d: 'M0,0Z', bounds: [0,0,1,1], point: [.5,.5]}];
  const joined = geography.municipalityShapes(shapes, [city]);
  assert.equal(joined.length, 1);
  assert.equal(joined[0].municipality.code, '71072');
});
check('every Brazilian electoral municipality has a usable polygon, including the new MT city', () => {
  let count = 0;
  for (const state of mapStates.filter(state => state.code !== 'zz')) {
    const file = JSON.parse(fs.readFileSync(path.join(root, 'public/maps/live-2026', `${state.code}.json`), 'utf8'));
    assert(file.source.startsWith('https://servicodados.ibge.gov.br/') || file.source.startsWith('https://geoftp.ibge.gov.br/'));
    const joined = geography.municipalityShapes(file.shapes, state.municipalities);
    assert.equal(joined.length, state.municipalities.length, state.code);
    assert(joined.every(shape => shape.d.startsWith('M') && !shape.d.includes('NaN') && shape.bounds.every(Number.isFinite)));
    count += joined.length;
  }
  assert.equal(count, 5571);
});
check('overseas geography covers current TSE city codes and known country locations', () => {
  const cities = JSON.parse(fs.readFileSync(path.join(root, 'public/maps/live-2026/exterior.json'), 'utf8')).cities;
  const official = mapStates.find(state => state.code === 'zz').municipalities;
  assert.equal(cities.length, 186);
  assert.equal(new Set(cities.map(city => city.code)).size, cities.length);
  assert(official.every(city => cities.some(point => point.code === city.code)));
  assert(cities.every(city => /^[A-Z]{2}$/.test(city.country) && city.point.every(Number.isFinite) && Math.abs(city.point[0]) <= 180 && Math.abs(city.point[1]) <= 90));
  assert.equal(cities.find(city => city.code === '30805').country, 'NZ');
  assert.equal(cities.find(city => city.name === 'LISBOA').country, 'PT');
  assert.equal(cities.find(city => city.name === 'LIUBLIANA').country, 'SI');
  assert.equal(cities.find(city => city.name === 'KINGSTON-JAMAICA').country, 'JM');
});
check('map zoom boxes remain finite for tiny areas', () => {
  const box = geography.paddedBox([1,1,1,1]);
  assert(box.every(Number.isFinite));
  assert(box[2] > 0 && box[3] > 0);
  assert.deepEqual(geography.combinedBounds([]), [-180,-84,180,60]);
});
check('pre-count is not a zero-vote result', () => {
  const result = parse(fixture('presidente'));
  assert.equal(result.progress, 'waiting');
  assert.equal(result.candidates.length, 12);
  assert.equal(result.votes.valid, null);
  assert(result.candidates.every(candidate => candidate.votes === null && candidate.percentage === null && candidate.status === ''));
  assert.equal(result.sections.total, 499248);
});
check('accent-insensitive search accepts missing middle names', () => {
  const candidate = parse(fixture('presidente')).candidates.find(item => item.number === '22');
  assert(model.matchesLiveSearch(`${candidate.name} ${candidate.legalName}`, 'Flávio Bolsonaro'));
  assert(model.matchesLiveSearch('São Paulo', 'sao paulo'));
  assert(!model.matchesLiveSearch('São Paulo', 'sao recife'));
});
check('state, city, zone and overseas files match their actual scopes', () => {
  for (const [name, change] of [
    ['sp-governador', {office: '3', state: 'sp'}],
    ['sp-cidade', {state: 'sp', municipality: '71072'}],
    ['sp-zona', {state: 'sp', municipality: '71072', zone: '0001'}],
    ['wellington', {state: 'zz', municipality: '30805'}],
  ]) {
    const chosen = {...selection, ...change};
    model.validateSelection(chosen, states, model.findElection(elections, chosen));
    const result = parse(fixture(name), chosen);
    assert.equal(result.progress, 'waiting');
    assert(result.sourceUrl.startsWith('https://resultados.tse.jus.br/oficial/ele2026/'));
  }
});
check('invalid places and unavailable contests are rejected before fetching', () => {
  for (const change of [{office: '3'}, {state: 'zz', office: '3'}, {state: 'sp', office: '8'}, {state: 'sp', municipality: '99999'}, {state: 'sp', municipality: '71072', zone: '9999'}, {turn: 2}, {state: 'sp', office: '25'}]) {
    const chosen = {...selection, ...change};
    assert.throws(() => model.validateSelection(chosen, states, model.findElection(elections, chosen)));
  }
});
check('simulation, different elections and mismatched scopes are rejected', () => {
  for (const change of [{f: 's'}, {ele: '9999'}, {t: '2'}, {tpabr: 'uf'}, {cdabr: 'sp'}, {and: 'x'}, {s: {ts: '10', st: '11'}}]) assert.throws(() => parse({...fixture('presidente'), ...change}));
});
function partial() {
  const raw = fixture('presidente');
  raw.and = 'p'; raw.tf = 'n'; raw.dv = 's';
  raw.dt = '04/10/2026'; raw.ht = '17:04:32';
  raw.s.st = '5'; raw.s.pst = '0,00'; raw.s.pstn = '0.001001506';
  const candidate = raw.carg[0].agr[0].par[0].cand[0];
  candidate.vap = '587'; candidate.pvap = '38,52'; candidate.pvapn = '38.517060367';
  candidate.e = 's'; candidate.st = '2º turno';
  return raw;
}
check('partial votes use official precision and do not infer a winner', () => {
  const result = parse(partial());
  assert.equal(result.progress, 'partial');
  assert.equal(result.candidates[0].votes, 587);
  assert.equal(result.candidates[0].percentage, 38.517060367);
  assert.equal(result.candidates[0].status, '');
  assert.equal(result.totalizedAt, '2026-10-04T17:04:32-03:00');
});
check('withheld votes remain hidden even when populated in a file', () => {
  const result = parse({...partial(), dv: 'n', tf: 's', md: 'e'});
  assert.equal(result.progress, 'waiting');
  assert.equal(result.mathematicalDecision, '');
  assert(result.candidates.every(candidate => candidate.votes === null && candidate.percentage === null && candidate.status === ''));
});
check('100% of sections is distinct from a finalized contest', () => {
  assert.equal(parse({...partial(), and: 'f'}).progress, 'counted');
  const final = parse({...partial(), and: 'f', tf: 's'});
  assert.equal(final.progress, 'final');
  assert.equal(final.candidates[0].status, '2º turno');
});
check('section counts and timestamps use the official meaning', () => {
  const raw = partial(); raw.s.sa = '3'; raw.s.sna = '2';
  assert.equal(parse(raw).sections.tallied, 3);
  assert.equal(parse(raw).sections.notTallied, 2);
  assert.equal(model.tseTimestamp('31/02/2026', '12:00:00'), null);
  assert.equal(model.tseTimestamp('04/10/2026', '25:00:00'), null);
  assert.equal(model.officialCount('9007199254740992'), null);
});
check('territory overview uses configured areas and official section progress', () => {
  const overview = model.parseOverview(fixture('acompanhamento'), election, 'br', states);
  assert.equal(overview.territories.length, 4);
  assert.equal(overview.territories.find(item => item.state === 'sp').percentage, 0);
});

async function checkService() {
  const store = new Database(':memory:');
  const service = moduleFrom('src/lib/live-election/service.ts', {'./model': model, '@/lib/platform/store': {platformStore: () => store}});
  const originalFetch = global.fetch, originalNow = Date.now;
  let clockOffset = 0, calls = 0, behavior = 'ok', resultPayload = fixture('presidente');
  Date.now = () => originalNow() + clockOffset;
  const callsByUrl = new Map();
  global.fetch = async (url, options) => {
    calls++; callsByUrl.set(url, (callsByUrl.get(url) || 0) + 1);
    if (url.endsWith('ele-c.json')) return Response.json(fixture('ele-c'));
    if (url.includes('/config/mun-')) return Response.json(fixture('municipios'));
    if (behavior === '304') {assert(options.headers['If-None-Match']); return new Response(null, {status: 304});}
    if (behavior === '503') return new Response('Unavailable', {status: 503});
    if (behavior === '404') return new Response('', {status: 404});
    if (behavior === '403') return new Response('', {status: 403});
    return Response.json(resultPayload, {headers: {ETag: 'official-snapshot'}});
  };
  try {
    const results = await Promise.all([service.getLiveResult(selection), service.getLiveResult(selection)]);
    assert.deepEqual(results[0], results[1]);
    const url = results[0].sourceUrl;
    assert.equal(callsByUrl.get(url), 1);
    await service.getLiveResult(selection); assert.equal(callsByUrl.get(url), 1);
    console.log('PASS visitors share one upstream request and snapshot'); checks++;
    clockOffset += 31000; behavior = '304';
    const revalidated = await service.getLiveResult(selection);
    assert(!revalidated.stale); assert.equal(callsByUrl.get(url), 2);
    console.log('PASS conditional HTTP validation refreshes the snapshot'); checks++;
    clockOffset += 31000; behavior = '503';
    const stale = await service.getLiveResult(selection);
    assert(stale.stale); assert.equal(stale.checkedAt, revalidated.checkedAt);
    const before = calls; await service.getLiveResult(selection); assert.equal(calls, before);
    console.log('PASS upstream failure preserves last valid data and timestamp'); checks++;
    clockOffset += 61000; behavior = 'ok'; resultPayload = {...fixture('presidente'), f: 's'};
    assert((await service.getLiveResult(selection)).stale);
    console.log('PASS an invalid upstream response cannot overwrite an official snapshot'); checks++;
    behavior = '404'; const city = {...selection, state: 'sp', municipality: '71072'};
    await assert.rejects(service.getLiveResult(city), service.SourceUnavailable);
    const count404 = calls;
    await assert.rejects(service.getLiveResult(city), service.SourceUnavailable);
    assert.equal(calls, count404);
    console.log('PASS unpublished results are cached and return a structured failure'); checks++;
    behavior = '403';
    await assert.rejects(service.getLiveResult({...selection, state: 'zz', municipality: '30805'}), service.SourceUnavailable);
    const countBlocked = calls;
    await assert.rejects(service.getLiveResult({...selection, state: 'df'}), service.SourceUnavailable);
    assert.equal(calls, countBlocked);
    console.log('PASS upstream blocking pauses requests across all scopes'); checks++;
  } finally {global.fetch = originalFetch; Date.now = originalNow; store.close();}
}
checkService().then(() => console.log(`${checks} live-election checks passed.`)).catch(error => {console.error(error); process.exitCode = 1;});
