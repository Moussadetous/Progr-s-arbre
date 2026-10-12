# 🌳 L'Arbre — prototype de réseau social 3D

Un réseau social dans un grand arbre, en ambiance dessin animé.

- **Chaque personne qui se connecte reçoit une feuille.** Plus il y a de monde, plus l'arbre pousse.
- **Les branches gonflent avec le poids des feuilles qu'elles portent.**
- **Au sommet du tronc se trouve la capitale**, où remontent toutes les vidéos publiées.
- Sur sa feuille, chacun a **son écran** (les vidéos des autres) et peut **publier**.
- La fourmi de chacun **se promène** sur les branches, de nœud en nœud.

Ce dossier est le **nouveau départ** du projet. L'ancien jeu (`Zira et le Grand Arbre`) reste à la racine du dépôt, intact.

## ▶️ Lancer le prototype

Prérequis : Node.js 20 ou plus. Aucune dépendance npm.

```bash
cd arbre
npm start          # http://localhost:3000
npm test           # règles de croissance, monde, persistance
```

Variables facultatives : `PORT` (3000 par défaut) et `ARBRE_DONNEES` (dossier des données, `arbre/data/` par défaut, ignoré par git).

## ✅ Ce que fait le prototype

| Fonction | État |
|---|---|
| Arbre procédural déterministe (tronc, branches, rameaux, capitale) | ✅ |
| Connexion par pseudo ; une nouvelle personne = une nouvelle feuille | ✅ |
| Croissance : rameaux qui poussent avec le nombre d'utilisateurs | ✅ |
| Épaisseur qui augmente avec le poids des feuilles | ✅ |
| Arrivée des feuilles animée et notifiée en temps réel (SSE) | ✅ |
| Fourmi qui marche de nœud en nœud (clic → plus court chemin) | ✅ |
| « Ma feuille », « Capitale », « Écran » | ✅ |
| Publication d'une vidéo (mp4, webm, mov, ogv ; 150 Mo max) | ✅ |
| Lecture avec seek (requêtes `Range`) | ✅ |
| Carte d'une feuille : ses vidéos, aller sur sa feuille | ✅ |
| Compte et feuille conservés après rechargement | ✅ |

## 🌱 Les règles de croissance

Elles sont dans `shared/regles.js` et `shared/treegen.js`. Le serveur décide ; le navigateur affiche.

1. **L'arbre est fixe pour tout le monde.** Une graine unique (`GRAINE`) produit 468 nœuds : 15 pour le tronc, le reste pour les branches. Le serveur et le navigateur génèrent exactement le même arbre.
2. **L'arbre pousse par étages.** Le tronc d'abord, puis les branches principales, puis les rameaux. L'ordre d'apparition est `ordre` dans `treegen.js`.
3. **Nombre de rameaux visibles** : `K = min(468, 40 + 19 × √utilisateurs)`. Il y a 40 rameaux visibles sans personne ; l'arbre est complet vers 500 personnes.
4. **Une feuille va sur la brindille visible la moins chargée.** Les feuilles se répartissent au lieu de s'entasser ; en cas d'égalité, le point de départ dépend du pseudo.
5. **Poids** : nombre de feuilles portées par un nœud et par tous ses rameaux. Le poids remonte jusqu'au tronc.
6. **Épaisseur** : `1 + 0,22 × √poids`, plafonnée à ×4. Une branche chargée gonfle.
7. **Animation** : un rameau pousse depuis son parent, une feuille arrive avec un petit rebond.

## 🧱 Architecture

```
arbre/
├── server/
│   ├── index.js        HTTP, SSE, vidéos (upload et lecture par Range), fichiers statiques
│   └── monde.js        utilisateurs, feuilles, vidéos, sauvegarde JSON
├── shared/             ← partagé serveur / navigateur
│   ├── treegen.js      génération de l'arbre (pure géométrie, sans three.js)
│   └── regles.js       croissance, épaisseur, poids
├── client/
│   ├── index.html, style.css
│   └── js/
│       ├── main.js         démarrage, connexion, temps réel, actions
│       ├── arbre3d.js      tronc, branches, feuilles, capitale (InstancedMesh + animation)
│       ├── graphe.js       graphe de marche et plus court chemin (Dijkstra)
│       ├── promeneur.js    la fourmi, qui marche le long du graphe
│       ├── camera.js       caméra en orbite
│       ├── saisie.js       tap, glisser, molette, pincement
│       ├── cartoon.js      ciel, nuages, herbe, ombrage à paliers
│       ├── api.js          appels HTTP et flux SSE
│       └── ui.js           panneaux, notifications, lecteur
├── test/monde.test.js
└── package.json
```

