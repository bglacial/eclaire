import L from 'leaflet';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { GuidanceProgress, guidanceDistance, usableFix, type GpsFix, type NavigationRoute } from './navigation';
import { isPhoneDevice, locationError, preciseLocationPermission } from './location';

const element = (id: string) => document.getElementById(id)!;
const text = (id: string, value: string) => { if (element(id).textContent !== value) element(id).textContent = value; };

export class GpsGuidance {
  private route?: NavigationRoute;
  private progress?: GuidanceProgress;
  private watch?: string;
  private generation = 0;
  private timer = 0;
  private marker?: L.CircleMarker;
  private accuracy?: L.Circle;
  private line?: L.Polyline;
  private fix?: GpsFix;
  private follow = true;
  private voice = false;
  private spoken = new Set<string>();
  private session = false;
  private watching = false;
  private starting = false;
  private lastGoodAt = 0;
  private firstCenter = true;

  get active() { return this.session; }

  constructor(private map: L.Map, private onEnter: () => void, private onExit: () => void, private onRecalculate: (fix: GpsFix) => void) {
    element('navigation-start').addEventListener('click', () => { void this.start(); });
    element('navigation-stop').addEventListener('click', () => this.stop());
    element('navigation-resume').addEventListener('click', () => { void this.start(); });
    element('navigation-follow').addEventListener('click', () => { this.follow = true; this.center(); this.followLabel(); });
    element('navigation-recalculate').addEventListener('click', () => {
      if (this.fix && usableFix(this.fix)) this.onRecalculate(this.fix);
      else this.status('Attendez une position GPS précise avant de recalculer.');
    });
    element('navigation-voice').hidden = !('speechSynthesis' in window);
    element('navigation-voice').addEventListener('click', () => {
      this.voice = !this.voice;
      element('navigation-voice').setAttribute('aria-pressed', String(this.voice));
      text('navigation-voice', this.voice ? 'Voix activée' : 'Activer la voix');
      if (this.voice) this.speak('Guidage vocal activé.'); else window.speechSynthesis?.cancel();
    });
    map.on('dragstart', () => { if (this.session) { this.follow = false; this.followLabel(); } });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.watching) this.pause('Guidage en pause. Reprenez le GPS avec l’application visible.'); });
    window.addEventListener('pagehide', () => this.stop(false));
  }

  setRoute(route: NavigationRoute | null) {
    this.stop(false); this.line?.remove(); this.line = undefined; this.route = route ?? undefined;
    element('navigation-start').hidden = !route || !isPhoneDevice();
    text('navigation-availability', !isPhoneDevice() ? 'Le guidage GPS est réservé aux téléphones.' : route ? 'GPS utilisé pendant le guidage, avec votre autorisation.' : 'Le guidage demande les manœuvres du service France à jour.');
  }

  async start() {
    if (!isPhoneDevice()) { text('navigation-availability', 'Le guidage GPS est réservé aux téléphones.'); return; }
    if (!this.route || this.watching || this.starting || document.hidden) return;
    const generation = ++this.generation;
    this.session = true; this.starting = true; this.follow = true; this.firstCenter = true;
    this.progress ??= new GuidanceProgress(this.route);
    this.onEnter();
    if (!this.line) this.line = L.polyline(this.route.points.map(p => [p.lat, p.lon]), { color: '#a2efdb', weight: 6, opacity: 0.95, interactive: false }).addTo(this.map);
    element('app').classList.add('is-guiding'); element('navigation').hidden = false;
    element('navigation-resume').hidden = true; element('navigation-recalculate').hidden = true;
    text('navigation-instruction', 'Recherche de votre position…'); text('navigation-turn-distance', 'GPS');
    text('navigation-remaining', '—'); text('navigation-time', '—');
    this.status('Autorisez la localisation pour démarrer.'); this.followLabel();
    try {
      if (Capacitor.isNativePlatform()) {
        await preciseLocationPermission(Geolocation);
      }
      if (generation !== this.generation) return;
      if (document.hidden) { this.pause('Guidage en pause. Reprenez le GPS avec l’application visible.'); return; }
      this.starting = false; this.watching = true; this.lastGoodAt = Date.now();
      this.timer = window.setInterval(() => {
        if (Date.now() - this.lastGoodAt > 15_000) this.uncertain('Signal GPS perdu. Les indications sont suspendues.');
        (element('navigation-recalculate') as HTMLButtonElement).disabled = !this.fix || !usableFix(this.fix);
      }, 1000);
      const id = await Geolocation.watchPosition({ enableHighAccuracy: true, maximumAge: 0, timeout: 15_000, interval: 2000, minimumUpdateInterval: 1000 }, (position, error) => {
        if (generation !== this.generation) return;
        if (error) {
          const code = (error as { code?: number | string }).code;
          if (code === 1 || code === 'OS-PLUG-GLOC-0003' || code === 'OS-PLUG-GLOC-0007') this.pause(locationError(error));
          else this.uncertain(locationError(error));
          return;
        }
        if (!position) return;
        this.receive({ lat: position.coords.latitude, lon: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: position.timestamp, speed: position.coords.speed });
      });
      if (generation !== this.generation) await Geolocation.clearWatch({ id }); else this.watch = id;
    } catch (error) {
      if (generation === this.generation) this.pause(locationError(error));
    }
  }

  stop(restore = true) {
    this.release(); this.session = false; this.progress = undefined; this.fix = undefined; this.spoken.clear();
    this.marker?.remove(); this.accuracy?.remove(); this.marker = undefined; this.accuracy = undefined;
    element('app').classList.remove('is-guiding'); element('navigation').hidden = true;
    if (restore) { this.onExit(); element('navigation-start').focus(); }
  }

  private release() {
    ++this.generation; this.watching = false; this.starting = false; clearInterval(this.timer);
    if (this.watch !== undefined) { void Geolocation.clearWatch({ id: this.watch }).catch(() => undefined); this.watch = undefined; }
    window.speechSynthesis?.cancel();
  }

  private pause(message: string) {
    this.release(); this.status(message);
    text('navigation-instruction', 'Guidage en pause'); text('navigation-turn-distance', 'GPS');
    text('navigation-remaining', '—'); text('navigation-time', '—');
    element('navigation-resume').hidden = false; element('navigation-recalculate').hidden = true;
  }

  private uncertain(message: string) {
    text('navigation-instruction', 'En attente d’un signal précis'); text('navigation-turn-distance', 'GPS');
    text('navigation-remaining', '—'); text('navigation-time', '—');
    element('navigation-recalculate').hidden = true;
    this.status(message); window.speechSynthesis?.cancel();
  }

  private receive(fix: GpsFix) {
    if (!usableFix(fix)) { this.uncertain(`Position imprécise ou ancienne. Précision requise : 50 m maximum.`); return; }
    this.fix = fix; this.lastGoodAt = Date.now();
    const point = L.latLng(fix.lat, fix.lon);
    if (!this.marker) this.marker = L.circleMarker(point, { radius: 8, color: '#ffffff', weight: 3, fillColor: '#55d4ed', fillOpacity: 1, pane: 'markerPane', interactive: false }).addTo(this.map);
    else this.marker.setLatLng(point);
    if (!this.accuracy) this.accuracy = L.circle(point, { radius: fix.accuracy, color: '#55d4ed', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(this.map);
    else this.accuracy.setLatLng(point).setRadius(fix.accuracy);
    const state = this.progress!.update(fix);
    if (state.status === 'uncertain') { this.uncertain('Mise à jour GPS en attente.'); return; }
    if (state.status === 'off-route') {
      text('navigation-instruction', 'Vous êtes hors du trajet'); text('navigation-turn-distance', '↗');
      text('navigation-remaining', '—'); text('navigation-time', '—');
      this.status('Recalculez depuis votre position. Ne rejoignez pas la ligne à travers les obstacles.');
      element('navigation-recalculate').hidden = false; (element('navigation-recalculate') as HTMLButtonElement).disabled = false;
      if (this.follow) this.center(); window.speechSynthesis?.cancel(); return;
    }
    element('navigation-recalculate').hidden = true;
    if (state.status === 'arrived') {
      this.release(); text('navigation-instruction', 'Vous êtes arrivé au point routier'); text('navigation-turn-distance', '✓');
      text('navigation-remaining', '0 m'); text('navigation-time', '0 min');
      this.status('Position GPS arrêtée. Vérifiez l’accès final à votre destination.');
      if (this.follow) this.center(); this.speak('Vous êtes arrivé au point routier.'); return;
    }
    text('navigation-instruction', state.next.text); text('navigation-turn-distance', state.toTurn < 20 ? 'Maintenant' : `Dans ${guidanceDistance(state.toTurn)}`);
    text('navigation-remaining', guidanceDistance(state.remaining));
    const minutes = Math.ceil(state.seconds / 60);
    text('navigation-time', minutes < 60 ? `${Math.max(1, minutes)} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`);
    this.status(`GPS actif · précision ± ${Math.round(fix.accuracy)} m · estimation sans trafic.`);
    if (this.follow) this.center();
    if (this.voice) {
      const stage = state.toTurn < 35 ? 'now' : state.toTurn < 200 ? 'near' : 'far';
      const key = `${state.nextIndex}:${stage}`;
      if (!this.spoken.has(key)) { this.spoken.add(key); this.speak(`${state.toTurn < 20 ? 'Maintenant' : `Dans ${guidanceDistance(state.toTurn)}`}, ${state.next.text}`); }
    }
  }

  private center() {
    if (!this.fix) return;
    this.map.invalidateSize({ pan: false, animate: false });
    const zoom = this.firstCenter ? 17 : this.map.getZoom(); this.firstCenter = false;
    const projected = this.map.project([this.fix.lat, this.fix.lon], zoom);
    // Placer le GPS au centre de la portion visible de carte, au-dessus du panneau mobile.
    if (matchMedia('(max-width: 720px)').matches) {
      const freeHeight = element('navigation').getBoundingClientRect().top - this.map.getContainer().getBoundingClientRect().top;
      projected.y += this.map.getSize().y / 2 - Math.max(65, freeHeight / 2);
    }
    this.map.setView(this.map.unproject(projected, zoom), zoom, { animate: false });
  }
  private followLabel() { element('navigation-follow').setAttribute('aria-pressed', String(this.follow)); text('navigation-follow', this.follow ? 'Position suivie' : 'Suivre ma position'); }
  private status(message: string) { text('navigation-status', message); }
  private speak(message: string) {
    if (!this.voice || !('speechSynthesis' in window) || document.hidden) return;
    window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(message); utterance.lang = 'fr-FR'; window.speechSynthesis.speak(utterance);
  }
}
