# 🌳 L'Arbre — réseau social 3D

Un arbre gigantesque, en ambiance dessin animé. **Chaque personne est une feuille** : sa maison.
Plus on est nombreux, plus l'arbre pousse. Les branches gonflent avec les feuilles qu'elles portent.
Au sommet du tronc, la **capitale**, où remontent toutes les vidéos publiées.

Dans l'arbre, chacun est une **petite boule**. Elle roule sur les branches, entre et sort de sa feuille,
et se promène de rameau en rameau.

## Lancer le projet

Il fonctionne dans deux modes, choisis automatiquement au démarrage.

### 1. Avec le serveur (monde partagé)

Prérequis : Node.js 20 ou plus. Aucune dépendance à installer.

```bash
cd arbre
npm start                 # http://localhost:3000
```

Variables facultatives : `PORT` (3000 par défaut), `ARBRE_DONNEES` (dossier des données ; `data/` par défaut, ignoré par git).

### 2. Sans serveur (monde local)

Le client seul suffit : n'importe quel hébergement statique convient (GitHub Pages, `python3 -m http.server`…).
Le navigateur détecte l'absence d'API et passe en mode local : le monde est alors sur cet appareil, avec des feuilles
de démonstration. Les ES modules ne se chargent pas depuis un fichier ouvert directement (`file://`) :
il faut un petit serveur de fichiers, même sans l'API.

```bash
cd arbre
python3 -m http.server 8000      # http://localhost:8000  → mode « sans serveur »
```

Le même code sert les deux modes : seul le « backend » change (`js/reseau/`).

## Commandes

| | Ordinateur | Téléphone |
|---|---|---|
| Marcher | ZQSD ou flèches (par rapport à la caméra) | glisser un doigt |
| Courir | Maj | — |
| Aller quelque part | clic sur une branche ou une feuille | tap |
| Tourner la caméra | glisser à la souris | deux doigts |
| Zoomer | molette | deux doigts (pincement) |

Boutons : **Ma feuille**, **Capitale**, **Écran** (vidéos des autres), **Publier**.

## Ce qu'il y a dans le monde

- **Une échelle réelle, en mètres** : le tronc fait 160 m (9 m de rayon à la base), le sommet porte la capitale.
  Une feuille-maison fait 3 m, la boule 22 cm. Un brouillard cache le lointain : on ne voit jamais tout l'arbre.
- **11 354 nœuds** générés par une graine fixe ; le serveur et le navigateur calculent exactement le même arbre.
- **Une feuille par personne** : au moment de la connexion, elle est posée sur le rameau le moins chargé.

## Les règles

Dans `shared/regles.js` (croissance) et `js/monde3d/deplacement.js` (mouvement).

**Croissance**
- Les nœuds sont poussés dans un ordre fixe : le tronc, puis les branches couche par couche.
  Il y a `k0` = 2 292 nœuds au départ ; le reste pousse avec la population, jusqu'à l'arbre complet vers **1 000 personnes**.
- Épaisseur d'une branche : `1 + 0,06 × √poids`, plafonnée à ×2,5. Le poids d'un nœud est le nombre de feuilles portées par ce nœud et ses rameaux.
- Animation : une branche s'allonge depuis son parent, puis s'épaissit ; une feuille arrive avec un petit rebond.

