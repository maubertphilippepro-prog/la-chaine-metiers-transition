import type { Zone } from '../noyau/types';
import { HAUTEUR, LARGEUR } from './charte';

// Micro-fondu aux raccords pour éviter les clics : rampe sur `fondu` images à chaque extrémité.
export function volumeRaccord(image: number, duree: number, fondu: number): number {
  const rampe = Math.max(1, fondu);
  const entree = (image + 0.5) / rampe;
  const sortie = (duree - image - 0.5) / rampe;
  return Math.max(0, Math.min(1, entree, sortie));
}

// Volume du tapis : montée sur 1,5 s, descente sur les 2 dernières secondes.
export function volumeTapis(image: number, duree: number, fps: number, volume: number): number {
  const entree = image / (1.5 * fps);
  const sortie = (duree - image) / (2 * fps);
  return volume * Math.max(0, Math.min(1, entree, sortie));
}

// Avancement d'un élément : 0 → 1 sur `transition` images à l'entrée, 1 → 0 à la sortie, adouci (smoothstep).
export function progressionElement(image: number, duree: number, transition: number): number {
  const t = Math.min(transition, duree / 2);
  if (t <= 0) return 1;
  const lineaire = Math.max(0, Math.min(1, image / t, (duree - image) / t));
  return lineaire * lineaire * (3 - 2 * lineaire);
}

// À appliquer avec transform-origin en haut à gauche : translate(x, y) scale(echelle).
export interface Transformation {
  echelle: number;
  x: number;
  y: number;
}

// Le cadre visible passe de l'image entière à la zone (16:9), qui finit en plein cadre.
export function transformationZoom(zone: Zone, progression: number): Transformation {
  const largeurVisible = LARGEUR + (zone.largeur - LARGEUR) * progression;
  const echelle = LARGEUR / largeurVisible;
  return { echelle, x: -zone.x * progression * echelle, y: -zone.y * progression * echelle };
}

// La vignette caméra grandit jusqu'à deux fois sa taille, centrée dans l'image.
export function transformationCamera(vignette: Zone, progression: number): Transformation {
  const echelle = 1 + progression;
  const cibleX = (LARGEUR - 2 * vignette.largeur) / 2;
  const cibleY = (HAUTEUR - 2 * vignette.hauteur) / 2;
  const x = vignette.x + (cibleX - vignette.x) * progression;
  const y = vignette.y + (cibleY - vignette.y) * progression;
  return { echelle, x: x - vignette.x * echelle, y: y - vignette.y * echelle };
}

// Taille de l'accroche de la vignette (gras, capitales, colonne de 640 px) : plus grande quand elle est courte,
// et assez petite pour que son mot le plus long tienne sur une ligne (une capitale grasse fait environ 0,68 em).
export function tailleAccroche(texte: string): number {
  const longueur = texte.trim().length;
  const base = longueur <= 20 ? 120 : longueur <= 30 ? 100 : 84;
  const plusLongMot = Math.max(1, ...texte.split(/\s+/).map(m => m.length));
  return Math.min(base, Math.floor(640 / (0.68 * plusLongMot)));
}
