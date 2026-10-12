# Ordre d'exécution — L'Arbre (pour GPT Luna)

Tu reprends un prototype existant et tu le rapproches **le plus possible** de l'image `docs/vision.png`
(9 vignettes numérotées). Cette image est la référence unique : en cas de doute, c'est elle qui décide.
Le projet est dans ce dossier (`arbre/`). Lis d'abord `README.md`.

## 1. Règles de travail (à respecter à chaque phase)

1. **Une phase à la fois, dans l'ordre.** Ne commence pas la suivante tant que les critères de réussite de la précédente ne sont pas remplis.
2. **`npm test` doit rester vert.** Ajoute des tests pour toute logique nouvelle (pas pour le rendu).
3. **Pas de dépendance npm au runtime.** Le projet doit rester servi par des fichiers statiques. Si tu as besoin de modules complémentaires de three.js
   (EffectComposer, UnrealBloomPass, GLTFLoader…), copie-les depuis `three@0.160.0` dans `vendor/addons/` (même version que `vendor/three.module.js`) et déclare-les dans l'importmap de `index.html`.
4. **Le projet fonctionne dans deux modes** (serveur et local), derrière la même interface `js/reseau/`. Toute fonction sociale nouvelle doit exister dans les deux.
5. **Le client et le serveur partagent `shared/`.** Ne duplique pas la logique : le mode local réutilise `shared/monde.js`.
6. **Ne modifie pas ce qui marche sans raison** : `js/monde3d/deplacement.js` et `shared/arbre.js` sont testés ; si tu les changes, les tests doivent rester verts.
7. **Preuve visuelle obligatoire** : à la fin de chaque phase, fais des captures d'écran (Playwright + Chromium) et range-les dans `docs/captures/phase-N/`.
   Le rendu logiciel de Chromium est lent (environ 2 images par seconde) : c'est normal, ne l'interprète pas comme un bug de performance.
8. **Un rapport à la fin de chaque phase** : `docs/rapports/phase-N.md` avec : ce qui est fait, ce qui ne l'est pas, les écarts par rapport à l'image, les tests lancés, les captures.
   Sois honnête : si un critère n'est pas atteint, dis-le.
9. **Un commit par phase**, message en français, sans nom de modèle.
10. Si une demande est ambiguë, choisis l'option qui ressemble le plus à l'image, et note ton choix dans le rapport.

## 2. État actuel (ce qui existe)

- Arbre généré de 160 m de tronc et 11 354 nœuds (`shared/arbre.js`), rendu en instances (`js/monde3d/arbre3d.js`), croissance animée, capitale = plateforme dorée au sommet.
- Une boule de 22 cm qui roule sur les branches et marche dans une feuille plate de 3 m (`js/monde3d/deplacement.js`, `graphe.js`, `boule.js`).
- Style actuel : ombrage à paliers avec contours noirs (`js/decor.js`). **L'image n'est pas dans ce style** : c'est un rendu 3D stylisé, éclairé, sans contours.
- Vidéos : publier et lire, en mode serveur et en mode local.
- Pas encore : intérieur de la feuille, écran dans la scène, capitale-lieu, avatar personnalisable, explorer / messages / j'aime / profil.

## 3. Problèmes connus à corriger d'abord

- **La caméra entre dans le bois** : `js/camera.js`, la méthode `update(obstacle)` rapproche la caméra jusqu'à 1,2 m de la boule, ce qui la place dans l'écorce à une fourche épaisse. Captures de l'utilisateur : écran presque entièrement brun.
- **Rendu uniforme** : brun plat, pas de ciel visible, pas de repère.

## 4. Les phases

### Phase 0 — Caméra et lisibilité (priorité absolue)

**But** : on voit toujours la boule et son environnement, jamais l'intérieur du bois.

Travail :
- Distance minimale de caméra de 3 m (au lieu de 1,2 m). Si un rameau gêne, la caméra **monte au-dessus** de la boule et recule, au lieu de s'enfoncer dans le bois.
- Le test d'obstacle part de la boule vers la caméra ; si la caméra finit dans la matière, elle est repoussée vers la boule le long de la normale de surface.
- Au départ de la connexion, caméra à 8 m, un peu au-dessus de la boule.
- Corrige le fond uni : le ciel doit être visible dès que la caméra regarde vers le haut.

