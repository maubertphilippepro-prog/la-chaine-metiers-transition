import type { CiblePublication, FondVignette, PoseVignette, Publication, StatutPublication, VideoPubliee, Vignette } from '../../../noyau/publication';
import { diffusion, memeQualification, type Diffusion, type DiffusionSite, type DiffusionYoutube, type Nature, type Qualification } from '../../../noyau/qualification';
import type { VisibiliteYoutube } from '../../../noyau/youtube';

export const LIBELLES_NATURE: Record<Nature, string> = { pro: 'Pro', perso: 'Perso' };

const RESUME_YOUTUBE: Record<DiffusionYoutube, string> = {
  aucun: 'aucun envoi',
  'non-repertoriee': 'Non répertoriée',
  privee: 'Privée',
  publique: 'Publique ou Programmée',
};
const RESUME_SITE: Record<DiffusionSite, string> = {
  fichier: 'fichier vidéo, réservé aux comptes autorisés',
  lien: 'lien YouTube, visible de tous',
  aucun: 'rien',
};

// Diffusion déduite de la qualification, en une ligne sous ses contrôles.
export const resumeDiffusion = (d: Diffusion) => `YouTube : ${RESUME_YOUTUBE[d.youtube]} · Site : ${RESUME_SITE[d.site]}`;

export const EXPLICATIONS_RELAIS: Record<Exclude<DiffusionSite, 'aucun'>, string> = {
  fichier: 'Le fichier vidéo et la vignette sont envoyés sur le site, visibles des seuls comptes autorisés. '
    + 'Un nouveau relais renvoie le fichier et met à jour la fiche.',
  lien: 'La vidéo YouTube est intégrée au site, visible de tous, une fois lisible par lien sur YouTube. '
    + 'Un nouveau relais met à jour la fiche.',
};

export const EXPLICATION_RETRAIT = 'Vidéo passée en Perso : elle doit être retirée du site, où elle est encore visible.';
export const CONFIRMATION_RETRAIT = 'Cette vidéo est sur le site : la passer en Perso la retirera du site.';

// Une requalification qui fait sortir du site une vidéo qui y est demande confirmation, puis le retrait.
export const requalificationRetire = (v: VideoPubliee, q: Qualification) =>
  v.replit.id !== null && diffusion(v).site !== 'aucun' && diffusion(q).site === 'aucun';

export const LIBELLES_STATUT: Record<StatutPublication, string> = {
  'a-preparer': 'À préparer',
  prete: 'Prête',
  'envoyee-youtube': 'Envoyée sur YouTube',
  relayee: 'Relayée sur le site',
  erreur: 'Erreur',
};

export const libelleCible = (c: CiblePublication) => (c === 'complete' ? 'Vidéo complète' : `Épisode ${c}`);

export const tagsDepuisTexte = (texte: string) => texte.split(',').map(t => t.trim()).filter(t => t !== '');
export const texteDepuisTags = (tags: string[]) => tags.join(', ');

// Les vidéos qui suivaient l’ancienne qualification par défaut prennent la nouvelle, sauf celles déjà sur le site :
// elles se requalifient une par une, avec confirmation du retrait.
export function changerQualificationParDefaut(p: Publication, q: Qualification): Publication {
  return {
    ...p,
    qualificationParDefaut: q,
    videos: p.videos.map(v => (memeQualification(v, p.qualificationParDefaut) && v.replit.id === null ? { ...v, ...q } : v)),
  };
}

// Pose et fond de départ d’une vignette : les siens, sinon ceux de la vidéo complète, sinon la première pose de la banque et la charte.
export function baseVignette(
  vignette: Vignette | null, complete: Vignette | null, premierePose: string | undefined,
): { pose: PoseVignette | null; fond: FondVignette } {
  const source = vignette ?? complete;
  if (source) return { pose: source.pose, fond: source.fond };
  return { pose: premierePose ? { source: 'banque', fichier: premierePose } : null, fond: { source: 'charte' } };
}

export const LIBELLES_VISIBILITE: Record<VisibiliteYoutube, string> = {
  privee: 'Privée', 'non-repertoriee': 'Non répertoriée', publique: 'Publique', programmee: 'Programmée',
};

// Champ « datetime-local » (heure locale, sans fuseau) ↔ date ISO enregistrée.
export function isoDepuisLocal(valeur: string): string | null {
  if (!valeur) return null;
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function localDepuisIso(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const deux = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}T${deux(d.getHours())}:${deux(d.getMinutes())}`;
}
