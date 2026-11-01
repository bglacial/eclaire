# Audit des mouvements du 1er novembre 2026

Audit `improve-animations` en lecture seule, base `8b8026b`. Ce dossier contient les plans d’animation ; `plans/` conserve les autres travaux et l’historique de conception.

| Ordre | Plan | Priorité | État |
|---|---|---|---|
| 1 | [Stabiliser les commandes répétées](001-commandes-repetees.md) | MEDIUM | DONE, validation physique restante |

Plan appliqué et validé par la recette navigateur, sans dépendance, bibliothèque ou migration. Il ne dépend pas des retouches de libellés, d’icônes ou d’organisation des paramètres.

L’audit confirme déjà les bonnes bases : courbe partagée `cubic-bezier(0.23,1,0.32,1)`, transitions d’interface de 200 ms, clavier immédiat, survol réservé à la souris et progression par transformation. Les durées explicatives Canvas documentées sont conservées.

## Opportunités non retenues

- **Sortie des paramètres** : `src/app.ts:180` utilise `hidden = true`, donc la fermeture est immédiate malgré l’entrée animée (`src/style.css:348,356` à la base). Une sortie pourrait améliorer la continuité, mais sa mise en œuvre touche le cycle d’affichage et le retour du focus. Elle demande d’abord une observation visuelle et n’est pas nécessaire pour stabiliser les commandes répétées.
- **Entrée du guidage** : `src/guidance.ts:117` révèle le panneau directement ; `.navigation` n’a pas de transition d’entrée. Une transition pourrait relier résultat et guidage, sous réserve de conserver une indication GPS immédiatement lisible. Aucun défaut bloquant confirmé.
- **Vues Étapes/Lieux** : `src/trip-workspace.ts:55-60` remplace le contenu immédiatement. Aucun mouvement ajouté aux catégories ni aux résultats de recherche, car ces actions répétées doivent rester rapides.

La validation sur téléphone physique reste nécessaire pour juger la fluidité réelle.
