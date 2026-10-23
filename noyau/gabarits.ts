// Mises en page de la vignette, et règles pour les proposer à l'auteur.

// Ordre de proposition : les gabarits les plus riches d'abord.
export const GABARITS = ['vitrine', 'demonstration', 'mosaique', 'classique'] as const;
export type Gabarit = (typeof GABARITS)[number];

// Logos et captures posés sur une vignette, au plus.
export const MAX_ELEMENTS = 3;

export const LIBELLES_GABARIT: Record<Gabarit, string> = {
  vitrine: 'Vitrine', demonstration: 'Démonstration', mosaique: 'Mosaïque', classique: 'Classique',
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
