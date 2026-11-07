import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { device } from './device';
import { readSettings, readRoadPreferences, type Theme } from './settings';
import { deployedVersion, lastUpdateCheck, updateCheckDate } from './updates';
import type { Criterion } from './types';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function installSettings(hasResult: () => boolean, hasDestination: () => boolean, stop: (clear?: boolean, preserveRoute?: boolean) => void, notice: (message: string) => void, updateLaunch: () => void, showAbout: (show: boolean) => void) {
{
  let avoided = { avoidMotorways: false, avoidTolls: false };
  try { avoided = readRoadPreferences(localStorage); } catch { /* Storage can be unavailable. */ }
  for (const [id, key] of [['avoid-motorways', 'avoidMotorways'], ['avoid-tolls', 'avoidTolls']] as const) {
    const input = $<HTMLInputElement>(`settings-${id}`);
    input.checked = avoided[key];
    const current = $<HTMLInputElement>(`trip-${id}`); current.checked = avoided[key];
    current.addEventListener('change', () => { stop(true, hasResult()); notice('Options du trajet modifiées. Recalculez pour les appliquer.'); });
    input.addEventListener('change', () => {
      try { localStorage.setItem(`eclaire.${key}`, String(input.checked)); }
      catch { notice('Impossible de mémoriser cette préférence pour les prochains trajets.'); }
      if (!hasDestination()) { current.checked = input.checked; updateLaunch(); }
    });
  }
}
{
  $('settings-open').hidden = false;
  let saved = { theme: 'auto' as Theme, criterion: 'time' as Criterion };
  try { saved = readSettings(localStorage); } catch { /* Storage can be unavailable. */ }
  const theme = $<HTMLSelectElement>('settings-theme'), preferred = $<HTMLSelectElement>('settings-criterion');
  theme.value = saved.theme; preferred.value = saved.criterion;
  document.querySelector<HTMLInputElement>(`input[name="criterion"][value="${saved.criterion}"]`)!.checked = true;
  const systemTheme = matchMedia('(prefers-color-scheme: dark)');
  const applyTheme = () => {
    const dark = theme.value === 'dark' || (theme.value === 'auto' && systemTheme.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    if (Capacitor.isNativePlatform()) void SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => undefined);
  };
  const save = (key: string, value: string) => {
    try { localStorage.setItem(key, value); $('settings-error').hidden = true; }
    catch { $('settings-error').textContent = 'Impossible d’enregistrer les paramètres sur cet appareil.'; $('settings-error').hidden = false; }
  };
  const vehicle = $<HTMLSelectElement>('settings-vehicle');
  try { vehicle.value = localStorage.getItem('eclaire.vehicle') === 'electric' ? 'electric' : 'thermal'; } catch { vehicle.value = 'thermal'; }
  vehicle.addEventListener('change', () => {
    save('eclaire.vehicle', vehicle.value);
    window.dispatchEvent(new Event('eclaire-vehicle-change'));
  });
  applyTheme(); systemTheme.addEventListener('change', applyTheme);
  theme.addEventListener('change', () => { save('eclaire.theme', theme.value); applyTheme(); });
  preferred.addEventListener('change', () => {
    save('eclaire.criterion', preferred.value);
    const radio = document.querySelector<HTMLInputElement>(`input[name="criterion"][value="${preferred.value}"]`)!;
    if (!hasDestination() && !radio.checked) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  const android = Capacitor.getPlatform() === 'android';
  if (android) {
    const automatic = $<HTMLInputElement>('settings-pip-automatic');
    void device.getPipSettings().then(settings => { automatic.checked = settings.automatic; $('settings-pip').hidden = !settings.supported; }).catch(() => undefined);
    automatic.addEventListener('change', async () => {
      automatic.disabled = true;
      try { await device.setPipAutomatic({ enabled: automatic.checked }); $('settings-error').hidden = true; }
      catch { automatic.checked = !automatic.checked; $('settings-error').textContent = 'Impossible d’enregistrer ce réglage sur cet appareil.'; $('settings-error').hidden = false; }
      finally { automatic.disabled = false; }
    });
  }
  const updateDate = (value: unknown) => {
    const timestamp = lastUpdateCheck(value), date = $<HTMLTimeElement>('updates-last-check');
    date.textContent = updateCheckDate(timestamp);
    date.dateTime = timestamp ? new Date(timestamp).toISOString() : '';
  };
  try { updateDate(localStorage.getItem('eclaire.updateAttempt')); } catch { updateDate(0); }
  const settingsPage = $<HTMLDialogElement>('settings-page');
  $('settings-open').addEventListener('click', () => {
    settingsPage.hidden = false; settingsPage.showModal(); settingsPage.scrollTop = 0;
    $('settings-open').setAttribute('aria-expanded', 'true'); $('settings-close').focus();
    if (android) void device.getUpdateStatus().then(state => {
      updateDate(state.lastCheckedAt);
      if (state.status === 'store') {
        $('updates-check').textContent = 'Ouvrir Google Play';
        $('updates-history').hidden = true;
        $('updates-status').textContent = 'Les mises à jour sont distribuées par Google Play.';
      }
    }).catch(() => { $('updates-status').textContent = 'La date de la dernière recherche est indisponible.'; });
  });
  const closeSettings = () => {
    settingsPage.close(); settingsPage.hidden = true;
    $('settings-open').setAttribute('aria-expanded', 'false'); $('settings-open').focus();
  };
  $('settings-close').addEventListener('click', closeSettings);
  window.addEventListener('eclaire-back', event => {
    if ($<HTMLDialogElement>('about').open) { event.preventDefault(); showAbout(false); return; }
    if (!$('settings-page').hidden) { event.preventDefault(); closeSettings(); }
  });
  settingsPage.addEventListener('cancel', event => { event.preventDefault(); closeSettings(); });
  $('updates-reload').addEventListener('click', () => location.reload());
  $('updates-check').addEventListener('click', async () => {
    const button = $<HTMLButtonElement>('updates-check');
    button.disabled = true; button.setAttribute('aria-busy', 'true');
    $('updates-status').textContent = 'Recherche en cours…'; $('updates-reload').hidden = true;
    try {
      if (android) {
        const state = await device.checkForUpdates(); updateDate(state.lastCheckedAt);
        const messages = {
          store: 'Les mises à jour sont distribuées par Google Play.',
          available: 'Une mise à jour est disponible. Confirmez son installation dans la fenêtre Android.',
          current: 'Cette version est à jour.',
          checking: 'Une recherche est déjà en cours. Réessayez dans un instant.',
          error: 'Recherche impossible. Vérifiez votre connexion puis réessayez.',
        };
        $('updates-status').textContent = messages[state.status ?? 'error'];
      } else {
        const timestamp = Date.now(); updateDate(timestamp);
        try { localStorage.setItem('eclaire.updateAttempt', String(timestamp)); } catch { /* The date remains visible for this session. */ }
        const version = await deployedVersion();
        $('updates-status').textContent = version === __APP_VERSION__ ? 'Cette version est à jour.' : Capacitor.isNativePlatform() ? `Le site utilise la version ${version}. Les mises à jour iOS nécessitent une nouvelle installation de l’application.` : `La version ${version} est disponible.`;
        $('updates-reload').hidden = version === __APP_VERSION__ || Capacitor.isNativePlatform();
      }
    } catch { $('updates-status').textContent = 'Recherche impossible. Vérifiez votre connexion puis réessayez.'; }
    finally { button.disabled = false; button.setAttribute('aria-busy', 'false'); }
  });
}
}
