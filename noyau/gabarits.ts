// Mises en page de la vignette, et règles pour les proposer à l'auteur.

// Ordre de proposition : les gabarits les plus riches d'abord.
export const GABARITS = ['vitrine', 'demonstration', 'mosaique', 'classique'] as const;
export type Gabarit = (typeof GABARITS)[number];

// Logos et captures posés sur une vignette, au plus.
export const MAX_ELEMENTS = 3;

export const LIBELLES_GABARIT: Record<Gabarit, string> = {
  vitrine: 'Vitrine', demonstration: 'Démonstration', mosaique: 'Mosaïque', classique: 'Classique',
};

// Ce que montre chaque gabarit et quand il est possible, pour Claude.
export const DESCRIPTIONS_GABARIT: Record<Gabarit, string> = {
  vitrine: 'pose au centre sur fond bleu dégradé, jusqu’à trois logos autour de la tête, accroche en bandeau rouge en bas ; possible dès un logo',
  demonstration: 'première capture en grande carte à gauche, premier logo épinglé dans son coin, pose à droite, accroche en bandeau dessous ; possible dès une capture',
  mosaique: 'accroche en haut à gauche, deux ou trois captures en éventail dessous, premier logo en tuile, pose à droite ; possible dès deux captures',
  classique: 'accroche en grand à gauche, pose en grand à droite, sans logo ni capture ; toujours possible',
};

const CONDITIONS: Record<Gabarit, (e: { logos: number; captures: number }) => boolean> = {
  vitrine: e => e.logos >= 1,
  demonstration: e => e.captures >= 1,
  mosaique: e => e.captures >= 2,
  classique: () => true,
};

// Gabarits possibles avec ces éléments ; ceux déjà pris par les autres vidéos de la publication passent en fin de liste.
export function gabaritsCompatibles(e: { logos: number; captures: number }, dejaUtilises: Gabarit[]): Gabarit[] {
  const possibles = GABARITS.filter(g => CONDITIONS[g](e));
  return [...possibles.filter(g => !dejaUtilises.includes(g)), ...possibles.filter(g => dejaUtilises.includes(g))];
}

// Le gabarit choisi tant qu'il reste possible, sinon le premier proposé.
export function gabaritRetenu(actuel: Gabarit | null, compatibles: Gabarit[]): Gabarit {
  return actuel && compatibles.includes(actuel) ? actuel : (compatibles[0] ?? 'classique');
}

const cle = (t: string) => t.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[\s_.-]+/g, '');

// Logos de la banque dont le nom (sans extension) est celui d'un logiciel cité, dans l'ordre de citation.
export function logosSuggeres(logiciels: string[], banque: string[]): string[] {
  const resultat: string[] = [];
  for (const logiciel of logiciels) {
    const logo = banque.find(f => cle(f.replace(/\.[^.]+$/, '')) === cle(logiciel));
    if (logo && !resultat.includes(logo)) resultat.push(logo);
  }
  return resultat.slice(0, MAX_ELEMENTS);
}
