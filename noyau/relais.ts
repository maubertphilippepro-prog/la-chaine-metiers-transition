import type { ReglagesPublication, VideoPubliee } from './publication';
import { diffusion } from './qualification';
import { bilanLecture, problemesDiffusion, type LectureYoutube } from './youtube';

// Vidéo sur le site : fichier hébergé dans son stockage (Pro confidentielle) ou vidéo YouTube intégrée (Pro non confidentielle).
// L’autre champ part à null : une vidéo qui change de forme ne garde rien de l’ancienne.
export type FichierVideoSite = { videoUrl: string; videoObject: null } | { videoObject: string; videoUrl: null };

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

export type EtatRelais = Parameters<typeof problemesDiffusion>[3] & { siteConfigure: boolean };

const STATUTS_LIEN: VideoPubliee['statut'][] = ['envoyee-youtube', 'relayee'];

export const urlYoutube = (id: string) => `https://www.youtube.com/watch?v=${id}`;

export function problemesRelais(v: VideoPubliee, descriptionFinale: string, r: ReglagesPublication, etat: EtatRelais): string[] {
  const site = diffusion(v).site;
  if (site === 'aucun') return ['Une vidéo Perso n’est pas relayée sur le site.'];
  const problemes = problemesDiffusion(v, descriptionFinale, r, etat);
  if (site === 'lien' && (!STATUTS_LIEN.includes(v.statut) || !v.youtube.id)) {
    problemes.push('Enregistrez d’abord l’envoi sur YouTube : une vidéo Pro non confidentielle est relayée avec son lien YouTube.');
  }
  if (v.replit.categorieId === null) problemes.push('Choisissez la catégorie du site.');
  if (!etat.siteConfigure) problemes.push('Site non configuré : renseignez REPLIT_SITE_URL et REPLIT_API_KEY dans .env, puis relancez le studio.');
  return problemes;
}

// Une vidéo relayée avec son lien YouTube ne l’est que lisible par lien, vérifié par oEmbed au moment du relais.
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
    visibility: diffusion(v).site === 'fichier' ? 'interne' : 'public',
    ...o.fichier,
    thumbnailObject: o.thumbnailObject,
  };
}

export const enregistrerRelais = (v: VideoPubliee, id: number): Partial<VideoPubliee> =>
  ({ statut: 'relayee', replit: { ...v.replit, id }, erreur: null });

// Vidéo retirée du site : plus d’identifiant ni de catégorie, et le statut d’avant le relais.
export function enregistrerRetrait(v: VideoPubliee): Partial<VideoPubliee> {
  const statut = v.statut === 'relayee' ? (v.youtube.id ? 'envoyee-youtube' : 'prete') : v.statut;
  return { statut, replit: { id: null, categorieId: null, playlistId: null }, erreur: null };
}
