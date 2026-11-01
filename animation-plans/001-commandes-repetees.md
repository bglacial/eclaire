# 001 — Réserver la pression animée à l’action principale

- **Status**: DONE, validation sur téléphone physique restante
- **Commit**: 8b8026b
- **Severity**: MEDIUM
- **Category**: Purpose & frequency, accessibility, cohesion
- **Estimated scope**: 1 fichier source, `src/style.css`, environ 5 lignes modifiées

## Problem

Dans `src/style.css:360-363` à la base du plan, tous les boutons rétrécissent au pointeur. Les zooms répétés, les outils de carte et les catégories de lieux héritent ainsi d’une animation destinée à confirmer une action principale. Le plan antérieur `plans/001-motion.md` réservait déjà la pression à l’action principale et excluait les zooms répétés.

Code actuel, verbatim :

```css
@media (prefers-reduced-motion: no-preference) {
  html:not(.keyboard-input) button { transition: transform 160ms var(--ease-out), opacity 160ms var(--ease-out); }
  html:not(.keyboard-input) button:active { transform: scale(0.97); }
}
```

En réduction des mouvements, ce bloc retire également le retour de transition d’opacité aux boutons. L’absence de mouvement doit conserver ce retour discret. Les interactions clavier doivent rester immédiates.

## Target

Remplacer le bloc précédent par :

```css
html:not(.keyboard-input) button { transition: opacity 160ms var(--ease-out); }
@media (prefers-reduced-motion: no-preference) {
  html:not(.keyboard-input) button.primary { transition: transform 160ms var(--ease-out), opacity 160ms var(--ease-out); }
  html:not(.keyboard-input) button.primary:active { transform: scale(0.97); }
}
```

La courbe existante reste exactement `cubic-bezier(0.23, 1, 0.32, 1)`. Aucun déplacement n’est ajouté. La transition d’opacité de 160 ms reste disponible au pointeur avec ou sans réduction des mouvements. Aucune transition de bouton ne s’applique avec `.keyboard-input` sur la racine.

## Repo conventions to follow

- Réutiliser `--ease-out`, déclaré dans `src/style.css:24` à la base du plan.
- Réutiliser `.primary`, déjà employée par le lancement du calcul, le démarrage du guidage et l’application des étapes.
- Conserver la détection existante dans `src/app.ts:114-116` : `keydown` ajoute `.keyboard-input`, `pointerdown` la retire.
- Les transitions des résultats, paramètres, espaces de trajet et de l’aide restent à 200 ms. Elles ne sont pas concernées par ce plan.

## Steps

1. Dans `src/style.css`, repérer le bloc actuel reproduit ci-dessus. Les numéros peuvent avoir changé lors des retouches d’interface ; vérifier le contenu exact avant l’édition.
2. Déplacer la transition d’opacité seule hors de la media query, avec le sélecteur `html:not(.keyboard-input) button`.
3. Dans la media query `prefers-reduced-motion: no-preference`, remplacer les deux sélecteurs génériques de boutons par `button.primary` et `button.primary:active`, exactement comme dans Target.
4. Vérifier qu’aucune autre règle globale `button:active` n’applique une échelle. Ne modifier aucune règle de survol existante.

## Boundaries

- Ne pas modifier le HTML, les libellés, les icônes ni la logique métier.
- Ne pas modifier `src/animation.ts`, `src/animation-timing.ts`, Leaflet ou les timings de suivi GPS.
- Ne pas ajouter de dépendance, d’effet de survol, de keyframes ni de délai.
- Ne pas modifier les transitions de panneaux ou leur fermeture.
- Si le bloc actuel diffère fonctionnellement du code reproduit, arrêter et signaler la dérive au lieu d’improviser.

## Verification

- **Mechanical** : `rtk npm test`, `rtk npm run build`, `rtk git diff --check`, tous avec succès. Dans la recette navigateur, contrôler les styles calculés des boutons principal et zoom, avant et pendant la pression, avec `reducedMotion: 'no-preference'` puis `'reduce'`.
- **Feel check** : ouvrir la carte et maintenir le bouton Zoom avant. Il doit rester stable, sans changement d’échelle. Répéter rapidement Zoom avant/Zoom arrière et les changements de catégorie de lieux. Appuyer ensuite sur une action `.primary` : son échelle passe brièvement à `.97`, avec la courbe et les 160 ms prévus. Répéter en réduction des mouvements : aucune échelle, retour d’opacité conservé. Refaire au clavier : réponse immédiate, aucun mouvement de pression. Dans DevTools, examiner à 10 % de vitesse les transitions pour confirmer qu’aucun contrôle répété ne rétrécit. Vérifier ensuite sur téléphone physique lorsque disponible.
- **Done when** : seules les actions `.primary` changent d’échelle au pointeur sans réduction des mouvements ; les autres boutons restent stables ; le clavier est immédiat ; la préférence de réduction des mouvements conserve l’opacité et supprime l’échelle.

Les vérifications navigateur ne remplacent pas le contrôle de fluidité sur téléphone physique.

## Exécution

Bloc CSS appliqué. Les 65 tests unitaires, la compilation de production et les 19 scénarios de `tests/user-feedback-ui.mjs` passent. La recette vérifie les styles calculés au pointeur, au clavier et avec mouvements réduits. Contrôle statique et `rtk git diff --check` réussis. Le contrôle de fluidité sur téléphone physique reste à effectuer.
