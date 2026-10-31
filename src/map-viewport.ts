// Keep the camera in the visible map when the bottom workspace grows or the phone rotates.
export function mapPadding() {
  const map = document.getElementById('map')!.getBoundingClientRect();
  const rect = (selector: string) => {
    const element = document.querySelector<HTMLElement>(selector);
    const bounds = element?.getBoundingClientRect();
    return bounds && bounds.width && bounds.height ? bounds : undefined;
  };
  const navigation = rect('#navigation');
  const landscape = navigation && matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
  const trip = rect('#trip-workspace');
  const planner = rect('.planner');
  const panel = trip ?? navigation ?? planner;
  const header = rect('.topbar');
  const playback = rect('#playback');
  const top = Math.max(24, (header?.bottom ?? map.top) - map.top + 16, (playback?.bottom ?? map.top) - map.top + 16);
  if (landscape && !trip) {
    const instruction = rect('#navigation-next')!, bottom = rect('.navigation-bottom')!;
    return { topLeft: [instruction.right - map.left + 16, 24] as [number, number], bottomRight: [map.right - bottom.left + 16, 24] as [number, number] };
  }
  return { topLeft: [32, top] as [number, number], bottomRight: [72, Math.max(32, map.bottom - (panel?.top ?? map.bottom) + 20)] as [number, number] };
}
