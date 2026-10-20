import type { CiblePublication, FondVignette, PoseVignette, Profil, Publication, StatutPublication, Vignette } from '../../../noyau/publication';

export const LIBELLES_PROFIL: Record<Profil, string> = { interne: 'Interne', perso: 'Perso', mixte: 'Mixte' };

export const EXPLICATIONS_PROFIL: Record<Profil, string> = {
  interne: 'Contenu confidentiel : privée sur YouTube, fichier envoyé sur le site, réservé aux comptes autorisés.',
  perso: 'Contenu personnel : publique sur YouTube, rien sur le site.',
  mixte: 'Contenu sans risque : publique sur YouTube, puis relayée sur le site.',
};

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

// Les vidéos qui suivaient l'ancien profil par défaut prennent le nouveau ; les autres gardent le leur.
export function changerProfilParDefaut(p: Publication, profil: Profil): Publication {
  return {
    ...p,
    profilParDefaut: profil,
    videos: p.videos.map(v => (v.profil === p.profilParDefaut ? { ...v, profil } : v)),
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
