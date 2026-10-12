# L'Arbre

Un seul arbre géant. Chaque personne est une **grande feuille**. La personne, elle, est une **boule minuscule** qui se promène sur l'arbre.

## Lancer
```
node server/statique.js     # puis ouvrir http://localhost:3000
npm test                    # règles de croissance + marche
```
Aucune dépendance (three.js est dans `vendor/`).

## Commandes
- **Marcher** : ZQSD, WASD ou flèches · manette (stick gauche) · joystick à l'écran sur mobile. `Maj` pour courir.
- **Regarder** : glisser (souris ou doigt) · stick droit. **Zoom** : molette, pincement, `+` / `-`, gâchettes.
- `V` voir tout l'arbre · `H` retour chez soi · `N` / `M` : simuler 1 / 10 arrivées (ou `?dev=1` pour des boutons).

## Le concept
- Un tronc, la **capitale** (la place autour du tronc, sans feuilles) et **4 branches** par défaut.
- Une personne = une feuille, à un emplacement fixe d'une branche (alternance gauche/droite). Une feuille ne bouge jamais.
- Une branche s'allonge et s'épaissit avec ses feuilles. Quand toutes les branches sont pleines, **une nouvelle branche pousse sur le tronc**.
- La boule est si petite qu'elle ne perçoit pas l'orientation de l'arbre : comme une personne sur la Terre, le « haut » est toujours la surface sous ses pieds. La caméra suit cette règle ; de loin, le monde se redresse.
- La boule marche librement sur : une feuille (tige comprise), une branche (tout autour), le tronc, la place de la capitale. Elle passe d'une surface à l'autre en marchant.

## Code
- `shared/monde-arbre.js` : croissance, géométrie des branches et des feuilles.
- `shared/marche.js` : la boule sur les surfaces et les passages de l'une à l'autre.
- `js/monde/` : rendu three.js (`main.js`), caméra « personne sur la Terre » (`camera.js`), commandes (`commandes.js`), ciel, textures, tubes.
- `test/monde.test.js` : règles de croissance et marche.

Vision cible : `docs/vision.png`.
