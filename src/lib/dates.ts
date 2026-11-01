const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** yyyy-mm-dd en hora local */
export function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISODate(s: string) {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export const today = () => toISODate(new Date());

export function addDays(iso: string, n: number) {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function addMonths(iso: string, n: number) {
  const d = fromISODate(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISODate(d);
}

export function monthStart(iso: string) {
  return iso.slice(0, 7) + '-01';
}

export function monthEnd(iso: string) {
  const d = fromISODate(monthStart(iso));
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function daysInMonth(iso: string) {
  return Number(monthEnd(iso).slice(8, 10));
}

export function weekStart(iso: string) {
  const d = fromISODate(iso);
  const dow = (d.getDay() + 6) % 7;
  return addDays(iso, -dow);
}

export function daysBetween(a: string, b: string) {
  return Math.round((fromISODate(b).getTime() - fromISODate(a).getTime()) / 86400000);
}

export function monthLabel(iso: string, withYear = true) {
  const d = fromISODate(iso);
  const m = MONTHS[d.getMonth()];
  return (m[0].toUpperCase() + m.slice(1)) + (withYear ? ` ${d.getFullYear()}` : '');
}

export function shortMonth(iso: string) {
  return MONTHS_SHORT[fromISODate(iso).getMonth()];
}

export function prettyDate(iso: string) {
  const t = today();
  if (iso === t) return 'Hoy';
  if (iso === addDays(t, -1)) return 'Ayer';
  if (iso === addDays(t, 1)) return 'Mañana';
  const d = fromISODate(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${WEEKDAYS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${sameYear ? '' : ' ' + d.getFullYear()}`;
}

export function relativeDue(iso: string) {
  const n = daysBetween(today(), iso);
  if (n === 0) return 'Vence hoy';
  if (n === 1) return 'Vence mañana';
  if (n > 1) return `En ${n} días`;
  if (n === -1) return 'Venció ayer';
  return `Vencido hace ${-n} días`;
}

export function timeAgo(isoTs: string) {
  const diff = (Date.now() - new Date(isoTs).getTime()) / 1000;
  if (diff < 60) return 'ahora';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 7) return `hace ${Math.floor(diff / 86400)} d`;
  return prettyDate(isoTs.slice(0, 10));
}
