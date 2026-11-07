export function arrivalClock(nowMs: number, remainingSeconds: number): string {
  if (!Number.isFinite(nowMs) || nowMs < 0 || !Number.isFinite(remainingSeconds) || remainingSeconds < 0) return '';
  const now = new Date(nowMs), arrival = new Date(Math.ceil((nowMs + remainingSeconds * 1000) / 60_000) * 60_000);
  if (!Number.isFinite(arrival.getTime())) return '';
  const tomorrow = arrival.getFullYear() !== now.getFullYear() || arrival.getMonth() !== now.getMonth() || arrival.getDate() !== now.getDate();
  return `${tomorrow ? 'demain ' : ''}${arrival.getHours()} h ${String(arrival.getMinutes()).padStart(2, '0')}`;
}
