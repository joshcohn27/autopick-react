// e.g. "8/24/2026 5:01PM" -- no leading zeros on month/day/hour, no space
// before AM/PM, to match how you'd casually write it.
export function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const year = d.getFullYear();
  let hours = d.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${month}/${day}/${year} ${hours}:${minutes}${ampm}`;
}
