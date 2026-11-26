export function inputCents(raw:string) {
  const value=raw.trim();
  if(!(/^(?:\d{1,12}|\d{1,3}(?:\.\d{3}){1,3})(?:,\d{1,2})?$/.test(value)||/^\d{1,12}\.\d{1,2}$/.test(value))) return null;
  const normalized=value.includes(",") || /\.\d{3}$/.test(value) ? value.replace(/\./g,"").replace(",",".") : value;
  const cents=Math.round(Number(normalized)*100);
  return Number.isSafeInteger(cents)&&cents>=0?cents:null;
}
export function schoolScenario({tuition, installments, seats, avoidable, extras}:{tuition:number; installments:number; seats:number; avoidable:number; extras:number}) {
  if(![tuition,installments,seats,avoidable,extras].every(Number.isSafeInteger) || tuition<=0 || ![10,11,12].includes(installments) || seats<=0 || avoidable<0 || extras<0) return null;
  const tuitionAnnual=tuition*installments*seats, privateAnnual=tuitionAnnual+extras, balance=avoidable-privateAnnual;
  if(![tuitionAnnual,privateAnnual,balance].every(Number.isSafeInteger)) return null;
  return {tuitionAnnual, privateAnnual, balance};
}
