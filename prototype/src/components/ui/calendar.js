// Calendar values are civil dates. Only the "today" shortcut uses local time.
const pad = value => String(value).padStart(2, '0');
const asUTC = day => new Date(day + 'T00:00:00Z');

function dateKey(date) {
  const year = date.getUTCFullYear();
  if (year < 1 || year > 9999 || !Number.isFinite(year)) return '';
  return date.toISOString().slice(0, 10);
}

export function todayKey() {
  const now = new Date();
  return [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join('-');
}

export function readCalendarValue(raw, monthOnly) {
  const text = String(raw ?? '').trim();
  const compact = monthOnly ? /^(\d{4})(\d{2})$/ : /^(\d{4})(\d{2})(\d{2})$/;
  const separated = monthOnly ? /^(\d{4})[-/.](\d{1,2})$/ : /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/;
  const match = text.match(compact) || text.match(separated);
  if (!match) return '';
  const month = match[1] + '-' + pad(match[2]);
  const day = month + '-' + pad(monthOnly ? 1 : match[3]);
  if (dateKey(asUTC(day)) !== day) return '';
  return monthOnly ? month : day;
}

export function startingDay(value) {
  const month = readCalendarValue(value, true);
  return month ? month + '-01' : readCalendarValue(value, false);
}

export function daysInMonth(day) {
  const date = asUTC(day);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return date.getUTCDate();
}

export function moveMonths(day, amount) {
  const date = asUTC(day);
  const previousDay = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() + amount, 1);
  const first = dateKey(date);
  if (!first) return amount < 0 ? '0001-01-01' : '9999-12-31';
  date.setUTCDate(Math.min(previousDay, daysInMonth(first)));
  return dateKey(date);
}

export function moveDays(day, amount) {
  const date = asUTC(day);
  date.setUTCDate(date.getUTCDate() + amount);
  return dateKey(date) || (amount < 0 ? '0001-01-01' : '9999-12-31');
}

export function weekdayIndex(day) {
  return (asUTC(day).getUTCDay() + 6) % 7;
}

export function spokenDate(key) {
  const [year, month, day] = key.split('-');
  return year + '年' + Number(month) + '月' + (day ? Number(day) + '日' : '');
}
