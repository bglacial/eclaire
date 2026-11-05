---
title: La page Informations doit se fermer avec Retour Android
author: Nriault
date: 2026-11-05
branch: main
id: l-e932dd3a
scope: repo
status: active
src: agent
touches:
  - AGENTS.md
  - README.md
  - android/app/build.gradle
  - ios/App/App.xcodeproj/project.pbxproj
  - ios/App/App/Info.plist
  - opencode.json
  - package-lock.json
  - package.json
  - src/app.ts
  - src/guidance.ts
---

## Decided
Retour Android ferme la page Informations et rend le focus au bouton qui l’a ouverte. Le retour Carte reste visible au défilement, parce qu’un bouton de fermeture hors écran ne permet pas de sortir facilement d’une longue page.

## Tried and ruled out
Le bouton de fermeture seul ne suffisait pas : le pont Android déclenche eclaire-back, mais seul le panneau Paramètres traitait cet événement. Le test navigateur Android simulé reproduit un événement non consommé avant correction, puis une fermeture sans quitter la carte après correction.

## Watch out
Le lien vers le fichier brut de provenance Paris a été retiré. Le blocage rapporté sur ce lien dans l’ancienne application n’a pas été reproduit sur téléphone physique. Ne pas attribuer ce signalement uniquement au défaut de Retour Android sans reproduction native.

In the code: src/app.ts, showAbout et le gestionnaire eclaire-back ; src/style.css, about-header ; tests/user-feedback-ui.mjs vérifie les sorties Retour Android, Carte et Échap, puis le calcul d’un trajet.
