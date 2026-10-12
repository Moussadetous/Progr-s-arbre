// La fourmi de l'utilisateur : elle marche le long des branches, de nœud en nœud.
// Une nouvelle destination part de là où elle est : pas de téléportation.
import * as THREE from 'three';
import { rampeToon } from './cartoon.js';

const VITESSE = 2.4;
const DECALAGE = new THREE.Vector3(0, 0.24, 0); // elle marche "sur" la branche, pas dedans

// Petite fourmi de dessin animé : abdomen, thorax, tête, deux grands yeux et des antennes
export function creerFourmi(scene, teinte) {
  const rampe = rampeToon();
  const matCorps = new THREE.MeshToonMaterial({
    color: new THREE.Color().setHSL(teinte / 360, 0.7, 0.55),
    gradientMap: rampe,
  });
  const matBlanc = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: rampe });
  const matNoir = new THREE.MeshBasicMaterial({ color: 0x1d1a16 });

  const fourmi = new THREE.Group();
  const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), matCorps);
  abdomen.position.z = -0.2;
  abdomen.scale.set(1, 0.9, 1.1);
  const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), matCorps);
  const tete = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), matCorps);
  tete.position.z = 0.18;
  fourmi.add(abdomen, thorax, tete);

  for (const cote of [-1, 1]) {
    const blanc = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), matBlanc);
    blanc.position.set(cote * 0.055, 0.04, 0.27);
    const pupille = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), matNoir);
    pupille.position.set(cote * 0.055, 0.04, 0.315);
    const antenne = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), matNoir);
    antenne.position.set(cote * 0.05, 0.16, 0.25);
    antenne.rotation.z = -cote * 0.4;
    antenne.rotation.x = -0.5;
    fourmi.add(blanc, pupille, antenne);
  }

  scene.add(fourmi);
  return fourmi;
}

export class Promeneur {
  constructor(fourmi, graphe) {
    this.fourmi = fourmi;
    this.graphe = graphe;
    this.noeud = null; // dernier nœud atteint
    this.cles = null; // clés des points du trajet en cours
    this.points = null; // positions du trajet en cours
    this.cumul = null; // longueur parcourue au début de chaque point
    this.progres = 0;
    this.arrivee = null; // fonction appelée à l'arrivée
    this.cap = 0; // direction actuelle (en radians)
  }

  poser(cle) {
    this.noeud = cle;
    this.fourmi.position.copy(this.graphe.pos.get(cle)).add(DECALAGE);
  }

  // Indice du segment en cours de parcours
  segment() {
    let s = 0;
    while (s < this.cumul.length - 2 && this.cumul[s + 1] <= this.progres) s++;
    return s;
  }

  allerVers(cle, arrivee = null) {
    let depart = this.noeud;
    let debut = null;
    if (this.points) {
      // En marche : on finit le segment en cours, puis on repart de là
      depart = this.cles[this.segment() + 1];
      debut = this.fourmi.position.clone();
    }
    const chemin = this.graphe.chemin(depart, cle);
    if (!chemin) return false;

    this.cles = debut ? [null, ...chemin] : chemin;
    this.points = chemin.map((k) => this.graphe.pos.get(k).clone().add(DECALAGE));
    if (debut) this.points.unshift(debut);
    this.cumul = [0];
    for (let i = 1; i < this.points.length; i++) {
      this.cumul.push(this.cumul[i - 1] + this.points[i - 1].distanceTo(this.points[i]));
    }
    this.progres = 0;
    this.arrivee = arrivee;
    return true;
  }

  update(dt, t) {
    if (!this.points) return;
    this.progres += VITESSE * dt;
    const total = this.cumul[this.cumul.length - 1];

    if (this.progres >= total) {
      this.fourmi.position.copy(this.points[this.points.length - 1]);
      this.noeud = this.cles[this.cles.length - 1];
      this.points = null;
      const fin = this.arrivee;
      this.arrivee = null;
      if (fin) fin();
      return;
    }

    const s = this.segment();
    const a = this.points[s];
    const b = this.points[s + 1];
    const longueur = this.cumul[s + 1] - this.cumul[s] || 1e-6;
    const f = (this.progres - this.cumul[s]) / longueur;
    this.fourmi.position.lerpVectors(a, b, f);
    this.fourmi.position.y += Math.abs(Math.sin(t * 14)) * 0.035; // petit rebond des pattes

    // Elle tourne vers là où elle va
    const visee = Math.atan2(b.x - a.x, b.z - a.z);
    const ecart = Math.atan2(Math.sin(visee - this.cap), Math.cos(visee - this.cap));
    this.cap += ecart * Math.min(1, dt * 10);
    this.fourmi.rotation.y = this.cap;
  }
}
