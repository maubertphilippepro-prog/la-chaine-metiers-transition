import { nomCible, problemesPreparation, type CiblePublication, type Profil, type ReglagesPublication, type VideoPubliee } from './publication';

export type VisibiliteYoutube = VideoPubliee['youtube']['visibilite'];
// Résultat de la vérification par oEmbed : lisible sans compte, non lisible (privée, programmée, supprimée), ou YouTube injoignable.
export type LectureYoutube = 'publique' | 'non-publique' | 'inconnue';

export interface EnvoiYoutube {
  id: string;
  visibilite: VisibiliteYoutube;
  programmeeLe: string | null;
}

// Champs à copier dans YouTube Studio, rassemblés dans youtube.txt par ficheYoutube.
export interface TextesYoutube {
  titre: string;
  description: string;
  tags: string;
  reglages: string;
}

const ID = /^[A-Za-z0-9_-]{11}$/;
const STATUTS_ENVOI: VideoPubliee['statut'][] = ['prete', 'envoyee-youtube', 'relayee'];

export const FORMES_URL = 'Formes acceptées : youtube.com/watch?v=…, youtu.be/…, youtube.com/shorts/…, '
  + 'studio.youtube.com/video/…/edit, ou l’identifiant seul de 11 caractères.';

export function idYoutube(texte: string): string | null {
  const t = texte.trim();
  if (ID.test(t)) return t;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    return null;
  }
  const hote = url.hostname.toLowerCase().replace(/^(www|m)\./, '');
  const morceaux = url.pathname.split('/').filter(Boolean);
  let id: string | null | undefined = null;
  if (hote === 'youtube.com' && morceaux.length === 1 && morceaux[0] === 'watch') id = url.searchParams.get('v');
  else if (hote === 'youtube.com' && morceaux.length === 2 && morceaux[0] === 'shorts') id = morceaux[1];
  else if (hote === 'youtu.be' && morceaux.length === 1) id = morceaux[0];
  else if (hote === 'studio.youtube.com' && morceaux[0] === 'video') id = morceaux[1];
  return id && ID.test(id) ? id : null;
}

export const visibilitesIndiquees = (profil: Profil): VisibiliteYoutube[] =>
  (profil === 'interne' ? ['privee'] : ['publique', 'programmee']);

export const pretePourYoutube = (v: VideoPubliee) => v.publier && STATUTS_ENVOI.includes(v.statut);

export const dossierYoutube = (c: CiblePublication) => `publication/${nomCible(c)}`;

export function problemesEnvoi(
  v: VideoPubliee, descriptionFinale: string, r: ReglagesPublication,
  etat: { rendu: { fichier: string; present: boolean }; octetsVignette: number | null },
): string[] {
  const problemes: string[] = [];
  if (!v.publier) problemes.push('Vidéo non cochée pour la publication.');
  if (!STATUTS_ENVOI.includes(v.statut)) problemes.push('Vidéo pas encore validée pour la publication.');
  if (!etat.rendu.present) problemes.push(`Rendu absent : ${etat.rendu.fichier}.`);
  problemes.push(...problemesPreparation(v, descriptionFinale, r, etat.octetsVignette !== null));
  if (etat.octetsVignette !== null && etat.octetsVignette > r.vignetteOctetsMax) {
    problemes.push(`Vignette trop lourde : ${etat.octetsVignette} octets, ${r.vignetteOctetsMax} au plus.`);
  }
  return problemes;
}

const CONSIGNE_VISIBILITE: Record<Profil, string> = {
  interne: 'Privée (profil Interne : jamais publique ni non répertoriée)',
  perso: 'Publique, ou Programmée à la date voulue (profil Perso)',
  mixte: 'Publique, ou Programmée à la date voulue (profil Mixte : relayée sur le site une fois en ligne)',
};

export function textesYoutube(
  v: VideoPubliee, descriptionFinale: string, o: { playlist: string | null; cheminRendu: string },
): TextesYoutube {
  const reglages = [
    'Réglages à choisir dans YouTube Studio',
    '',
    `Fichier vidéo : ${o.cheminRendu}`,
    `Visibilité : ${CONSIGNE_VISIBILITE[v.profil]}`,
    'Catégorie : Science et technologie',
    'Langue de la vidéo : Français',
    'Audience : Non, cette vidéo n’est pas conçue pour les enfants',
    ...(o.playlist ? [`Playlist : ${o.playlist}`] : []),
  ];
  return { titre: v.titre.trim(), description: descriptionFinale, tags: v.tags.join(', '), reglages: reglages.join('\n') };
}

// Fichier youtube.txt du dossier : tous les champs à copier, dans l’ordre où YouTube Studio les demande.
export function ficheYoutube(t: TextesYoutube): string {
  const sections: [string, string][] = [['TITRE', t.titre], ['DESCRIPTION', t.description], ['TAGS', t.tags], ['RÉGLAGES', t.reglages]];
  return `${sections.map(([nom, texte]) => `=== ${nom} ===\n${texte}`).join('\n\n')}\n`;
}

export function raisonEnvoi(v: VideoPubliee, e: EnvoiYoutube): string | null {
  if (!pretePourYoutube(v)) return 'Validez d’abord la vidéo pour la publication.';
  if (!visibilitesIndiquees(v.profil).includes(e.visibilite)) {
    return v.profil === 'interne' ? 'Une vidéo Interne reste privée sur YouTube.' : 'Une vidéo Perso ou Mixte est publique ou programmée sur YouTube.';
  }
  if (e.visibilite === 'programmee') {
    if (!e.programmeeLe || Number.isNaN(Date.parse(e.programmeeLe))) return 'Date et heure de mise en ligne attendues.';
  } else if (e.programmeeLe !== null) {
    return 'Date de mise en ligne réservée à une vidéo programmée.';
  }
  return null;
}

export function enregistrerEnvoi(v: VideoPubliee, e: EnvoiYoutube): Partial<VideoPubliee> {
  return {
    statut: v.statut === 'relayee' ? 'relayee' : 'envoyee-youtube',
    youtube: { ...v.youtube, id: e.id, visibilite: e.visibilite, programmeeLe: e.programmeeLe },
    erreur: null,
  };
}

export function bilanLecture(v: VideoPubliee, lecture: LectureYoutube, maintenant: Date): { alerte: boolean; message: string } {
  if (lecture === 'inconnue') return { alerte: true, message: 'Vérification impossible : YouTube ne répond pas, réessayez plus tard.' };
  const publique = lecture === 'publique';
  if (v.profil === 'interne') {
    return publique
      ? { alerte: true, message: 'Vidéo Interne lisible publiquement : passez-la en privé dans YouTube Studio.' }
      : { alerte: false, message: 'Vidéo privée : elle n’est pas lisible publiquement.' };
  }
  if (publique) return { alerte: false, message: 'Vidéo en ligne, lisible publiquement.' };
  const heure = v.youtube.visibilite === 'programmee' && v.youtube.programmeeLe ? new Date(v.youtube.programmeeLe) : null;
  if (heure && heure > maintenant) {
    const date = heure.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });
    return { alerte: false, message: `Vidéo programmée : pas encore en ligne, mise en ligne prévue le ${date}.` };
  }
  return { alerte: true, message: 'Vidéo pas encore lisible publiquement : passez-la en public dans YouTube Studio, ou attendez l’heure programmée.' };
}
