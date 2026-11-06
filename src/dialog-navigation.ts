// One history entry protects the map while each page handles its own nested Back action.
export function installDialogNavigation() {
  let armed = false;
  let closing = false;
  const hasPage = () => !!document.querySelector('dialog[open]');
  const sync = () => {
    if (closing) return;
    if (hasPage() && !armed) { history.pushState({ ...history.state, eclairePage: true }, ''); armed = true; }
    else if (!hasPage() && armed) { armed = false; closing = true; history.back(); }
  };
  const observer = new MutationObserver(sync);
  observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
  window.addEventListener('popstate', () => {
    if (closing) { closing = false; sync(); return; }
    if (!armed) return;
    armed = false;
    window.dispatchEvent(new Event('eclaire-back', { cancelable: true }));
    sync();
  });
}
