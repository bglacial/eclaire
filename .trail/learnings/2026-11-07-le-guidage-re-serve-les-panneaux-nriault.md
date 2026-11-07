---
title: Le guidage réserve les panneaux visibles plutôt que son conteneur plein écran
author: Nriault
date: 2026-11-07
branch: main
id: l-ad22ddeb
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
  - src/map-viewport.ts
  - tests/map-viewport.test.ts
---

## Decided
Le cadrage du guidage mesure séparément la limite basse des indications et la limite haute des commandes en portrait. Le conteneur de guidage couvre toute la carte et ne représente donc pas une zone masquée. En paysage, les deux panneaux réservent toujours les côtés. L’éditeur de trajet garde la priorité lorsqu’il est ouvert pendant le guidage.

## Tried and ruled out
L’ancien calcul utilisait le haut du conteneur de guidage comme limite basse de carte : avec le conteneur plein écran de l’alpha.18, il réservait plus que toute la hauteur. La caméra plaçait alors le GPS derrière les instructions. Les tests unitaire et navigateur échouent avant la correction puis passent en mesurant les panneaux réels.

## Watch out
Tester la position du marqueur entier entre les panneaux, dès le démarrage et après Recentrer, sur petit écran et en paysage avec une carte tournée. La seule visibilité DOM du marqueur ne prouve pas qu’il est hors des panneaux.

In the code: src/map-viewport.ts, mapPadding ; tests/map-viewport.test.ts ; tests/guidance-viewport-ui.mjs (390×844, 320×568, 430×932, 844×390, clair/sombre, orientation nord/est). Recette GPS et service routier simulés, sans validation physique.
