// Compatible avec les WebViews qui ne proposent pas encore AbortSignal.any/timeout.
export function requestDeadline(milliseconds: number, source?: AbortSignal) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(source?.reason);
  const timer = setTimeout(() => { timedOut = true; controller.abort(new DOMException('Délai de requête dépassé.', 'TimeoutError')); }, milliseconds);
  if (source?.aborted) abort(); else source?.addEventListener('abort', abort, { once: true });
  return {
    signal: controller.signal,
    get timedOut() { return timedOut; },
    dispose() { clearTimeout(timer); source?.removeEventListener('abort', abort); },
  };
}
