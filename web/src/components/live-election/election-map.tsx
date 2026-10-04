"use client";

import {memo, useEffect, useMemo, useRef, useState, type PointerEvent} from "react";
import {ArrowLeft, ArrowRight, Check, ChevronDown, ChevronRight, Crosshair, ExternalLink, Globe2, Hand, MapPin, Minus, Plus, RefreshCw, Search} from "lucide-react";
import {matchesLiveSearch, type ElectionSelection, type LiveOverview, type PublicConfig} from "@/lib/live-election/model";
import {combinedBounds, municipalityShapes, paddedBox, type Bounds, type ExteriorCity, type ExteriorFile, type MapFile, type MapShape, type Point} from "@/lib/live-election/geography";

const mapCache = new Map<string, Promise<MapFile | ExteriorFile>>();
function mapFile<T extends MapFile | ExteriorFile>(key: string): Promise<T> {
  let pending = mapCache.get(key);
  if (!pending) {
    const controller = new AbortController(), timeout = window.setTimeout(() => controller.abort(), 15000);
    pending = fetch(`/maps/live-2026/${key}.json`, {signal: controller.signal}).then(async response => {
      if (!response.ok) throw Error("A cartografia não pôde ser carregada.");
      const data = await response.json();
      if (!(key === "exterior" ? Array.isArray(data.cities) : Array.isArray(data.shapes))) throw Error("Cartografia inválida.");
      return data;
    }).catch(failure => {mapCache.delete(key); throw failure;}).finally(() => window.clearTimeout(timeout));
    mapCache.set(key, pending);
  }
  return pending as Promise<T>;
}
type MapEntry = {code: string; name: string; shape?: MapShape; point?: Point; city?: ExteriorCity; percentage?: number; selected: boolean; description?: string};
type Loaded = {key: string; file: MapFile; exterior: ExteriorFile};

