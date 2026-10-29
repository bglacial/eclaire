import L from 'leaflet';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { GuidanceProgress, RecentSpeed, routePosition, predictedRouteAt, guidanceDistance, usableFix, type GpsFix, type NavigationRoute } from './navigation';
import { locationError, preciseLocationPermission, selectionPosition } from './location';
import { device, isMobileApp, screenUpdates } from './device';
import { nativeGuidance, guidanceCommands, type NativeGuidanceState } from './native-guidance';

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
  private watch?: PluginListenerHandle;
  private command = guidanceCommands();
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
    element('navigation-voice').hidden = !Capacitor.isNativePlatform();
    element('navigation-voice').addEventListener('click', () => {
      this.voice = !this.voice;
      element('navigation-voice').setAttribute('aria-pressed', String(this.voice));
      text('navigation-voice', this.voice ? 'Voix activée' : 'Activer la voix');
      const enabled = this.voice;
      void this.command(() => nativeGuidance.setVoice({ enabled })).catch(() => this.status('La voix native est indisponible. Réessayez.'));
    });
    map.on('dragstart', () => { if (this.session) { this.follow = false; this.map.stopHeadingUp(); this.followLabel(); } });
    map.on('rotate', () => this.rotateVehicle());
    document.addEventListener('visibilitychange', () => {
      if (!this.watching) return;
      void this.keepScreenOn(!document.hidden).catch(() => undefined);
      if (document.hidden) { cancelAnimationFrame(this.frame); this.frame = 0; this.map.stopHeadingUp(); }
      else {
        const generation = this.generation;
        void nativeGuidance.getState().then(state => { if (generation === this.generation) this.receiveNative(state); }).catch(() => { if (generation === this.generation) this.pause('Vérifiez les autorisations GPS, puis reprenez le guidage.'); });
      }
    });
    window.addEventListener('pagehide', () => { if (!Capacitor.isNativePlatform()) this.stop(false); });
  }

  setRoute(route: NavigationRoute | null) {
    this.stop(false); this.line?.remove(); this.line = undefined; this.route = route ?? undefined;
    element('navigation-start').hidden = !route || !isMobileApp();
    text('navigation-availability', !isMobileApp() ? 'Le guidage GPS est disponible dans l’application mobile.' : route ? 'Le GPS continue en arrière-plan et écran verrouillé jusqu’à l’arrivée ou à Quitter. Activez la voix pour entendre les indications.' : 'Le guidage demande les manœuvres du service France à jour.');
  }

  async start(recalculate = true) {
    if (!isMobileApp()) { text('navigation-availability', 'Le guidage GPS est disponible dans l’application mobile.'); return; }
    if (!this.route || this.watching || this.starting || document.hidden) return;
    const route = this.route;
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
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 30_000, maximumAge: 0 });
      if (generation !== this.generation) return;
      const fix: GpsFix = { ...selectionPosition(position), timestamp: position.timestamp };
      if (!usableFix(fix)) throw { code: 'INACCURATE_POSITION' };
      if (document.hidden) { this.pause('Guidage en pause. Reprenez le GPS avec l’application visible.'); return; }
      const initial = new GuidanceProgress(route).update(fix);
      if (initial.status !== 'on-route' && initial.status !== 'arrived') {
        if (recalculate) { this.stop(false); this.onRecalculate(fix); }
        else this.pause('Votre position reste éloignée du trajet. Rejoignez une route accessible, puis reprenez le GPS.');
        return;
      }
      this.starting = false; this.watching = true; this.lastGoodAt = Date.now();
      this.timer = window.setInterval(() => {
        if (Date.now() - this.lastGoodAt > 15_000) this.uncertain('Signal GPS perdu. Les indications sont suspendues.');
        (element('navigation-recalculate') as HTMLButtonElement).disabled = !this.fix || !usableFix(this.fix);
      }, 1000);
      const watch = await nativeGuidance.addListener('location', state => { if (generation === this.generation && !document.hidden) this.receiveNative(state); });
      if (generation !== this.generation) { await watch.remove(); return; }
      this.watch = watch;
      await this.command(async () => { if (generation === this.generation) await nativeGuidance.start({ route, voice: this.voice }); });
      if (generation === this.generation) await this.keepScreenOn(!document.hidden).catch(() => undefined);
    } catch (error) {
      if (generation === this.generation) this.pause(error instanceof Error && error.message ? error.message : locationError(error));
    }
  }

  stop(restore = true) {
    this.release(); this.session = false; this.progress = undefined; this.fix = undefined; this.speeds = new RecentSpeed(); this.displayAt = undefined;
    this.map.stopHeadingUp(); this.map.setBearing(0);
    this.marker?.remove(); this.accuracy?.remove(); this.approachPoint?.remove(); this.marker = undefined; this.accuracy = undefined; this.approachPoint = undefined;
    element('app').classList.remove('is-guiding'); element('navigation').hidden = true;
    this.map.invalidateSize({ pan: false, animate: false });
    if (restore) { this.onExit(); element('navigation-start').focus(); }
  }

  private release(stopNative = true) {
    ++this.generation; this.watching = false; this.starting = false; clearInterval(this.timer); cancelAnimationFrame(this.frame); this.frame = 0; this.map.stopHeadingUp();
    if (Capacitor.isNativePlatform()) {
      void this.keepScreenOn(false).catch(() => undefined);
      if (stopNative) void this.command(() => nativeGuidance.stop()).catch(() => this.status('Vérifiez que le guidage est arrêté dans les commandes du téléphone.'));
    }
    if (this.watch) { void this.watch.remove().catch(() => undefined); this.watch = undefined; }
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
    this.status(message);
  }

  private receiveNative(state: NativeGuidanceState) {
    if (state.status === 'arrived') { this.arrive(); return; }
    if (!state.active) { this.pause(state.status === 'denied' ? 'Localisation refusée. Autorisez le GPS précis dans les réglages du téléphone.' : 'Guidage arrêté sur le téléphone. Reprenez le GPS pour continuer.'); return; }
    if (state.status === 'uncertain') { this.uncertain('Signal GPS imprécis ou perdu. Les indications sont suspendues.'); return; }
    if (!state.fix || (this.fix && state.fix.timestamp <= this.fix.timestamp)) return;
    if (state.match && usableFix(state.fix)) this.progress!.match = state.match;
    this.receive(state.fix);
  }

  private arrive() {
    this.release(false); this.clearSpeed(); text('navigation-instruction', 'Vous êtes arrivé au point routier'); text('navigation-turn-distance', '0 m');
    text('navigation-remaining', '0 m'); text('navigation-time', '0 min');
    this.status('Position GPS arrêtée. Vérifiez l’accès final à votre destination.');
    if (this.follow) this.center();
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
      return;
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
      if (this.follow) this.center(); return;
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
      this.status('Confirmation de l’arrivée par le GPS du téléphone…'); return;
    }
    text('navigation-instruction', state.next.text); text('navigation-turn-distance', state.toTurn < 20 ? 'Maintenant' : `Dans ${guidanceDistance(state.toTurn)}`);
    text('navigation-remaining', guidanceDistance(state.remaining));
    const minutes = Math.ceil(state.seconds / 60);
    text('navigation-time', minutes < 60 ? `${Math.max(1, minutes)} min` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`);
    this.status(match.distance > 35 ? `Position rapprochée du trajet à ${Math.round(match.distance)} m. Vérifiez comment rejoindre la route.` : `GPS actif · précision ± ${Math.round(fix.accuracy)} m · estimation sans trafic.`, match.distance > 35);
    if (this.follow) this.center();
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
}
