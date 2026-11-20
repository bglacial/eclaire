---
title: Le guidage Android Auto démarre depuis la voiture
author: Nriault
date: 2026-11-20
branch: main
id: l-c66d02ab
scope: repo
status: active
src: agent
touches:
  - ".github/workflows/ci.yml"
  - AGENTS.md
  - README.md
  - android/app/build.gradle
  - android/app/src/main/AndroidManifest.xml
  - android/app/src/main/java/fr/eclaire/app/CarGuidance.java
  - android/app/src/main/java/fr/eclaire/app/CarNavigationScreen.java
  - android/app/src/main/java/fr/eclaire/app/EclaireCarService.java
  - android/app/src/main/java/fr/eclaire/app/EclaireNavigation.java
  - android/app/src/main/java/fr/eclaire/app/MainActivity.java
---

## Decided
La recherche, l’aperçu et le départ restent accessibles depuis l’écran voiture, parce que le renvoi vers le téléphone pour préparer le trajet a déclenché deux avertissements Play. L’hôte réserve la demande d’autorisation à l’arrêt. Le téléphone masque les fonctions interactives pendant la projection, parce que CarConnection indique la connexion et ne distingue pas un arrêt de la circulation.

## Tried and ruled out
Le bouton de départ mobile exige une activité reprise. Le service voiture lié par l’hôte demande le GPS au premier plan, puis le service de guidage partagé prend le relais. La simulation part de Paris parce que les vérificateurs peuvent être hors de la zone couverte.

## Watch out
Vérifier le GPS téléphone verrouillé sur un appareil connecté à un hôte réel, parce que le mode simulé et les tests unitaires ne prouvent pas les autorisations du service en projection. Vérifier aussi le refus d’autorisation et la reprise d’un trajet préparé avant connexion.

In the code: EclaireCarService active la localisation avant le calcul, CarRouteScreen lance NavigationService, CarNavigationScreen traite onAutoDriveEnabled et MainActivity observe CarConnection.
