// Qualification d’une vidéo par l’auteur et diffusion qu’en déduit l’app : la grille ne vit qu’ici.
export type Nature = 'pro' | 'perso';

export interface Qualification {
  nature: Nature;
  confidentielle: boolean;
}

// 'publique' admet aussi la programmation.
export type DiffusionYoutube = 'aucun' | 'non-repertoriee' | 'privee' | 'publique';
// Fichier hébergé sur le site (comptes autorisés), lien YouTube intégré (visible de tous), ou rien.
export type DiffusionSite = 'fichier' | 'lien' | 'aucun';

export interface Diffusion {
  youtube: DiffusionYoutube;
  site: DiffusionSite;
}

export const NATURES: Nature[] = ['pro', 'perso'];
export const QUALIFICATION_PAR_DEFAUT: Qualification = { nature: 'perso', confidentielle: false };

export function diffusion(q: Qualification): Diffusion {
  if (q.nature === 'pro') return q.confidentielle ? { youtube: 'aucun', site: 'fichier' } : { youtube: 'non-repertoriee', site: 'lien' };
  return { youtube: q.confidentielle ? 'privee' : 'publique', site: 'aucun' };
}

export const memeQualification = (a: Qualification, b: Qualification) => a.nature === b.nature && a.confidentielle === b.confidentielle;

// Profils de publication.json version 1.
const DEPUIS_PROFIL = new Map<string, Qualification>([
  ['interne', { nature: 'pro', confidentielle: true }],
  ['mixte', { nature: 'pro', confidentielle: false }],
  ['perso', { nature: 'perso', confidentielle: false }],
]);

export function qualificationDepuisProfil(profil: unknown): Qualification | null {
  const q = typeof profil === 'string' ? DEPUIS_PROFIL.get(profil) : undefined;
  return q ? { ...q } : null;
}
