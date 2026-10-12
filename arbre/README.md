# L'Arbre

Un seul arbre géant au-dessus d'une mer de nuages. Chaque personne a **une feuille-maison**. La personne, elle, est une **boule minuscule** qui se promène sur les branches : les branches sont des **chemins**.

## Lancer
```
node server/statique.js     # puis ouvrir http://localhost:3000
npm test                    # croissance de l'arbre + marche de la boule
```
Aucune dépendance (three.js est dans `vendor/`). Paramètres d'adresse utiles : `?n=300` (démarrer avec 300 personnes), `?q=basse` (qualité réduite).

## Commandes
- **Marcher** : ZQSD, WASD ou flèches · manette (stick gauche) · joystick à l'écran sur mobile. `Maj` pour courir.
- **Regarder** : glisser (souris ou doigt) · stick droit. **Zoom** : molette, pincement, `+` / `-`.
- **🌱 Faire grandir** (ou `G`) : des personnes arrivent, de plus en plus vite, et la caméra recule pour montrer l'arbre qui pousse. `V` : voir tout l'arbre · `H` : rentrer chez soi.

## Le monde
- **Gravité** : la boule marche sur le dessus des branches, comme sur un chemin. On ne tourne pas autour d'une branche ; au bord, on s'arrête. Les pentes sont douces : on monte et on descend en marchant tout droit.
- **La capitale** est le cœur du tronc : une salle ouverte (colonnes, plancher, scène, écrans flottants pour les vidéos publiques). Aucune maison n'y pousse. Les 4 branches maîtresses partent de son plancher.
- **La feuille-maison** : une seule grande feuille enroulée (sa base sort de l'écorce au bord du chemin, elle s'étend en plancher, remonte derrière et retombe en toit au-dessus de l'entrée). On y entre depuis le chemin. Les maisons s'alignent des deux côtés du chemin, en alternance.

## Comment l'arbre grandit (`shared/arbre.js`)
1. Au départ : le tronc, la capitale, 4 branches maîtresses et une seule maison.
2. Chaque arrivée prend la place libre la plus proche sur le chemin le moins chargé. La branche s'allonge pour la porter et s'épaissit avec le poids de ce qu'elle porte. Une maison ne bouge jamais.
3. Quand tous les chemins sont pleins, l'arbre pousse, toujours le plus près possible de la capitale :
   - un **rameau** part du dessus d'une branche, s'écarte et monte doucement ; il porte à son tour des maisons et ses propres brindilles ;
   - une **branche d'étage** sort du tronc plus haut. Elle n'existe que si un **pont** peut y monter depuis une branche plus basse.
4. En grandissant, l'arbre jette des **ponts entre des branches voisines** quand ils raccourcissent vraiment les trajets. Ce sont des chemins praticables directement, en pente douce.
5. Chaque nouveau chemin est vérifié : pente douce, pas de collision avec une autre branche, le tronc, la capitale ou une maison.

## Code
- `shared/arbre.js` : croissance, chemins (ligne de faîte, section, rayon), maisons, collisions, distances à pied.
- `shared/sol.js` : la gravité (surface praticable la plus haute sous la boule, bois infranchissable). `shared/marche.js` : la boule qui marche.
- `shared/maison.js` : la forme de la feuille-maison et son plancher. `shared/courbe.js` : courbes et repères.
- `js/monde/` : rendu three.js (`main.js`), branches et tronc (`tube.js`), maisons (`maisons3d.js`), capitale (`capitale3d.js`), caméra (`camera.js`), commandes (`commandes.js`), ciel et textures.
- `test/` : croissance (pentes, raccords, collisions, connexions) et marche réelle de la boule de maison en maison, par la capitale et les ponts.

Vision cible : `docs/vision.png`.