Réussite : 20 captures prises à des endroits variés (feuille, tronc, fourches épaisses, capitale), dans aucune on n'est « dans le bois ». Test unitaire de la logique de distance.

### Phase 1 — Fondations du rendu (vignettes 1, 4)

**But** : la lumière et les matières de l'image.

Travail :
- Remplace l'ombrage à paliers et les contours noirs par un rendu éclairé : `MeshStandardMaterial`, lumière hémisphérique chaude, soleil bas doré, ombres douces sur la boule et les feuilles proches.
- Brouillard atmosphérique chaud (rose, doré), ciel de coucher de soleil en dégradé.
- Post-traitement : bloom léger (`UnrealBloomPass`) pour les lanternes et les écrans. Prévois de pouvoir le couper.
- Nuages : de vraies couches de nuages sous et autour de l'arbre (vignette 1), pas des boules blanches.
- Lucioles : petites particules lumineuses près de la boule.
- Un interrupteur de qualité (`haute` / `moyenne` / `basse`) qui règle la résolution, les ombres, le bloom et le nombre de particules.

Réussite : une capture « vue lointaine » (comme la vignette 1) et une capture « boule sur une branche » (comme la vignette 4) qui ressemblent à l'image par la lumière et l'ambiance. Les tests passent.

### Phase 2 — Écorce, mousse, feuillage (vignette 4)

**But** : la branche a l'air vivante.

Travail :
- Texture d'écorce (générée dans un canevas ou petite image) avec normal map, en tuiles, sans nuire à la performance.
- Mousse sur le dessus des branches, lianes pendantes, touffes de feuilles autour des nœuds. Tout en instances.
- Feuilles décoratives (en plus des feuilles-maisons) sur les rameaux fins, avec balancement léger.
- Garde un budget : 60 images par seconde visées sur ordinateur à qualité haute, nombre d'instances décoratives plafonné et réglé par la qualité.

Réussite : capture proche d'une branche avec mousse, lianes et feuilles. Mesure et indique les fps.

### Phase 3 — La maison-feuille (vignettes 2 et 3)

**But** : la feuille est une vraie maison avec un intérieur.

Travail :
- Modèle de la feuille repliée en toit (génère-le dans le code ou charge un GLB) posée sur sa branche, avec une ouverture.
- **Scène intérieure séparée** (`js/monde3d/maison.js`) : plancher en bois, lit, lampe, plantes, coussins, lanternes. L'utilisateur y entre par une transition (fondu ou caméra qui glisse), la boule y marche librement dans un espace borné.
- Les objets de l'intérieur sont chargés seulement quand on entre. Pas de détail d'intérieur dans la scène de l'arbre.
- Vu de l'extérieur, la maison est visible depuis les branches voisines, avec une lumière chaude à l'intérieur (vignette 4 : maisons au loin).
- Ajoute à `shared/` ce qu'il faut pour que la maison soit la même pour tous (position, orientation).

