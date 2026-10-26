# 001 · Conserver l'éclair, clarifier les transitions

- **Status**: DONE
- **Commit**: 6b34625 (base de l'audit)
- **Severity**: MEDIUM
- **Category**: Accessibility, purpose and frequency, cohesion
- **Estimated scope**: src/map.ts, src/app.ts, src/style.css

## Problem

L'audit improve-animations a confirmé trois points :

| Priorité | Emplacement à la base | Constat | Traitement |
|---|---|---|---|
| MEDIUM | src/map.ts:5, src/app.ts:502 | Leaflet anime encore certains zooms en mode réduit. | Zooms immédiats, fondu des tuiles adapté à la préférence système. |
| MEDIUM | src/style.css:178 | Tous les boutons rétrécissent, y compris clavier et zoom répété. | Pression réservée à l'action principale au pointeur. |
| LOW | src/style.css:179 | L'opacité utilise une courbe distincte. | Réutiliser le token commun. |

Extrait avant :

```css
button, #route-editor > summary { transition: transform 150ms var(--ease-out), opacity 150ms ease; }
button:active { transform: scale(0.97); }
```

Opportunités retenues : révéler le résultat sans saut visuel, ouvrir et fermer l'aide native avec une transition courte, afficher « Calcul du trajet… » avant réception de la trace, sans faux pourcentage.

## Target

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
/* Résultat et aide : opacity/transform, 200ms var(--ease-out). */
/* Pression principale : scale(0.97), 160ms var(--ease-out). */
```

Réduction des mouvements : conserver l'opacité, retirer translations et changements d'échelle. Le clavier reste immédiat. Les zooms répétés sont immédiats, indépendamment du périphérique. Les transitions display/overlay de l'aide native ne produisent pas de déplacement et permettent sa sortie de la top layer.

## Repo conventions to follow

Réutiliser --ease-out dans src/style.css. Le moteur Canvas utilise déjà motion et easeOutQuint dans src/animation-timing.ts. Ses durées de convergence et de révélation expliquent le calcul : les conserver. Aucun ajout de bibliothèque.

## Steps

1. Configurer zoomAnimation et markerZoomAnimation à false dans createMap ; actualiser fadeAnimation lorsque la préférence système change, retirer l'écouteur à unload.
2. Rendre zoomIn/zoomOut immédiats. Ne pas animer fitBounds au clavier ou en mode réduit.
3. Retirer la pression générique, conserver seulement celle du bouton principal au pointeur.
4. Ajouter l'apparition du résultat avec @starting-style, 6px et 200ms. Aide native : scale(0.97), 200ms, sortie symétrique avec allow-discrete.
5. Adapter les couleurs des fronts au fond clair, conserver les routes réelles, les têtes lumineuses et les traînées. Ne pas modifier les timings explicatifs.

## Boundaries

Aucun nouvel effet de défilement, aucune boucle décorative, aucune bibliothèque de mouvement. Ne pas modifier les coûts routiers pour enrichir l'animation. Ne pas réécrire le guidage GPS.

## Verification

- **Mechanical**: npm test ; npm run build ; git diff --check.
- **Feel check**: lancer Louvre–Panthéon, interrompre puis relancer ; observer les fronts et le résultat, ouvrir et fermer l'aide. Refaire au clavier et en mode réduit. À 320 × 640, vérifier les repères, le résultat et le bouton d'interruption. Pour l'aide au pointeur, examiner les 200ms d'entrée/sortie au ralenti dans DevTools.
- **Done when**: éclair conservé, clavier immédiat, aucune translation en mode réduit, commandes accessibles pendant l'exploration. La fluidité sur téléphone physique reste à valider.
