---
title: Choisir une destination doit laisser finir le GPS de départ
author: Nriault
date: 2026-11-05
branch: main
id: l-2fcf3346
scope: repo
status: active
src: agent
touches:
  - AGENTS.md
  - README.md
  - ios/App/App.xcodeproj/project.pbxproj
  - opencode.json
  - src/app.ts
  - src/map.ts
  - src/style.css
  - tests/gps-ui.ts
  - tests/map-interactions-ui.mjs
  - tests/user-feedback-ui.mjs
---

## Decided
La recherche du GPS de départ continue lorsqu’on choisit une arrivée, une étape ou un critère, parce que ces actions ne changent pas le départ. Seul un remplacement explicite du départ ou une remise à zéro annule cette demande.

## Tried and ruled out
L’annulation dans l’arrêt commun du trajet empêchait un GPS lent d’aboutir dès que l’utilisateur saisissait son arrivée. Avec un départ imposé au GPS sur mobile, cela bloque tout calcul.

## Watch out
Un refus GPS doit garder une action de nouvelle tentative disponible, même si l’utilisateur choisit ensuite une destination, sinon il faut réinitialiser le trajet pour récupérer le GPS. Aucun point manuel ne remplace le départ GPS mobile.

In the code: src/app.ts, stop, selectPoint, setupSearch, setPicking, locate ; tests/user-feedback-ui.mjs couvre le GPS différé et le refus suivi d’un choix d’arrivée.
