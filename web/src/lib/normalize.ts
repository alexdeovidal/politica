
export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function isCpfShaped(query: string): boolean {
  return digitsOnly(query).length >= 6 && digitsOnly(query).length === query.replace(/[.\-\s]/g, "").length;
}
export function normalizePublicTimestamp(value:unknown):string|null {
  if(value==null||value==="")return null;
  const raw=String(value).trim();
  const timestamp=/^(?:\d{10}|\d{13})$/.test(raw)?Number(raw)*(raw.length===10?1000:1):Date.parse(raw);
  return Number.isFinite(timestamp)?new Date(timestamp).toISOString():null;
}
