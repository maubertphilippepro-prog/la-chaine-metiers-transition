import type { CiblePublication, FondVignette, PoseVignette, Profil, Publication, StatutPublication, Vignette } from '../../../noyau/publication';
import type { VisibiliteYoutube } from '../../../noyau/youtube';

export const LIBELLES_PROFIL: Record<Profil, string> = { interne: 'Interne', perso: 'Perso', mixte: 'Mixte' };

export const EXPLICATIONS_PROFIL: Record<Profil, string> = {
  interne: 'Contenu confidentiel : privée sur YouTube, fichier envoyé sur le site, réservé aux comptes autorisés.',
  perso: 'Contenu personnel : publique sur YouTube, rien sur le site.',
  mixte: 'Contenu sans risque : publique sur YouTube, puis relayée sur le site.',
};

export const EXPLICATIONS_RELAIS: Record<Exclude<Profil, 'perso'>, string> = {
  interne: 'Le fichier vidéo et la vignette sont envoyés sur le site, visibles des seuls comptes autorisés. '
    + 'Un nouveau relais renvoie le fichier et met à jour la fiche.',
  mixte: 'La vidéo YouTube est intégrée au site, visible de tous, une fois lisible publiquement sur YouTube. '
    + 'Un nouveau relais met à jour la fiche.',
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

export const LIBELLES_VISIBILITE: Record<VisibiliteYoutube, string> = { privee: 'Privée', publique: 'Publique', programmee: 'Programmée' };

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