**Déplacement**
- La boule roule sur la surface des branches : sa normale suit la courbe (transport parallèle), et elle ne tourne que sur le chemin parcouru (sa surface ne glisse pas plus vite qu'elle). Elle ne saute pas.
- À chaque fourche, elle prend la branche qui correspond à la direction demandée (cosinus minimal 0,2 ; pour entrer dans une feuille, 0,55).
- Une demande d'aller quelque part est calculée par plus court chemin (Dijkstra) sur le graphe des rameaux.
- Dans sa feuille, la boule se déplace librement, sans sortir de la forme de la feuille. Elle quitte la feuille par le pétiole,
  et rejoint toujours le pied avant de sortir.
- Vitesse : 6 m/s en marche, 14 m/s en course.

## Architecture

```
arbre/
├── index.html, css/style.css       la page
├── js/                             le client (navigateur)
│   ├── main.js                     démarrage, connexion, boucle, gestes et actions
│   ├── reseau/                     le monde : serveur (serveur.js) ou local (local.js), choisi par index.js
│   ├── monde3d/
│   │   ├── arbre3d.js              rendu de l'arbre (instances par rang, croissance animée, feuilles, capitale)
│   │   ├── graphe.js               graphe des rameaux et plus court chemin
│   │   ├── deplacement.js          la logique de la boule (pur calcul, testée)
│   │   └── boule.js                la petite boule
│   ├── camera.js, entrees.js, decor.js, ui.js
├── shared/                         partagé par le serveur et le navigateur
│   ├── arbre.js                    génération de l'arbre (graine fixe)
│   ├── geometrie.js                vecteurs, placement des feuilles
│   ├── regles.js                   croissance, épaisseur, poids
│   └── monde.js                    les utilisateurs, les feuilles, les vidéos (stockage injecté)
├── server/
│   ├── serveur.js                  API HTTP, temps réel (SSE), vidéos, fichiers du client
│   ├── stockage.js                 le monde sur disque (JSON)
│   └── index.js                    démarrage : npm start
├── test/                           tests (npm test)
└── vendor/three.module.js          three.js r160, fourni dans le projet
```

### API du serveur

| Méthode | Chemin | Rôle |
|---|---|---|
| `POST` | `/api/connexion` | `{ pseudo, token? }` → crée la feuille, ou reprend le compte avec son jeton |
| `GET` | `/api/moi` | la personne connectée (en-tête `Authorization: Bearer <jeton>`) |
| `GET` | `/api/monde` | l'état : compteurs, poids, feuilles, capitale |
| `GET` | `/api/evenements` | flux SSE : `monde`, `feuille`, `video` |
| `GET` | `/api/videos` | toutes les vidéos publiques, les plus récentes d'abord |
| `POST` | `/api/videos` | publication : corps binaire, `Content-Type` = type vidéo, en-têtes `X-Titre` et `X-Description` (URL-encodés) |
| `GET` | `/medias/<id>.<ext>` | lecture, avec les requêtes `Range` |

Les fichiers publics sont `index.html`, `css/`, `js/`, `shared/` et `vendor/`. Le code du serveur et les données ne sont jamais servis.

### Tests

```bash
npm test
```

- `arbre.test.js` : la génération, les rangs, la croissance, le placement des feuilles.
- `monde.test.js` : les pseudos, la répartition des feuilles, le poids, la persistance, les vidéos.
- `deplacement.test.js` : la boule suit une branche, choisit sa fourche, reste continue (pas de téléportation),
  entre et sort de sa feuille, et s'arrête au sommet sans sauter.
- `serveur.test.js` : les routes, l'authentification, la publication et la lecture par tranches, les fichiers publics, le temps réel.

## Ce qui vient de l'ancien jeu (Zira)

| Ancien | Ce qu'on en garde |
|---|---|
| `src/tree.js` | l'idée d'un arbre procédural déterministe et du graphe de navigation (réécrit en pur calcul, partagé avec le serveur) |
| `src/rng.js` | le générateur `mulberry32` |
| `src/leaves.js` | les feuilles en instances et le balancement au vent |
| `src/movement.js` | la marche sur un graphe de nœuds, enrichie (normale de surface, fourches, feuilles) |
| `src/camera.js` | le principe d'une caméra qui suit le personnage |
| `vendor/three.module.js` | three.js, copié dans le projet |
| `src/audio.js`, Capacitor, PWA | pas encore utilisés (sons, application mobile) |

## Limites

- **Pas d'authentification.** Un pseudo ne se reprend que depuis le navigateur qui l'a créé (jeton dans `localStorage`).
- **Vidéos** : fichiers sur le disque du serveur ; sans transcodage, sans modération.
- **Stockage** : un fichier JSON réécrit à chaque changement. Suffisant pour un prototype, pas pour des milliers de personnes ni plusieurs serveurs.
- **Caméra** : elle se rapproche quand une branche lui coupe la vue, mais ne contourne pas encore les rameaux.
- **Rendu** : tous les nœuds poussés sont dessinés (~11 000 au maximum). Un découpage par zones (LOD) viendra si les téléphones peinent.
- **Le mode local** partage son monde seulement avec cet appareil.

## Pistes suivantes

1. Comptes réels (mot de passe ou lien magique).
2. L'écran de la feuille : une vraie vidéo projetée sur la feuille, visible depuis les branches.
3. La capitale : une vraie salle de projection, avec une grille de vidéos.
4. Caméra qui contourne les rameaux ; découpage par zones de l'arbre.
5. Stockage (base de données et stockage des vidéos) et transcodage.
6. Sons (réutiliser `src/audio.js`), puis application mobile (réutiliser Capacitor).


## Le monde (`monde.html`)

Le cœur du jeu : un tronc, la capitale (la place autour du tronc, sans feuilles), 4 branches par défaut.
- Une personne = **une grande feuille**, à un emplacement fixe d'une branche (alternance gauche/droite).
- Une branche s'allonge et s'épaissit avec ses feuilles ; quand les branches sont pleines, **une nouvelle branche pousse sur le tronc**.
- La boule suit un graphe : branches, tige, feuille, place de la capitale, tronc. Toucher une feuille y emmène la boule.
- Les arrivées sont simulées (+1, +5, +20, auto). Règles et chemins : `shared/monde-arbre.js`, tests : `test/monde.test.js`.
