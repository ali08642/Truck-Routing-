/**
 * Format duration in decimal hours into "X h Y m" string format.
 * Example: 13.78 -> "13 h 47 m"
 */
export function formatDuration(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} m`;
  return `${h} h ${m.toString().padStart(2, '0')} m`;
}

/**
 * Format distance in miles with commas and unit.
 * Example: 714.2 -> "714 mi"
 */
export function formatDistance(miles: number): string {
  return `${Math.round(miles).toLocaleString()} mi`;
}

/**
 * Format numeric integer with comma separators.
 * Example: 40000 -> "40,000"
 */
export function formatNumber(val: number): string {
  return Math.round(val).toLocaleString();
}

/**
 * Format ISO datetime string into human readable local ETA format.
 * Example: "Today 11:30 PM" or "Tue, Nov 10, 8:45 AM"
 */
export function formatLocalEta(isoString: string): string {
  if (!isoString) return '--:--';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;

  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    date.getDate() === tomorrow.getDate() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getFullYear() === tomorrow.getFullYear();

  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (isToday) {
    return `Today at ${timeStr}`;
  }
  if (isTomorrow) {
    return `Tomorrow at ${timeStr}`;
  }

  const dateStr = date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  return `${dateStr}, ${timeStr}`;
}

/**
 * Returns datetime formatted for `<input type="datetime-local">` (YYYY-MM-DDTHH:mm).
 */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Default departure time: the start of the next full hour from now.
 */
export function getDefaultDeparture(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toDatetimeLocalValue(d);
}

/**
 * Minimum departure: now.
 */
export function getMinDeparture(): string {
  return toDatetimeLocalValue(new Date());
}

/**
 * Maximum departure: now + 7 days.
 */
export function getMaxDeparture(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return toDatetimeLocalValue(d);
}

/**
 * Letter badge for route cards (1 -> A, 2 -> B, 3 -> C).
 */
export function getRouteLetter(rank: number): string {
  const letters = ['A', 'B', 'C', 'D', 'E'];
  return letters[rank - 1] || `${rank}`;
}

/**
 * Formats time slider label into "Tue 3 PM, +5 h" in local timezone.
 */
export function formatSliderTime(startTimeIso: string, hoursOffset: number): string {
  if (!startTimeIso) return `+${hoursOffset} h`;
  const baseDate = new Date(startTimeIso);
  if (isNaN(baseDate.getTime())) return `+${hoursOffset} h`;
  const targetDate = new Date(baseDate.getTime() + hoursOffset * 3600 * 1000);

  const weekday = targetDate.toLocaleDateString([], { weekday: 'short' });
  const time = targetDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${weekday} ${time}, +${hoursOffset} h`;
}

