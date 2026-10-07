import type { EncartImages } from '../noyau/decisions';

export const TRANSITION_LOGO = 10;
export const DECALAGE_LOGO = 300;

// Micro-fondu aux raccords pour éviter les clics : rampe sur `fondu` images à chaque extrémité.
export function volumeRaccord(image: number, duree: number, fondu: number): number {
  const entree = (image + 0.5) / fondu;
  const sortie = (duree - image - 0.5) / fondu;
  return Math.max(0, Math.min(1, entree, sortie));
}

// Le logo (en haut à droite) descend sous un encart affiché en haut.
export function decalageLogo(image: number, encarts: EncartImages[]): number {
  let facteur = 0;
  for (const e of encarts) {
    if (e.position !== 'haut') continue;
    const montee = (image - (e.debut - TRANSITION_LOGO)) / TRANSITION_LOGO;
    const descente = (e.debut + e.duree + TRANSITION_LOGO - image) / TRANSITION_LOGO;
    facteur = Math.max(facteur, Math.max(0, Math.min(1, montee, descente)));
  }
  return facteur * DECALAGE_LOGO;
}
