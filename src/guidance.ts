import L from 'leaflet';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { GuidanceProgress, RecentSpeed, routePosition, predictedRouteAt, guidanceDistance, usableFix, type GpsFix, type NavigationRoute } from './navigation';
import { locationError, preciseLocationPermission } from './location';
import { device, isMobileApp, screenUpdates } from './device';

const element = (id: string) => document.getElementById(id)!;
const text = (id: string, value: string) => {
  const target = element(id);
  if (target.textContent === value) return;
  target.textContent = value;
  if (id === 'navigation-instruction') element('navigation-next').scrollTop = 0;
};

export class GpsGuidance {
  private route?: NavigationRoute;
  private progress?: GuidanceProgress;
  private watch?: string;
  private generation = 0;
  private timer = 0;
  private marker?: L.Marker;
  private accuracy?: L.Circle;
  private approachPoint?: L.CircleMarker;
  private line?: L.Polyline;
  private renderer = L.svg();
  private fix?: GpsFix;
  private follow = true;
  private voice = false;
  private spoken = new Set<string>();
  private session = false;
  private watching = false;
  private starting = false;
  private lastGoodAt = 0;
  private firstCenter = true;
  private speeds = new RecentSpeed();
  private frame = 0;
  private displayAt?: number;
  private animationFrom?: number;
  private animationStarted = 0;
  private lastPaint = 0;
  private lastCenter?: { x: number; y: number };
  private vehicleHeading = 0;
  private keepScreenOn = screenUpdates(enabled => device.setKeepScreenOn({ enabled }));

  get active() { return this.session; }