Réussite : captures de l'extérieur (vignette 2) et de l'intérieur (vignette 3, sans l'écran). Test : entrer et sortir de la maison sans téléportation.

### Phase 4 — L'écran dans la scène (vignette 3)

**But** : l'écran est un objet de la pièce, avec le menu de l'image.

Travail :
- Panneau courbe (vignette 3) qui affiche une grille de vidéos publiées (vignettes générées côté client si nécessaire).
- Menu à gauche : Accueil, Explorer, Messages, Profil. Tout est cliquable et fonctionne ; les sections pas encore prêtes affichent un état vide propre (jamais d'erreur).
- Lecture d'une vidéo sur le panneau (texture vidéo ou superposition HTML alignée).
- Style : verre givré, bords arrondis, comme dans l'image.

Réussite : capture de l'écran dans la maison avec une vidéo qui joue. Fonctionne en mode serveur et en mode local.

### Phase 5 — La capitale (vignette 5)

**But** : la capitale est un lieu.

Travail :
- Scène dédiée (`js/monde3d/capitale.js`) : grand creux dans le tronc, plateforme en bois, escalier, ponts, lanternes.
- Panneaux de vidéos flottants au centre, alimentés par toutes les vidéos publiques (les plus récentes d'abord).
- Silhouettes des autres personnes connectées (simples boules) pour donner de la vie.
- On y arrive depuis le bouton « Capitale » ou en marchant jusqu'au sommet du tronc ; transition comme pour la maison.

Réussite : capture comme la vignette 5, et test de l'aller-retour entre l'arbre et la capitale.

### Phase 6 — La vie dans l'arbre (vignettes 1 et 4)

**But** : on voit que l'arbre est habité.

Travail :
- Les maisons des autres sont visibles de loin avec une lumière chaude (une par feuille poussée).
- Des ponts de cordes ou de planches entre certaines branches, des lanternes le long des chemins.
- Vue d'aperçu avant connexion : l'arbre dans les nuages avec ses lumières (vignette 1).

Réussite : capture d'aperçu proche de la vignette 1, avec 50 puis 500 personnes.

### Phase 7 — Croissance visible (vignette 6)

**But** : 10, 100, 1 000 et 10 000 personnes donnent quatre arbres bien différents.

Travail :
- Étends la règle de croissance (`shared/regles.js`) au-delà de 1 000 personnes : le tronc s'épaissit, la couronne se remplit, des étages supplémentaires poussent. Documente les valeurs.
- Ajoute un outil de test qui génère un monde de N personnes (local, sans navigateur) et produit une capture comparable aux quatre vignettes.
- Garde la cohérence serveur / client (même arbre, même croissance). Étends les tests.

Réussite : quatre captures (10, 100, 1 000, 10 000) qui montrent une progression nette.

### Phase 8 — Avatar personnalisable (vignette 7)

**But** : la boule se personnalise.

Travail :
- Six styles de départ comme dans l'image : blanche, noire à circuits lumineux, verre, avec casquette, rose à lunettes, dorée avec casque audio.
- Matériaux (couleur, brillance, émission, transparence) et accessoires (casquette, lunettes, casque), choisis dans l'écran Profil.
- Le choix est stocké dans le profil (serveur et local) et vu par les autres personnes.
- Test : sauvegarde et relecture du profil, validation des valeurs reçues (rien d'arbitraire accepté par le serveur).

Réussite : capture des six styles en ligne, comme la vignette 7.

### Phase 9 — Fonctions sociales (vignette 9)

**But** : un vrai réseau social dans l'écran.

Travail :
- **Explorer** : liste et grille de vidéos publiques, tri par récent et par populaires.
- **Publier** : le formulaire actuel, intégré à l'écran.
- **J'aime**, **commentaires**, **partage** d'un lien vers une vidéo.
- **Messages** : messages privés entre deux personnes, boîte de réception, notification en temps réel.
- **Profil** : pseudo, avatar, vidéos publiées, nombre de j'aime.
- API serveur et équivalent local pour chaque fonction. Limites de taille et validation côté serveur. Tests pour chaque nouvelle route.

Réussite : capture de la vignette 9 (menu et carte vidéo avec les trois icônes), et test de bout en bout.

### Phase 10 — Performance et téléphone

**But** : ça tourne sur un téléphone.

Travail :
- Qualité automatique selon les images par seconde mesurées.
- Découpage de l'arbre par zones : ne dessine que ce qui est proche, et fais disparaître le reste dans le brouillard.
- Budget de triangles et de matériaux par qualité ; rapport de mesures dans `docs/rapports/phase-10.md`.
- Vérifie l'interface sur 390 × 844 px et la manette tactile.

Réussite : tableau avant/après des images par seconde et des triangles, et captures mobiles de chaque lieu.

### Phase 11 — Finition

- Sons doux (vent, oiseaux, pas), activables et coupables.
- Textes et accessibilité : contrastes, tailles, navigation au clavier.
- README et zip du projet à jour.

## 5. Ce que tu me remettras à la fin

Le dossier du projet en zip complet, avec `docs/rapports/phase-N.md` et `docs/captures/phase-N/` pour chaque phase faite.
Dis clairement jusqu'où tu es allé. **Je préfère une phase terminée et vérifiée à trois phases à moitié faites.**
