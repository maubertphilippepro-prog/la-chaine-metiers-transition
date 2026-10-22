import type { ReglagesPublication, VideoPubliee } from './publication';
import { bilanLecture, problemesEnvoi, type LectureYoutube } from './youtube';

// Vidéo sur le site : fichier hébergé dans son stockage (Interne) ou vidéo YouTube intégrée (Mixte).
export type FichierVideoSite = { videoUrl: string } | { videoObject: string };

// Corps de POST /api/videos et PATCH /api/videos/:id du site (noms de son API).
export type CorpsVideoSite = {
  title: string;
  description: string;
  tags: string[];
  categoryId: number;
  playlistId: number | null;
  durationSeconds: number;
  format: 'long';
  status: 'published';
  visibility: 'public' | 'interne';
  thumbnailObject: string;
} & FichierVideoSite;

export type EtatRelais = Parameters<typeof problemesEnvoi>[3] & { siteConfigure: boolean };

const STATUTS_MIXTE: VideoPubliee['statut'][] = ['envoyee-youtube', 'relayee'];

export const urlYoutube = (id: string) => `https://www.youtube.com/watch?v=${id}`;

export function problemesRelais(v: VideoPubliee, descriptionFinale: string, r: ReglagesPublication, etat: EtatRelais): string[] {
  if (v.profil === 'perso') return ['Une vidéo Perso n’est pas relayée sur le site.'];
  const problemes = problemesEnvoi(v, descriptionFinale, r, etat);
  if (v.profil === 'mixte' && (!STATUTS_MIXTE.includes(v.statut) || !v.youtube.id)) {
    problemes.push('Enregistrez d’abord l’envoi sur YouTube : une vidéo Mixte est relayée une fois en ligne.');
  }
  if (v.replit.categorieId === null) problemes.push('Choisissez la catégorie du site.');
  if (!etat.siteConfigure) problemes.push('Site non configuré : renseignez REPLIT_SITE_URL et REPLIT_API_KEY dans .env, puis relancez le studio.');
  return problemes;
}

// Une vidéo Mixte n’est relayée que lisible publiquement, vérifié par oEmbed au moment du relais.
export const raisonLectureRelais = (v: VideoPubliee, lecture: LectureYoutube, maintenant: Date): string | null =>
  (lecture === 'publique' ? null : bilanLecture(v, lecture, maintenant).message);

export function corpsRelais(
  v: VideoPubliee, o: { dureeSecondes: number; fichier: FichierVideoSite; thumbnailObject: string },
): CorpsVideoSite {
  if (v.replit.categorieId === null) throw new Error('Catégorie du site manquante.');
  return {
    title: v.titre.trim(),
    // Sans les chapitres horodatés : ils ne servent qu’à YouTube.
    description: v.description.trim(),
    tags: v.tags,
    categoryId: v.replit.categorieId,
    playlistId: v.replit.playlistId,
    durationSeconds: Math.round(o.dureeSecondes),
    format: 'long',
    status: 'published',
    visibility: v.profil === 'interne' ? 'interne' : 'public',
    ...o.fichier,
    thumbnailObject: o.thumbnailObject,
  };
}

export const enregistrerRelais = (v: VideoPubliee, id: number): Partial<VideoPubliee> =>
  ({ statut: 'relayee', replit: { ...v.replit, id }, erreur: null });