Le dépôt fournit `vendor/three.module.js` (three.js r160), que le serveur sert tel quel depuis la racine.

### API

| Méthode | Chemin | Rôle |
|---|---|---|
| `POST` | `/api/connexion` | `{ pseudo, token? }` → crée la feuille ou reprend le compte (avec son jeton) |
| `GET` | `/api/moi` | utilisateur connecté (en-tête `Authorization: Bearer <jeton>`) |
| `GET` | `/api/monde` | instantané : compteurs, poids, feuilles, capitale |
| `GET` | `/api/evenements` | flux SSE : `monde`, `feuille`, `video` |
| `GET` | `/api/videos` | toutes les vidéos publiques, les plus récentes d'abord |
| `POST` | `/api/videos` | publication : corps binaire, `Content-Type` = type vidéo, en-têtes `X-Titre` et `X-Description` (URL-encodés) |
| `GET` | `/medias/<id>.<ext>` | lecture de la vidéo, avec `Range` |

### Tests

`npm test` vérifie : l'arbre est déterministe, le tronc pousse en premier, la croissance est monotone, le poids remonte bien, les feuilles se répartissent, un pseudo pris exige le jeton, les pseudos invalides sont refusés, le poids du tronc vaut le nombre de feuilles, et le monde survit à un redémarrage.

Le navigateur a aussi été testé de bout en bout (Chromium headless) : connexion, marche jusqu'à la capitale, publication et lecture d'une vidéo, clic sur une feuille, « Ma feuille », rechargement avec reconnexion, et un affichage sur téléphone (390 px).

Pour ces tests, `window.__arbre` expose la fourmi, le promeneur, l'arbre et la caméra. C'est un point de débogage, sans usage pour le visiteur.

## ♻️ Ce qui vient de l'ancien projet (Zira)

| Ancien fichier | Ce qu'on en garde |
|---|---|
| `src/tree.js` | L'idée de l'arbre procédural déterministe (même graine partout) et du graphe de navigation entre nœuds. Réécrit en pur calcul pour tourner aussi côté serveur (`shared/treegen.js`). |
| `src/rng.js` | Le générateur `mulberry32`, repris tel quel dans `treegen.js`. |
| `src/leaves.js` | Les feuilles en `InstancedMesh` et le balancement au vent (`arbre3d.js`). |
| `src/movement.js` | La marche sur un graphe de nœuds (`graphe.js`, `promeneur.js`), avec plus court chemin ajouté. |
| `src/util.js` | L'amortissement indépendant du framerate (`amort`, `arbre3d.js`). |
| `src/camera.js` | Le principe de caméra qui suit la fourmi, devenu une caméra en orbite (`camera.js`). |
| `vendor/three.module.js` | Utilisé tel quel, servi par le serveur. |
| `src/audio.js` | Non branché pour l'instant ; réutilisable pour les notifications sonores. |
| `style.css`, `manifest`, `sw.js`, `android/`, Capacitor | Non repris pour l'instant. À réutiliser pour l'application mobile plus tard. |
| `src/landmarks.js`, `decor.js`, `ant.js`, `ui.js` (journal, gouttes, lucioles) | Abandonnés : logique de jeu, sans rapport avec le réseau social. |

## ⚠️ Limites du prototype

- **Pas de vraie authentification.** Un pseudo ne se reprend que depuis le navigateur qui l'a créé (jeton dans `localStorage`). Sur un autre appareil, ou après avoir vidé le navigateur, ce pseudo reste pris.
- **Vidéos** : stockées sur le disque du serveur, sans transcodage, sans contrôle du contenu, sans modération.
- **Base** : un fichier JSON réécrit à chaque changement. Ça tient pour un prototype, pas pour des milliers de personnes ni plusieurs serveurs.
- **Temps réel** : à chaque arrivée, les poids (468 nombres) sont renvoyés à tout le monde. Acceptable ici ; à réduire ensuite.
- **Capacité** : l'arbre est complet vers 500 personnes. Au-delà, la croissance s'arrête. Il faudra agrandir la génération dans `treegen.js`.
- **Serveur requis** : le site ne fonctionne pas sur GitHub Pages seul, car il a besoin de l'API.
- **Testé** : bureau et téléphone en Chromium headless (rendu logiciel). Pas encore sur un vrai téléphone ni avec une vraie carte graphique.

## 🧭 Pistes suivantes

1. Comptes réels (mot de passe ou lien magique).
2. Écran vidéo visible directement sur la feuille, en 3D.
3. Capitale en vraie salle de projection (grille de vidéos, accès depuis les branches).
4. Base de données et stockage objet pour les vidéos, avec transcodage.
5. Modération et quotas.
6. Sons (réutiliser `src/audio.js`), puis application mobile (réutiliser Capacitor).
