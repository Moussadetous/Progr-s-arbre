// Générateur pseudo-aléatoire déterministe (mulberry32)
// Un seed fixe garantit que l'arbre généré est toujours le même,
// ce qui permet de placer les lieux à découvrir de façon stable.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) { this.next = mulberry32(seed); }

  // Nombre aléatoire dans [0,1)
  f() { return this.next(); }

  // Nombre aléatoire dans [min,max)
  range(min, max) { return min + this.next() * (max - min); }

  // Nombre entier dans [min,max] inclus
  int(min, max) { return Math.floor(this.range(min, max + 1)); }

  // Vrai avec la probabilité donnée
  chance(p) { return this.next() < p; }

  // Élément aléatoire d'un tableau
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }

  // Angle aléatoire
  angle() { return this.next() * Math.PI * 2; }
}