function ElectionMapView({selection, config, configReady, overview, country, onCountry, onSelect}: {
  selection: ElectionSelection; config: PublicConfig | null; configReady: boolean; overview: LiveOverview | null;
  country: string; onCountry: (country: string) => void; onSelect: (change: Partial<ElectionSelection>) => void;
}) {
  const [world, setWorld] = useState(false), [expanded, setExpanded] = useState(true);
  const [loaded, setLoaded] = useState<Loaded | null>(null), [failure, setFailure] = useState<{key: string; message: string} | null>(null), [retry, setRetry] = useState(0);
  const [search, setSearch] = useState(""), [shown, setShown] = useState(18), [hovered, setHovered] = useState<string | null>(null), [pan, setPan] = useState(false);
  const [camera, setCamera] = useState<{key: string; box: Bounds} | null>(null);
  const svg = useRef<SVGSVGElement>(null), drag = useRef<{x: number; y: number; box: Bounds; moved: boolean} | null>(null);
  const exterior = useMemo(() => {
    const official = new Map((config?.exteriorMunicipalities || []).map(city => [city.code, city]));
    return (loaded?.exterior.cities || []).filter(city => official.has(city.code)).map(city => ({...city, name: official.get(city.code)!.name}));
  }, [config, loaded]);
  const selectedExterior = selection.state === "zz" ? exterior.find(city => city.code === selection.municipality) : undefined;
  const activeCountry = selection.state === "zz" ? selectedExterior?.country || (exterior.some(city => city.country === country) ? country : "") : "BR";
  const countryCities = useMemo(() => exterior.filter(city => city.country === activeCountry), [exterior, activeCountry]);
  const layer = world || selection.state === "zz" && !activeCountry ? "world" : selection.state === "zz" ? "country" : selection.state === "br" ? "br" : "state";
  const resourceKey = layer === "state" ? selection.state : layer === "br" ? "br" : "world";
  const currentFile = loaded?.key === resourceKey ? loaded.file : null;
  const layerKey = `${resourceKey}:${layer}:${activeCountry}:${selection.municipality}`;
  const loading = !currentFile && failure?.key !== resourceKey;
  const stateName = config?.states.find(state => state.code === selection.state)?.name || selection.state.toUpperCase();
  const countryName = countryCities[0]?.countryName || loaded?.file.shapes.find(shape => shape.code === activeCountry)?.name || "Exterior";
  const officialCity = configReady ? config?.municipalities.find(city => city.code === selection.municipality) : null;
  const caption = layer === "world" ? "Escolha um país ou território" : layer === "br" ? "Clique no estado que você quer acompanhar" : layer === "country" ? `Escolha uma cidade em ${countryName}` : `Escolha uma cidade em ${stateName}`;

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    Promise.all([mapFile<MapFile>(resourceKey), mapFile<ExteriorFile>("exterior")]).then(([file, exterior]) => {
      if (!cancelled) {setLoaded({key: resourceKey, file, exterior}); setFailure(null);}
    }).catch(error => {if (!cancelled) setFailure({key: resourceKey, message: error.message});});
    return () => {cancelled = true;};
  }, [resourceKey, retry, expanded]);

  const entries = useMemo<MapEntry[]>(() => {
    if (!currentFile) return [];
    const progress = new Map((overview?.territories || []).map(territory => [territory.municipality || territory.state, territory.percentage]));
    if (layer === "world") {
      const countries = new Map(exterior.map(city => [city.country, city.countryName]));
      countries.set("BR", "Brasil");
      return Array.from(countries, ([code, name]) => ({code, name, shape: currentFile.shapes.find(shape => shape.code === code), point: exterior.find(city => city.country === code)?.point, selected: code === activeCountry, description: code === "BR" ? "Estados e municípios" : `${exterior.filter(city => city.country === code).length} localidades do TSE`})).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    }
    if (layer === "country") return countryCities.map(city => ({code: city.code, name: city.name, point: city.point, city, selected: selection.municipality === city.code, percentage: selection.state === "zz" ? progress.get(city.code) : undefined}));
    if (layer === "br") return currentFile.shapes.flatMap(shape => {
      const state = config?.states.find(state => state.code === shape.code);
      return state ? [{code: state.code, name: state.name, shape, selected: selection.state === state.code, percentage: selection.state === "br" ? progress.get(state.code) : undefined}] : [];
    }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    if (!configReady) return [];
    const located = new Map(municipalityShapes(currentFile.shapes, config?.municipalities || []).map(shape => [shape.municipality.code, shape]));
    return (config?.municipalities || []).map(city => ({code: city.code, name: city.name, shape: located.get(city.code), selected: selection.municipality === city.code, percentage: progress.get(city.code), description: located.has(city.code) ? undefined : "Selecionar pela lista · malha indisponível"}));
  }, [currentFile, overview, exterior, countryCities, activeCountry, layer, config, configReady, selection.state, selection.municipality]);
  const filtered = entries.filter(entry => matchesLiveSearch(`${entry.name} ${entry.code}`, search));
  const selectedEntry = entries.find(entry => entry.selected);
  const hoverEntry = entries.find(entry => entry.code === hovered) || selectedEntry;
  const baseBox = useMemo<Bounds>(() => {
    if (layer === "world") return [-180, -84, 360, 144];
    if (layer === "country") {
      const cities = selectedExterior ? [selectedExterior] : countryCities;
      if (cities.length) return paddedBox(combinedBounds(cities.map(city => ({bounds: [city.point[0] - .5, city.point[1] - .5, city.point[0] + .5, city.point[1] + .5] as Bounds}))), selectedExterior ? 2 : 4);
    }
    if (selectedEntry?.shape && layer === "state") return paddedBox(selectedEntry.shape.bounds);
    return paddedBox(combinedBounds(currentFile?.shapes || []), 2);
  }, [layer, countryCities, selectedExterior, selectedEntry, currentFile]);
  const box = camera?.key === layerKey ? camera.box : baseBox;
  const labelSize = Math.max(box[2], box[3]) / 35;
  const pointRadius = Math.max(box[2], box[3]) / 100;

  function pick(entry: MapEntry) {
    if (drag.current?.moved) return;
    setSearch(""); setShown(18); setHovered(null); setWorld(false);
    if (layer === "world") {
      onSelect({state: entry.code === "BR" ? "br" : "zz", municipality: "", zone: "", office: "1"});
      onCountry(entry.code === "BR" ? "" : entry.code);
    } else if (layer === "br") {onCountry(""); onSelect({state: entry.code, municipality: "", zone: ""});}
    else {onSelect({state: layer === "country" ? "zz" : selection.state, municipality: entry.code, zone: ""}); if (entry.city) onCountry(entry.city.country);}
  }
  function go(level: "world" | "br" | "state" | "country") {
    drag.current = null; setSearch(""); setShown(18); setHovered(null); setCamera(null);
    setWorld(level === "world");
    if (level === "br") {onCountry(""); onSelect({state: "br", municipality: "", zone: "", office: "1"});}
    if (level === "state" || level === "country") {onSelect({municipality: "", zone: ""}); if (level === "country") onCountry(activeCountry);}
  }
  function zoom(factor: number) {
    const width = Math.max(.02, Math.min(720, box[2] * factor)), height = width * box[3] / box[2];
    setCamera({key: layerKey, box: [box[0] + (box[2] - width) / 2, box[1] + (box[3] - height) / 2, width, height]});
  }
  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    drag.current = null;
    if (event.button !== 0 || event.pointerType === "touch" && !pan) return;
    drag.current = {x: event.clientX, y: event.clientY, box: [...box], moved: false};
  }
  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    const start = drag.current;
    if (!start || !svg.current || event.buttons !== 1) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 6) return;
    start.moved = true; svg.current.setPointerCapture(event.pointerId);
    const bounds = svg.current.getBoundingClientRect(), scale = Math.max(start.box[2] / bounds.width, start.box[3] / bounds.height);
    setCamera({key: layerKey, box: [start.box[0] - dx * scale, start.box[1] - dy * scale, start.box[2], start.box[3]]});
  }
  function pointerUp(event: PointerEvent<SVGSVGElement>) {
    if (svg.current?.hasPointerCapture(event.pointerId)) svg.current.releasePointerCapture(event.pointerId);
    if (!drag.current?.moved) drag.current = null;
  }
  function selectedFill(entry: MapEntry) {
    if (entry.selected) return "var(--live-accent)";
    if (search && matchesLiveSearch(`${entry.name} ${entry.code}`, search)) return "var(--gold)";
    return "var(--live-map-land)";
  }

  return <section className="live-map-panel" aria-labelledby="live-map-title">
    <div className="live-map-heading"><div><span className="live-eyebrow"><Globe2 size={14}/> EXPLORE PELO MAPA</span><h2 id="live-map-title">Escolha a localidade no mapa.</h2><p>Escolha um país, estado ou cidade para acompanhar a votação.</p></div><button className="live-button" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Recolher mapa" : "Abrir mapa"}<ChevronDown size={16} className={expanded ? "is-up" : ""}/></button></div>
    {expanded && <>
      <div className="live-map-toolbar"><nav aria-label="Caminho no mapa"><button type="button" onClick={() => go("world")} aria-current={layer === "world" ? "step" : undefined}><Globe2 size={14}/>Mundo</button>{layer !== "world" && <><ChevronRight size={13}/><button type="button" onClick={() => go(selection.state === "zz" ? "country" : "br")} aria-current={layer === "br" || layer === "country" && !selection.municipality ? "step" : undefined}>{selection.state === "zz" ? countryName : "Brasil"}</button></>}{layer === "state" && <><ChevronRight size={13}/><button type="button" onClick={() => go("state")} aria-current={!selection.municipality ? "step" : undefined}>{stateName}</button></>}{selection.municipality && layer !== "world" && <><ChevronRight size={13}/><span aria-current="step">{selectedExterior?.name || officialCity?.name || "Cidade selecionada"}</span></>}</nav><button className={`live-map-world${layer === "world" ? " is-active" : ""}`} type="button" onClick={() => go(layer === "world" ? "br" : "world")}><Globe2 size={15}/>{layer === "world" ? "Ver Brasil" : "Ver países"}</button></div>
      <div className="live-map-grid">
        <div className="live-map-canvas">
          <div className="live-map-caption"><MapPin size={14}/><span>{caption}</span></div>
          {loading || layer === "state" && !configReady ? <div className="live-map-loading" role="status"><RefreshCw size={22} className="is-spinning"/>Carregando localidades…</div> : failure?.key === resourceKey ? <div className="live-map-loading" role="alert"><p>Não foi possível carregar o mapa. Os filtros de localidade continuam disponíveis.</p><button className="live-button" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></div> : <svg ref={svg} className={`live-map-svg${pan ? " can-pan" : ""}`} viewBox={box.join(" ")} role="group" aria-label={caption} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => {drag.current = null;}}>
            <title>{caption}. Use os botões de zoom para ampliar os municípios menores.</title>
            {(layer === "world" || layer === "country") && <g aria-hidden="true" className="live-map-background">{currentFile?.shapes.map((shape, index) => <path key={`${shape.code}-${index}`} d={shape.d} fillRule="evenodd" vectorEffect="non-scaling-stroke" className={layer === "country" && shape.code === activeCountry ? "is-country" : ""}/>)}</g>}
            {entries.map(entry => {
              const isShape = layer !== "country" && entry.shape;
              const point = entry.point || entry.shape?.point;
              return <g key={entry.code}>
                {!isShape && point && <circle className="live-map-hit-point" cx={point[0]} cy={point[1]} r={pointRadius * 4} fill="transparent" aria-hidden="true" onClick={() => pick(entry)} onPointerEnter={() => setHovered(entry.code)} onPointerLeave={() => setHovered(null)}/> }
                {isShape ? <path d={entry.shape!.d} fill={selectedFill(entry)} fillRule="evenodd" vectorEffect="non-scaling-stroke" className={`live-map-region${entry.selected ? " is-selected" : ""}`} role="button" tabIndex={0} aria-label={`Selecionar ${entry.name}`} aria-pressed={entry.selected} onClick={() => pick(entry)} onKeyDown={event => {if (event.key === "Enter" || event.key === " ") {event.preventDefault(); drag.current = null; pick(entry);}}} onPointerEnter={() => setHovered(entry.code)} onPointerLeave={() => setHovered(null)} onFocus={() => setHovered(entry.code)} onBlur={() => setHovered(null)}><title>{entry.name}{entry.percentage !== undefined ? ` · ${entry.percentage.toLocaleString("pt-BR", {maximumFractionDigits: 2})}% das seções totalizadas` : ""}</title></path> : point && <circle cx={point[0]} cy={point[1]} r={pointRadius} fill={selectedFill(entry)} vectorEffect="non-scaling-stroke" className={`live-map-point${entry.selected ? " is-selected" : ""}`} role="button" tabIndex={0} aria-label={`Selecionar ${entry.name}`} aria-pressed={entry.selected} onClick={() => pick(entry)} onKeyDown={event => {if (event.key === "Enter" || event.key === " ") {event.preventDefault(); drag.current = null; pick(entry);}}} onPointerEnter={() => setHovered(entry.code)} onPointerLeave={() => setHovered(null)} onFocus={() => setHovered(entry.code)} onBlur={() => setHovered(null)}><title>{entry.name}</title></circle>}
                {point && (layer === "br" || entry.selected && layer !== "world" || layer === "country" && (countryCities.length <= 5 || entry.code === hovered)) && <text x={point[0]} y={point[1] + (layer === "country" ? pointRadius * 2.8 : 0)} textAnchor="middle" dominantBaseline="middle" fontSize={labelSize} className="live-map-label" aria-hidden="true">{layer === "br" ? entry.code.toUpperCase() : entry.name}</text>}
              </g>;
            })}
          </svg>}
          <div className="live-map-controls"><button type="button" aria-label="Ampliar mapa" title="Ampliar" onClick={() => zoom(.65)}><Plus size={19}/></button><button type="button" aria-label="Reduzir mapa" title="Reduzir" onClick={() => zoom(1.5)}><Minus size={19}/></button><button type="button" aria-label="Enquadrar todas as localidades" title="Enquadrar" onClick={() => setCamera({key: layerKey, box: layer === "state" ? paddedBox(combinedBounds(currentFile?.shapes || [])) : baseBox})}><Crosshair size={18}/></button><button type="button" aria-label="Mover mapa com o dedo" aria-pressed={pan} title="Mover com o dedo" onClick={() => setPan(!pan)}><Hand size={18}/></button></div>
          <div className="live-map-tooltip" aria-live="polite">{hoverEntry ? <><MapPin size={15}/><div><strong>{hoverEntry.name}</strong><small>{hoverEntry.selected && layer !== "world" ? "Localidade selecionada" : hoverEntry.percentage !== undefined ? `${hoverEntry.percentage.toLocaleString("pt-BR", {maximumFractionDigits: 2})}% das seções totalizadas` : hoverEntry.description || "Clique para ver a votação"}</small></div></> : <><MapPin size={15}/><span>{pan ? "Arraste para mover. Toque na localidade para selecionar." : "Clique ou toque no mapa para escolher."}</span></>}</div>
        </div>
        <div className="live-map-locations"><div className="live-map-list-heading"><h3>{layer === "world" ? "Países e territórios" : layer === "br" ? "Estados" : "Cidades"}</h3><span>{entries.length}</span></div><label className="live-search"><Search size={15}/><input aria-label="Pesquisar localidade no mapa" placeholder={layer === "world" ? "Buscar país…" : layer === "br" ? "Buscar estado…" : "Buscar cidade…"} value={search} onChange={event => {setSearch(event.target.value); setShown(18);}}/></label><div className="live-map-list">{filtered.slice(0, shown).map(entry => <button key={entry.code} type="button" aria-pressed={entry.selected} onClick={() => {drag.current = null; pick(entry);}}><span><strong>{entry.name}</strong>{entry.description && <small>{entry.description}</small>}</span>{entry.selected ? <Check size={16}/> : <ChevronRight size={15}/>}</button>)}{!loading && !filtered.length && <p>Nenhuma localidade encontrada. A pesquisa considera todas as localidades deste mapa.</p>}{filtered.length > shown && <button className="live-map-more" type="button" onClick={() => setShown(value => value + 50)}>Ver mais localidades<ChevronDown size={14}/></button>}</div></div>
      </div>
      <div className="live-map-foot"><p>{layer === "country" && !selection.municipality ? <><strong>{countryName} no mapa.</strong> Selecione uma cidade para filtrar os votos. Até lá, os resultados abaixo abrangem todo o exterior.</> : selection.state === "zz" ? "Exterior: votação de brasileiros para presidente. Os pontos indicam o centro aproximado das cidades." : <>Recorte da apuração: <strong>{officialCity?.name || (selection.state === "br" ? "Brasil e exterior" : stateName)}</strong>{selection.zone ? ` · zona ${Number(selection.zone)}` : ""}. Clique em outra localidade para mudar os resultados.</>}</p><div><a href={currentFile?.source || "https://servicodados.ibge.gov.br/api/docs/malhas?versao=3"} target="_blank" rel="noopener noreferrer">{layer === "world" || layer === "country" ? "Natural Earth" : "Malhas IBGE"}<ExternalLink size={11}/></a>{selection.state === "zz" || layer === "world" ? <a href="https://www.geonames.org/about.html" target="_blank" rel="noopener noreferrer">GeoNames · CC BY<ExternalLink size={11}/></a> : null}<a href={config?.sourceUrl || "https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados"} target="_blank" rel="noopener noreferrer">Localidades TSE<ExternalLink size={11}/></a>{layer === "state" && <button type="button" onClick={() => go("br")}><ArrowLeft size={12}/>Voltar aos estados</button>}</div><button className="live-map-results" type="button" onClick={() => document.querySelector(".live-main-grid, .live-empty--state")?.scrollIntoView({behavior: "smooth", block: "start"})}>Ver apuração<ArrowRight size={15}/></button></div>
    </>}
  </section>;
}

export const ElectionMap = memo(ElectionMapView);
