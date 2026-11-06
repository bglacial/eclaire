---
title: Le canvas doit conserver le repère de projection de son cache
author: Nriault
date: 2026-11-06
branch: main
id: l-65298f42
scope: repo
status: active
src: agent
touches:
  - AGENTS.md
  - README.md
  - android/app/build.gradle
  - android/app/src/androidTest/java/fr/eclaire/app/EdgeToEdgeInstrumentedTest.java
  - ios/App/App.xcodeproj/project.pbxproj
  - ios/App/App/EclaireNavigation.swift
  - ios/App/App/Info.plist
  - opencode.json
  - package-lock.json
  - package.json
---

## Decided
Projeter les coordonnées avec le zoom, l’origine et l’orientation capturés à la création du cache, parce que Leaflet peut changer d’orientation avant la construction différée des lignes. La transformation CSS suit ensuite la caméra courante sans mélanger les deux repères.

## Tried and ruled out
Attendre une ou deux frames ne corrigeait pas le décalage. La rotation Leaflet remet à zéro le décalage d’un pan et invalide les lignes du canvas. Leur construction différée utilisait ensuite la nouvelle orientation, tandis que CSS appliquait encore la rotation depuis le repère précédent : le tracé tournait deux fois. Le panneau plus grand rend ce cas reproductible.

## Watch out
Garder la comparaison des pixels du vrai tracé sur plusieurs points pendant le pincement et après pan puis rotation. Le harnais expose uniquement la carte principale dans testMap, parce que les aperçus utilisent aussi Leaflet. Attendre la confirmation du recalcul et son rendu avant de contrôler le cadrage.

In the code: src/animation.ts, projectPoint et edgeLine ; tests/map-interactions-ui.mjs ; tests/gps-ui.ts. Le contrôle échoue avant correction puis passe sans relâcher la vérification des pixels.