  constructor(private map: L.Map, private onEnter: () => void, private onExit: () => void, private onRecalculate: (fix: GpsFix) => void) {
    element('navigation-start').addEventListener('click', () => { void this.start(); });
    element('navigation-stop').addEventListener('click', () => this.stop());
    element('navigation-resume').addEventListener('click', () => { void this.start(); });
    element('navigation-follow').addEventListener('click', () => { this.follow = true; this.lastCenter = undefined; this.center(); this.followLabel(); });
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
    map.on('dragstart', () => { if (this.session) { this.follow = false; this.map.stopHeadingUp(); this.followLabel(); } });
    map.on('rotate', () => this.rotateVehicle());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.watching) this.pause('Guidage en pause. Reprenez le GPS avec l’application visible.'); });
    window.addEventListener('pagehide', () => this.stop(false));
  }

  setRoute(route: NavigationRoute | null) {
    this.stop(false); this.line?.remove(); this.line = undefined; this.route = route ?? undefined;
    element('navigation-start').hidden = !route || !isMobileApp();
    text('navigation-availability', !isMobileApp() ? 'Le guidage GPS est disponible dans l’application mobile.' : route ? 'GPS utilisé pendant le guidage, avec votre autorisation.' : 'Le guidage demande les manœuvres du service France à jour.');
  }

  async start() {
    if (!isMobileApp()) { text('navigation-availability', 'Le guidage GPS est disponible dans l’application mobile.'); return; }
    if (!this.route || this.watching || this.starting || document.hidden) return;
    const generation = ++this.generation;
    this.session = true; this.starting = true; this.follow = true; this.firstCenter = true; this.lastCenter = undefined; this.speeds = new RecentSpeed(); this.displayAt = undefined;
    this.progress ??= new GuidanceProgress(this.route);
    this.onEnter();
    if (!this.line) this.line = L.polyline(this.route.points.map(p => [p.lat, p.lon]), { renderer: this.renderer, color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), weight: 6, opacity: 0.95, interactive: false }).addTo(this.map);
    element('app').classList.add('is-guiding'); element('navigation').hidden = false;
    this.map.invalidateSize({ pan: false, animate: false });
    element('navigation-resume').hidden = true; element('navigation-recalculate').hidden = true;
    text('navigation-instruction', 'Recherche de votre position…'); text('navigation-turn-distance', 'GPS');
    text('navigation-remaining', '—'); text('navigation-time', '—'); text('navigation-speed', '—');
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
        this.receive({ lat: position.coords.latitude, lon: position.coords.longitude, accuracy: position.coords.accuracy, timestamp: position.timestamp, speed: position.coords.speed, heading: position.coords.heading });
      });
      if (generation !== this.generation) await Geolocation.clearWatch({ id });
      else {
        this.watch = id;
        if (Capacitor.getPlatform() === 'android') {
          await this.keepScreenOn(true);
        }
      }
    } catch (error) {
      if (generation === this.generation) this.pause(locationError(error));
    }
  }

  stop(restore = true) {
    this.release(); this.session = false; this.progress = undefined; this.fix = undefined; this.spoken.clear(); this.speeds = new RecentSpeed(); this.displayAt = undefined;
    this.map.stopHeadingUp(); this.map.setBearing(0);
    this.marker?.remove(); this.accuracy?.remove(); this.approachPoint?.remove(); this.marker = undefined; this.accuracy = undefined; this.approachPoint = undefined;
    element('app').classList.remove('is-guiding'); element('navigation').hidden = true;
    this.map.invalidateSize({ pan: false, animate: false });
    if (restore) { this.onExit(); element('navigation-start').focus(); }
  }

  private release() {
    ++this.generation; this.watching = false; this.starting = false; clearInterval(this.timer); cancelAnimationFrame(this.frame); this.frame = 0; this.map.stopHeadingUp();
    if (Capacitor.getPlatform() === 'android') void this.keepScreenOn(false).catch(() => undefined);
    if (this.watch !== undefined) { void Geolocation.clearWatch({ id: this.watch }).catch(() => undefined); this.watch = undefined; }
    window.speechSynthesis?.cancel();
  }

  private pause(message: string) {
    this.release(); this.status(message);
    text('navigation-instruction', 'Guidage en pause'); text('navigation-turn-distance', 'GPS');
    text('navigation-remaining', '—'); text('navigation-time', '—'); this.clearSpeed();
    element('navigation-resume').hidden = false; element('navigation-recalculate').hidden = true;
  }

  private uncertain(message: string) {
    cancelAnimationFrame(this.frame); this.frame = 0; this.map.stopHeadingUp(); this.clearSpeed();
    text('navigation-instruction', 'En attente d’un signal précis'); text('navigation-turn-distance', 'GPS');
    text('navigation-remaining', '—'); text('navigation-time', '—');
    element('navigation-recalculate').hidden = true;
    this.status(message); window.speechSynthesis?.cancel();
  }

  private receive(fix: GpsFix) {
    if (!usableFix(fix)) { this.uncertain(`Position imprécise ou ancienne. Précision requise : 50 m maximum.`); return; }
    const state = this.progress!.update(fix);
    if (state.status === 'uncertain') { this.uncertain('Mise à jour GPS en attente.'); return; }
    this.fix = fix; this.lastGoodAt = Date.now(); this.speeds.add(fix);
    text('navigation-speed', fix.speed != null && Number.isFinite(fix.speed) && fix.speed >= 0 && fix.speed <= 100 ? String(Math.round(fix.speed * 3.6)) : '—');
    const point = L.latLng(fix.lat, fix.lon);
    if (!this.marker) this.marker = L.marker(point, { icon: L.divIcon({ className: 'vehicle-marker', iconSize: [40, 50], iconAnchor: [20, 25], html: '<svg class="vehicle-image" viewBox="0 0 40 50" aria-hidden="true"><path d="M20 2 L26 11 L30 13 L33 25 L32 43 Q32 47 28 48 H12 Q8 47 8 43 L7 25 L10 13 L14 11 Z" fill="#196d83" stroke="white" stroke-width="2.5"/><path d="M12 19 L14 13 H26 L28 19 Z M12 34 H28 L27 40 H13 Z" fill="#c6edf3"/><path d="M12 23 H28 V31 H12 Z" fill="#2589a0"/></svg>' }), interactive: false, keyboard: false }).addTo(this.map);
    if (!this.accuracy) this.accuracy = L.circle(point, { renderer: this.renderer, radius: fix.accuracy, color: 'oklch(0.57 0.11 210)', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(this.map);
    else this.accuracy.setLatLng(point).setRadius(fix.accuracy);
    if (state.status === 'approach') {
      cancelAnimationFrame(this.frame); this.frame = 0; this.displayAt = undefined; this.marker.setLatLng(point);
      const nearest = routePosition(this.route!, state.match.at), target = L.latLng(nearest.lat, nearest.lon);
      if (!this.approachPoint) this.approachPoint = L.circleMarker(target, { renderer: this.renderer, radius: 7, color: 'white', weight: 3, fillColor: '#3437c4', fillOpacity: 1, interactive: false }).addTo(this.map);
      else this.approachPoint.setLatLng(target);
      text('navigation-instruction', 'Rejoignez le point routier'); text('navigation-turn-distance', `À ${guidanceDistance(state.match.distance)}`);
      text('navigation-remaining', '—'); text('navigation-time', '—'); text('navigation-limit', 'Limite : —'); element('navigation-speed').classList.remove('over-limit');
      element('navigation-recalculate').hidden = true;
      this.status('Point routier le plus proche du trajet. Rejoignez-le par une voie accessible.');
      this.followGpsHeading(fix);
      if (this.follow) {
        this.map.invalidateSize({ pan: false, animate: false });
        const landscape = matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
        const mobile = matchMedia('(max-width: 720px)').matches && !landscape;
        const bounds = this.map.getContainer().getBoundingClientRect();
        const left = landscape ? element('navigation-next').getBoundingClientRect().right - bounds.left : 40;
        const right = landscape ? bounds.right - document.querySelector('.navigation-bottom')!.getBoundingClientRect().left : 40;
        const top = mobile ? element('navigation-next').getBoundingClientRect().bottom - bounds.top : 40;
        const bottom = mobile ? bounds.bottom - document.querySelector('.navigation-bottom')!.getBoundingClientRect().top : 40;
        this.map.fitBounds(L.latLngBounds([point, target]), { paddingTopLeft: [Math.max(40, left + 20), Math.max(40, top + 20)], paddingBottomRight: [Math.max(40, right + 20), Math.max(40, bottom + 20)], maxZoom: 17, animate: false });
        this.firstCenter = true; this.lastCenter = undefined;
      }
      window.speechSynthesis?.cancel(); return;
    }
    this.approachPoint?.remove(); this.approachPoint = undefined;
    if (state.status === 'off-route') {
      cancelAnimationFrame(this.frame); this.frame = 0; this.displayAt = undefined; this.marker.setLatLng(point);
      text('navigation-limit', 'Limite : —'); element('navigation-speed').classList.remove('over-limit');
      text('navigation-instruction', 'Vous êtes hors du trajet'); text('navigation-turn-distance', '↗');
      text('navigation-remaining', '—'); text('navigation-time', '—');
      this.status('Recalculez depuis votre position. Ne rejoignez pas la ligne à travers les obstacles.');
      this.followGpsHeading(fix);
      element('navigation-recalculate').hidden = false; (element('navigation-recalculate') as HTMLButtonElement).disabled = false;
      if (this.follow) this.center(); window.speechSynthesis?.cancel(); return;
    }
    element('navigation-recalculate').hidden = true;
    const match = this.progress!.match!;
    const limit = match.distance <= Math.max(20, fix.accuracy) ? routePosition(this.route!, match.at).speedLimit : undefined;
    const overLimit = limit !== undefined && fix.speed != null && Number.isFinite(fix.speed) && fix.speed >= 0 && fix.speed <= 100 && fix.speed * 3.6 > limit;
    text('navigation-limit', limit ? `Limite OSM : ${Math.round(limit)}${overLimit ? ' · dépassée' : ''}` : 'Limite : —');
    element('navigation-speed').classList.toggle('over-limit', overLimit);
    this.animationFrom = this.displayAt ?? match.at; this.animationStarted = performance.now();
    if (this.frame) cancelAnimationFrame(this.frame);
    this.animatePosition();
    if (state.status === 'arrived') {
      this.release(); this.clearSpeed(); text('navigation-instruction', 'Vous êtes arrivé au point routier'); text('navigation-turn-distance', '0 m');
      text('navigation-remaining', '0 m'); text('navigation-time', '0 min');
      this.status('Position GPS arrêtée. Vérifiez l’accès final à votre destination.');
      if (this.follow) this.center(); this.speak('Vous êtes arrivé au point routier.'); return;
    }
    text('navigation-instruction', state.next.text); text('navigation-turn-distance', state.toTurn < 20 ? 'Maintenant' : `Dans ${guidanceDistance(state.toTurn)}`);
    text('navigation-remaining', guidanceDistance(state.remaining));
    const minutes = Math.ceil(state.seconds / 60);
    text('navigation-time', minutes < 60 ? `${Math.max(1, minutes)} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`);
    this.status(match.distance > 35 ? `Position rapprochée du trajet à ${Math.round(match.distance)} m. Vérifiez comment rejoindre la route.` : `GPS actif · précision ± ${Math.round(fix.accuracy)} m · estimation sans trafic.`, match.distance > 35);
    if (this.follow) this.center();
    if (this.voice) {
      const stage = state.toTurn < 35 ? 'now' : state.toTurn < 200 ? 'near' : 'far';
      const key = `${state.nextIndex}:${stage}`;
      if (!this.spoken.has(key)) { this.spoken.add(key); this.speak(`${state.toTurn < 20 ? 'Maintenant' : `Dans ${guidanceDistance(state.toTurn)}`}, ${state.next.text}`); }
    }
  }

  private animatePosition = () => {
    if (!this.fix || !this.route || !this.progress?.match || !this.watching) return;
    const now = performance.now();
    if (now - this.lastPaint >= 33) {
      this.lastPaint = now;
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const target = predictedRouteAt(this.route.length, this.progress.match.at, this.fix, this.speeds.mean(), Date.now(), reduced);
      const blend = reduced ? 1 : Math.min(1, (now - this.animationStarted) / 500);
      this.displayAt = (this.animationFrom ?? target) + (target - (this.animationFrom ?? target)) * blend;
      const position = routePosition(this.route, this.displayAt);
      this.marker?.setLatLng([position.lat, position.lon]);
      const heading = this.fix.speed != null && this.fix.speed >= 1 && this.fix.heading != null && Number.isFinite(this.fix.heading) && this.fix.heading >= 0 && this.fix.heading < 360 ? this.fix.heading : position.heading;
      this.vehicleHeading = heading;
      if (this.follow) this.map.setHeading(heading, { ease: reduced ? 1 : 0.2 });
      this.rotateVehicle();
      if (this.follow) this.center(L.latLng(position.lat, position.lon));
    }
    this.frame = requestAnimationFrame(this.animatePosition);
  };

  private center(position = this.marker?.getLatLng()) {
    if (!position) return;
    if (this.firstCenter) this.map.invalidateSize({ pan: false, animate: false });
    const zoom = this.firstCenter ? 17 : this.map.getZoom(); this.firstCenter = false;
    const projected = this.map.project(position, zoom);
    // Garder davantage de route visible devant le véhicule entre les deux panneaux.
    if (matchMedia('(max-width: 720px)').matches && !matchMedia('(orientation: landscape) and (max-height: 500px)').matches) {
      const bounds = this.map.getContainer().getBoundingClientRect();
      const top = element('navigation-next').getBoundingClientRect().bottom - bounds.top;
      const bottom = document.querySelector('.navigation-bottom')!.getBoundingClientRect().top - bounds.top;
      const targetY = top + Math.max(0, bottom - top) * 0.68;
      const offset = this.map.getSize().y / 2 - targetY, radians = this.map.getBearing() * Math.PI / 180;
      projected.x += Math.sin(radians) * offset; projected.y += Math.cos(radians) * offset;
    }
    if (this.lastCenter && Math.hypot(projected.x - this.lastCenter.x, projected.y - this.lastCenter.y) < 0.5) return;
    this.lastCenter = { x: projected.x, y: projected.y };
    this.map.setView(this.map.unproject(projected, zoom), zoom, { animate: false });
  }
  private followLabel() { element('navigation-follow').setAttribute('aria-pressed', String(this.follow)); text('navigation-follow', this.follow ? 'Position suivie' : 'Suivre ma position'); }
  private rotateVehicle() {
    const image = this.marker?.getElement()?.querySelector<HTMLElement>('.vehicle-image');
    if (image) image.style.transform = `rotate(${this.vehicleHeading + this.map.getBearing()}deg)`;
  }
  private followGpsHeading(fix: GpsFix) {
    if (fix.speed == null || fix.speed < 1 || !Number.isFinite(fix.speed) || fix.speed > 100 || fix.heading == null || !Number.isFinite(fix.heading) || fix.heading < 0 || fix.heading >= 360) return;
    this.vehicleHeading = fix.heading; this.rotateVehicle();
    if (this.follow) this.map.setHeading(fix.heading, { ease: matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 0.2 });
  }
  private clearSpeed() { text('navigation-speed', '—'); text('navigation-limit', 'Limite : —'); element('navigation-speed').classList.remove('over-limit'); }
  private status(message: string, visible = true) { text('navigation-status', message); element('navigation-status').hidden = !visible; }
  private speak(message: string) {
    if (!this.voice || !('speechSynthesis' in window) || document.hidden) return;
    window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(message); utterance.lang = 'fr-FR'; window.speechSynthesis.speak(utterance);
  }
}
