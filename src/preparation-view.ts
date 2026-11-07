import { icon } from './icons';

export function preparationView(mobileApp: boolean) {
  return `
  <a class="skip-link" href="#destination-open">Préparer un trajet</a>
  <header class="topbar">
    <a class="brand" href="./" aria-label="Éclaire, accueil" translate="no">éclaire<img class="brand-symbol" src="/logo.svg" width="36" height="36" alt="" /></a>
    <span class="tagline">Deux points. Un chemin qui s’éclaire.</span>
    <div class="header-right">\
<span class="edition">France <span>métropolitaine & Corse</span>\
</span>\
<button class="help-button" id="settings-open" aria-label="Paramètres" aria-haspopup="dialog" aria-expanded="false" aria-controls="settings-page" hidden>${icon('settings')}<span>Paramètres</span>\
</button>\
<button class="help-button" id="help" aria-label="Informations" aria-haspopup="dialog" aria-expanded="false" aria-controls="about">${icon('info')}<span>Infos</span>\
</button>\
</div>
  </header>
  <main>
    <div id="map" aria-label="Carte interactive de France. Utilisez les boutons Choisir sur la carte, puis touchez une route." role="region"></div>
    <section class="planner" aria-labelledby="planner-title">
      <button id="route-panel-toggle" class="setting-button" aria-expanded="true" aria-controls="planner-content" hidden>Réduire le panneau trajet</button>
      <div id="planner-content">
      <div class="planner-intro"><h1 id="planner-title">Où va-t-on ?</h1></div>
      <div class="exploring-heading"><h2>La route prend vie.</h2><p>Recherche du meilleur itinéraire…</p></div>
      <details id="route-editor" open><summary role="button" aria-expanded="true">${icon('edit')}<span>Modifier la destination</span></summary><div class="route-form">
        <input id="start" type="hidden" ${mobileApp ? 'disabled' : ''} /><input id="via" type="hidden" /><input id="end" type="hidden" />
        <div class="location-fields">
          <button id="start-open" class="place-row" ${mobileApp ? 'hidden' : ''}>${icon('locate')}<span><small>Départ</small><strong id="start-label">Ma position</strong></span>${icon('arrow')}</button>
          <button id="destination-open" class="destination-search">${icon('search')}<span><strong id="destination-label">Destination</strong><small>Adresse ou nom d’un lieu</small></span>${icon('arrow')}</button>
        </div>
        <div id="home-shortcuts" class="home-shortcuts">\
<button id="shortcut-home">${icon('home')}<strong>Domicile</strong>\
<small>Définir</small>\
</button>\
<button id="shortcut-work">${icon('work')}<strong>Travail</strong>\
<small>Définir</small>\
</button>\
<button id="open-saved-places">${icon('bookmark')}<strong>Mes lieux</strong>\
</button>\
</div>
        <div id="home-recent-section" hidden><h2>Récents</h2><div id="home-recent"></div></div>
        <div id="prepare-trip" hidden><p id="prepared-stops" class="page-hint">Directement vers l’arrivée.</p><button id="prepare-stops" class="outline-button">${icon('plus')}<span>Ajouter une étape</span></button>
          <details class="planner-options">\
<summary>Options du trajet</summary>\
<div class="options-content">\
<fieldset class="criteria">\
<legend>Critère du trajet</legend>\
<label>\
<input type="radio" name="criterion" value="time" checked>\
<span>${icon('time')} Le plus rapide</span>\
</label>\
<label>\
<input type="radio" name="criterion" value="distance">\
<span>${icon('route')} Le plus court</span>\
</label>\
</fieldset>\
<fieldset class="trip-avoidances">\
<legend>Pour ce trajet</legend>\
<label>\
<input id="trip-avoid-motorways" type="checkbox" /> Éviter les autoroutes</label>\
<label>\
<input id="trip-avoid-tolls" type="checkbox" /> Éviter les péages</label>\
</fieldset>\
<div class="location-actions" ${mobileApp ? 'hidden' : ''}>\
<button id="geolocate" class="location-button">${icon('locate')} Ma position</button>\
<button id="swap" class="swap-button" disabled>${icon('swap')} Permuter</button>\
</div>\
</div>\
</details>
        </div>
        <div class="launch-row">\
<button id="launch" class="primary" disabled>${icon('bolt')}<span>Calculer le trajet</span>${icon('arrow')}</button>\
<button id="reset" class="icon-button reset-button" aria-label="Effacer le trajet et utiliser ma position" title="Nouveau trajet">${icon('reset')}</button>\
</div>
      </div></details>
      <div id="notice" class="notice" role="status" aria-live="polite" hidden></div>
      <button id="gps-retry" class="setting-button" hidden>Réessayer le GPS</button>
      <div id="route-result" class="route-result" hidden>\
<div class="result-heading">\
<span>${icon('check')} Mon trajet</span>\
<span id="result-criterion">\
</span>\
</div>\
<h2 id="result-title">\
</h2>\
<div class="metrics">\
<div aria-label="Durée estimée">\
<strong id="duration">\
</strong>\
</div>\
<div aria-label="Distance">\
<strong id="distance">\
</strong>\
</div>\
</div>\
<p class="estimate-caption">Durée estimée, sans trafic<br><span id="result-arrival"></span></p>\
<p id="result-preferences" class="page-hint" hidden>\
</p>\
<div class="result-itinerary">\
<div id="route-endpoints" class="route-endpoints">\
</div>\
</div>\
<p id="result-explanation" hidden>\
</p>\
<button id="compare-routes" class="text-button">Comparer les trajets</button>\
<p id="comparison-status" role="status">\
</p>\
<button id="choose-alternative" class="outline-button" hidden>\
</button>\
<details class="exploration-options">\
<summary>Voir l’exploration et les options</summary>\
<button id="replay" class="text-button">Revoir l’exploration</button>\
<button id="result-options" class="text-button">Options du trajet</button>\
<button id="new-trip" class="text-button">Nouveau trajet</button>\
</details>\
<button id="navigation-start" class="primary" hidden>${icon('locate')}<span>Démarrer le guidage</span>\
</button>\
<p id="navigation-availability" hidden>\
</p>\
</div>
      <div class="planner-footer"><span id="departure-status">${icon('locate')} Départ : recherche de ma position…</span><span id="coverage" hidden>Connexion au service France…</span></div>
      </div>
    </section>
    <div class="map-tools">\
<button id="france" class="icon-button france-button" aria-label="Voir toute la France" title="Voir toute la France">FR</button>\
<button id="fit" class="icon-button" aria-label="Recentrer sur les deux points" title="Recentrer">${icon('expand')}</button>\
<div class="zoom-controls">\
<button id="zoom-in" class="icon-button" aria-label="Zoom avant">${icon('plus')}</button>\
<button id="zoom-out" class="icon-button" aria-label="Zoom arrière">${icon('minus')}</button>\
</div>\
</div>
    <div id="pick-hint" class="pick-hint" role="status" hidden><span></span><button id="cancel-pick" class="icon-button" aria-label="Annuler la sélection">${icon('close')}</button></div>
    <section id="playback" class="playback" aria-label="État de l’exploration" hidden>\
<span class="activity-dot" aria-hidden="true">\
</span>\
<div>\
<strong id="playback-title" role="status">Calcul du trajet…</strong>\
<span id="playback-count">Préparation du calcul…</span>\
</div>\
<span id="playback-percent">\
</span>\
<div class="playback-track" aria-hidden="true">\
<span id="playback-progress">\
</span>\
</div>\
</section>
    <section id="navigation" class="navigation" aria-label="Guidage GPS" hidden>
      <div id="navigation-next" tabindex="0" aria-label="Prochaine instruction"><strong id="navigation-turn-distance">GPS</strong><h2 id="navigation-instruction" role="status" aria-live="polite" aria-atomic="true">Recherche de votre position…</h2></div>
      <div class="navigation-bottom">
        <p id="navigation-next-stop" class="navigation-next-stop"></p><p id="navigation-status" role="status"></p>
        <p id="navigation-offline" role="status" hidden>Connexion absente : trajet conservé, recalcul et nouvelles cartes indisponibles.</p>
        <button id="navigation-resume" class="primary" hidden>Reprendre le GPS</button>
        <div class="navigation-metrics">\
<div>\
<strong id="navigation-time">—</strong>\
<span>durée estimée</span><span id="navigation-arrival"></span>\
</div>\
<div>\
<strong id="navigation-remaining">—</strong>\
<span>restants</span>\
</div>\
<div>\
<strong id="navigation-speed">—</strong>\
<span>km/h · GPS</span>\
<span id="navigation-limit">Limite : —</span>\
</div>\
</div>
        <div class="navigation-actions">\
<button id="navigation-follow">${icon('locate')}<span>Recentrer</span>\
</button>\
<button id="navigation-voice" class="icon-button" aria-label="Activer la voix" title="Activer la voix" aria-pressed="false">${icon('voice')}<span>Voix</span>\
</button>\
<button id="navigation-stop" class="icon-button" aria-label="Quitter le guidage" title="Quitter le guidage">${icon('close')}<span>Terminer</span>\
</button>\
</div>
        <div class="navigation-attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener">ODbL</a></div>
      </div>
    </section>
    <dialog id="navigation-exit" class="confirm-dialog" aria-labelledby="navigation-exit-title">\
<h2 id="navigation-exit-title">Terminer le guidage ?</h2>\
<p>Vous pourrez le reprendre depuis le résumé du trajet.</p>\
<button id="navigation-exit-cancel" class="primary">Continuer le guidage</button>\
<button id="navigation-exit-confirm" class="text-button danger-text">Terminer le guidage</button>\
</dialog>
    <div class="map-legend"><span><i class="cyan"></i>Départ A</span><span><i class="amber"></i>Arrivée B</span><span><i class="final"></i>Trajet</span></div>
    <dialog id="about" class="about" aria-labelledby="about-title">
      <header class="about-header"><button id="close-about" class="setting-button" aria-label="Retour à la carte">${icon('back')}<span>Carte</span></button><h2 id="about-title">Informations</h2></header>
      <div class="about-content">
        <p>${mobileApp ? 'Votre départ est votre position GPS. Choisissez une arrivée, puis touchez « Calculer le trajet ».' : 'Choisissez un départ et une arrivée, puis touchez « Calculer le trajet ».'}</p>
        <dl><div><dt>Le plus rapide</dt><dd>Réduit la durée estimée, sans trafic en direct.</dd></div><div><dt>Le plus court</dt><dd>Réduit la distance à parcourir.</dd></div></dl>
        <h3>Pourquoi cette animation ?</h3><p>Elle montre les routes comparées avant d’afficher votre trajet.</p>
        <button id="lite" class="setting-button" aria-pressed="false">${icon('layers')} Alléger l’animation</button>
        <p>L’heure d’arrivée est estimée sans trafic ; avant le départ, elle suppose un départ immédiat. Pendant le guidage, elle évolue avec le trajet restant.</p>
        <h3>Le guidage</h3><p>Dans l’application sur téléphone, le GPS vous guide, même écran verrouillé. Il s’arrête à l’arrivée ou avec la croix.</p><p>Respectez la signalisation. Les trajets et les limitations affichées peuvent contenir des erreurs.</p>
        <details>\
<summary>Carte et connexion</summary>\
<p>Éclaire couvre la France métropolitaine et la Corse. Une connexion est nécessaire pour calculer un trajet et charger les cartes.</p>\
<p>Les cartes et les routes viennent d’OpenStreetMap. Si votre adresse n’est pas accessible en voiture, le trajet peut s’arrêter à proximité.</p>\
</details>
        <details>\
<summary>Vos données</summary>\
<p>Le GPS reste sur votre téléphone pendant le suivi. Le calcul d’un trajet envoie les points nécessaires au service de calcul.</p>\
<p>Les services de recherche reçoivent le texte saisi et les zones recherchées. Le fournisseur de cartes reçoit les zones affichées.</p>\
<p>L’application ne garde pas d’historique GPS. Vos destinations enregistrées restent sur cet appareil.</p>\
</details>
      </div>
    </dialog>
    <div id="loading" class="loading" role="status"><img class="loading-logo" src="/logo.svg" width="64" height="64" alt="" /><strong>Chargement de la carte</strong><p>Chargement des données OpenStreetMap…</p><button id="retry" class="primary" hidden>Réessayer</button></div>
  </main>
  <dialog id="settings-page" class="settings-page" aria-labelledby="settings-title" hidden>
    <header class="settings-header"><button id="settings-close" class="setting-button settings-back" aria-label="Retour à la carte">${icon('back')}<span>Carte</span></button><h2 id="settings-title">Paramètres</h2></header>
    <div class="settings-content">
      <p class="settings-intro">Vos préférences sont enregistrées sur cet appareil.</p><button id="settings-saved-places" class="setting-button">${icon('bookmark')} Mes lieux</button>
      <section class="settings-group" aria-labelledby="settings-display-title"><h3 id="settings-display-title">Affichage</h3>
        <label for="settings-theme">Thème</label>\
<p id="settings-theme-hint">Automatique suit l’apparence de votre appareil.</p>\
<select id="settings-theme" aria-describedby="settings-theme-hint">\
<option value="auto">Automatique</option>\
<option value="light">Clair</option>\
<option value="dark">Sombre</option>\
</select>
      </section>
      <section class="settings-group" aria-labelledby="settings-route-title"><h3 id="settings-route-title">Préférences par défaut</h3>
        <label for="settings-vehicle">Véhicule</label>
        <p id="settings-vehicle-hint">Les bornes de recharge apparaissent sur la carte pour un véhicule électrique.</p>
        <select id="settings-vehicle" aria-describedby="settings-vehicle-hint"><option value="thermal">Thermique</option><option value="electric">Électrique</option></select>
        <label for="settings-criterion">Critère par défaut</label>\
<p id="settings-criterion-hint">S’applique aux nouveaux trajets. Les options du trajet actuel restent indépendantes.</p>\
<select id="settings-criterion" aria-describedby="settings-criterion-hint">\
<option value="time">Le plus rapide</option>\
<option value="distance">Le plus court</option>\
</select>
        <fieldset class="road-preferences settings-avoidance" aria-describedby="settings-avoidance-hint">\
<legend>Routes à éviter</legend>\
<label>\
<input id="settings-avoid-motorways" type="checkbox"> Les autoroutes</label>\
<label>\
<input id="settings-avoid-tolls" type="checkbox"> Les péages</label>\
<p id="settings-avoidance-hint">Modifier ces choix nécessite un nouveau calcul du trajet. Les évitements utilisent les données OpenStreetMap, parfois incomplètes, et nécessitent le service France. La démo Paris ne les prend pas en charge.</p>\
</fieldset>
      </section>
      <fieldset id="settings-pip" class="road-preferences settings-group" hidden><legend>Fenêtre flottante</legend><label><input id="settings-pip-automatic" type="checkbox"> Ouvrir automatiquement pendant le guidage</label><p>La fenêtre reste aussi accessible depuis le guidage.</p></fieldset>
      <section class="settings-updates settings-group" aria-labelledby="settings-updates-title"><h3 id="settings-updates-title">Mises à jour</h3>
        <button id="updates-check" class="setting-button">Rechercher les mises à jour</button>
        <p id="updates-history">Dernière recherche : <time id="updates-last-check">Jamais</time></p>
        <p id="updates-status" role="status" aria-live="polite"></p>
        <button id="updates-reload" class="setting-button" hidden>Actualiser l’application</button>
      </section>
      <p><a href="https://eclaire.nriault.fr/confidentialite.html" target="_blank" rel="noopener">Politique de confidentialité</a></p>
      <p class="settings-version">Version <strong id="settings-version">${__APP_VERSION__}</strong></p><p id="settings-error" role="status" hidden></p>
    </div>
  </dialog>`;
}
