/* eslint-disable react-hooks/refs -- Ref reads here are confined to effects and DOM event handlers; option callbacks are not executed during rendering. */
"use client";

import {useCallback, useEffect, useId, useRef, useState} from "react";
import {Check, ChevronDown, Search, X} from "lucide-react";
import {matchesLiveSearch} from "@/lib/live-election/model";

export function LocationPicker({label, value, options, onChange, allLabel, disabled = false}: {
  label: string; value: string; options: {code: string; name: string}[];
  onChange: (code: string) => void; allLabel: string; disabled?: boolean;
}) {
  const id = useId(), root = useRef<HTMLDivElement>(null), search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [active, setActive] = useState(0);
  const items = [{code: "", name: allLabel}, ...options].filter(item => matchesLiveSearch(item.name, query));
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  useEffect(() => {if (open) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({block: "nearest"});}, [open, active, id]);
  const choose = useCallback((code: string) => { onChange(code); setOpen(false); setQuery(""); setActive(0); root.current?.querySelector("button")?.focus(); }, [onChange]);
  return <div className="live-picker" ref={root}>
    <span id={`${id}-label`} className="live-field-label">{label}</span>
    <button type="button" className="live-picker__trigger" aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`} disabled={disabled} onClick={() => {setOpen(!open); setQuery(""); setActive(0);}}>
      <span id={`${id}-value`}>{options.find(item => item.code === value)?.name || allLabel}</span><ChevronDown size={16}/>
    </button>
    {open && <div className="live-picker__popup" onKeyDown={event => {
      if (event.key === "Escape") {event.preventDefault(); setOpen(false); root.current?.querySelector("button")?.focus();}
      if (event.key === "ArrowDown") {event.preventDefault(); setActive(index => Math.min(items.length - 1, index + 1));}
      if (event.key === "ArrowUp") {event.preventDefault(); setActive(index => Math.max(0, index - 1));}
      if (event.key === "Enter" && items[active]) {event.preventDefault(); choose(items[active].code);}
    }}>
      <div className="live-picker__search"><Search size={16}/><input ref={search} role="combobox" aria-label={`Pesquisar ${label.toLowerCase()}`} aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={items[active] ? `${id}-option-${active}` : undefined} placeholder="Digite para encontrar..." value={query} onChange={event => {setQuery(event.target.value); setActive(0);}}/>{query && <button type="button" onClick={() => {setQuery(""); setActive(0); search.current?.focus();}} aria-label="Limpar pesquisa"><X size={14}/></button>}</div>
      <div role="listbox" id={`${id}-list`} aria-label={label} className="live-picker__options">
        {items.length ? items.map((item, index) => <button key={item.code} type="button" tabIndex={-1} role="option" id={`${id}-option-${index}`} aria-selected={value === item.code} className={index === active ? "is-focused" : ""} onMouseEnter={() => setActive(index)} onClick={() => choose(item.code)}>{item.name}{value === item.code && <Check size={15}/>}</button>) : <p>Nenhuma localidade encontrada.</p>}
      </div>
    </div>}
  </div>;
}
