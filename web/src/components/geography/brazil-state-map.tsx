import map from "../../../public/maps/live-2026/br.json";
import styles from "./brazil-state-map.module.css";

type MapEntry = { href?: string; label: string; ready: boolean };
const small = new Set(["AL", "ES", "PB", "RJ", "RN", "SE"]);
const shapes = [...map.shapes].sort((a, b) => Number(a.code === "df") - Number(b.code === "df"));

export function BrazilStateMap({ entries, selected }: { entries: ReadonlyMap<string, MapEntry>; selected?: string }) {
  return <svg className={styles.brazil} viewBox="-76 -8 44 45" role="group" aria-label="Mapa interativo dos estados do Brasil">
    {shapes.map(shape => {
      const id = shape.code.toUpperCase();
      const item = entries.get(id);
      const active = id === selected;
      const geometry = <><title>{item?.label ?? id}</title><path d={shape.d} fillRule="evenodd" vectorEffect="non-scaling-stroke" />
        {id === "DF" ? <circle cx={shape.point[0]} cy={shape.point[1]} r=".5" vectorEffect="non-scaling-stroke" /> :
          !small.has(id) && <text x={shape.point[0]} y={shape.point[1]} aria-hidden="true">{id}</text>}</>;
      return item?.href ? <a key={id} href={item.href} className={styles.territory} aria-label={item.label}
        aria-current={active ? "true" : undefined} data-active={active || undefined} data-ready={item.ready || undefined}>{geometry}</a> :
        <g key={id} className={styles.territory}>{geometry}</g>;
    })}
  </svg>;
}
