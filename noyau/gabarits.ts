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

// Logos saisis en texte libre (« Excel, Teams ») retrouvés dans la banque. Un nom qui désigne plusieurs fichiers est
// laissé à Claude, qui voit les logos.
export function resoudreLogos(texte: string, banque: string[]): { logos: string[]; introuvables: string[]; ambigus: string[] } {
  const logos: string[] = [];
  const introuvables: string[] = [];
  const ambigus: string[] = [];
  const cles = banque.map(f => ({ f, k: cle(f.replace(/\.[^.]+$/, '')) }));
  for (const nom of texte.split(/[,;\n]/).map(n => n.trim()).filter(n => n !== '')) {
    const k = cle(nom);
    const exact = cles.find(c => c.k === k);
    const partiels = cles.filter(c => c.k.includes(k));
    const trouve = exact?.f ?? (partiels.length === 1 ? partiels[0]!.f : undefined);
    if (trouve) { if (!logos.includes(trouve)) logos.push(trouve); }
    else if (partiels.length > 1) ambigus.push(nom);
    else introuvables.push(nom);
  }
  return { logos: logos.slice(0, MAX_ELEMENTS), introuvables, ambigus };
}
