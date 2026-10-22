import { nomCible, problemesPreparation, retraitAFaire, type CiblePublication, type ReglagesPublication, type VideoPubliee } from './publication';
import { diffusion, type DiffusionYoutube, type Qualification } from './qualification';

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
const STATUTS_VALIDES: VideoPubliee['statut'][] = ['prete', 'envoyee-youtube', 'relayee'];
type AvecYoutube = Exclude<DiffusionYoutube, 'aucun'>;

export const SANS_YOUTUBE = 'Une vidéo Pro confidentielle ne va pas sur YouTube : elle est seulement relayée sur le site.';
export const RETRAIT_D_ABORD = 'Retirez d’abord la vidéo du site.';

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

const VISIBILITES: Record<DiffusionYoutube, VisibiliteYoutube[]> = {
  aucun: [],
  'non-repertoriee': ['non-repertoriee'],
  privee: ['privee'],
  publique: ['publique', 'programmee'],
};

export const visibilitesIndiquees = (q: Qualification): VisibiliteYoutube[] => VISIBILITES[diffusion(q).youtube];

// Cochée et validée : prête à partir sur YouTube ou sur le site, ou à y être mise à jour.
export const validee = (v: VideoPubliee) => v.publier && STATUTS_VALIDES.includes(v.statut);

export const pretePourYoutube = (v: VideoPubliee) => validee(v) && diffusion(v).youtube !== 'aucun' && !retraitAFaire(v);

export const dossierYoutube = (c: CiblePublication) => `publication/${nomCible(c)}`;

// Contrôles communs à l’envoi sur YouTube et au relais sur le site.
export function problemesDiffusion(
  v: VideoPubliee, descriptionFinale: string, r: ReglagesPublication,
  etat: { rendu: { fichier: string; present: boolean }; octetsVignette: number | null },
): string[] {
  const problemes: string[] = [];
  if (!v.publier) problemes.push('Vidéo non cochée pour la publication.');
  if (!STATUTS_VALIDES.includes(v.statut)) problemes.push('Vidéo pas encore validée pour la publication.');
  if (!etat.rendu.present) problemes.push(`Rendu absent : ${etat.rendu.fichier}.`);
  problemes.push(...problemesPreparation(v, descriptionFinale, r, etat.octetsVignette !== null));
  if (etat.octetsVignette !== null && etat.octetsVignette > r.vignetteOctetsMax) {
    problemes.push(`Vignette trop lourde : ${etat.octetsVignette} octets, ${r.vignetteOctetsMax} au plus.`);
  }
  return problemes;
}

export function problemesEnvoi(
  v: VideoPubliee, descriptionFinale: string, r: ReglagesPublication,
  etat: { rendu: { fichier: string; present: boolean }; octetsVignette: number | null },
): string[] {
  return [
    ...(diffusion(v).youtube === 'aucun' ? [SANS_YOUTUBE] : []),
    ...(retraitAFaire(v) ? [RETRAIT_D_ABORD] : []),
    ...problemesDiffusion(v, descriptionFinale, r, etat),
  ];
}

const CONSIGNE_VISIBILITE: Record<AvecYoutube, string> = {
  'non-repertoriee': 'Non répertoriée (Pro non confidentielle : jamais publique ; relayée sur le site une fois l’URL enregistrée)',
  privee: 'Privée (Perso confidentielle : jamais publique ni non répertoriée)',
  publique: 'Publique, ou Programmée à la date voulue (Perso non confidentielle)',
};

export function textesYoutube(
  v: VideoPubliee, descriptionFinale: string, o: { playlist: string | null; cheminRendu: string },
): TextesYoutube {
  const d = diffusion(v).youtube;
  if (d === 'aucun') throw new Error(SANS_YOUTUBE);
  const reglages = [
    'Réglages à choisir dans YouTube Studio',
    '',
    `Fichier vidéo : ${o.cheminRendu}`,
    `Visibilité : ${CONSIGNE_VISIBILITE[d]}`,
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

const REFUS_VISIBILITE: Record<AvecYoutube, string> = {
  'non-repertoriee': 'Une vidéo Pro non confidentielle est non répertoriée sur YouTube.',
  privee: 'Une vidéo Perso confidentielle reste privée sur YouTube.',
  publique: 'Une vidéo Perso non confidentielle est publique ou programmée sur YouTube.',
};

export function raisonEnvoi(v: VideoPubliee, e: EnvoiYoutube): string | null {
  if (!validee(v)) return 'Validez d’abord la vidéo pour la publication.';
  const d = diffusion(v).youtube;
  if (d === 'aucun') return SANS_YOUTUBE;
  if (retraitAFaire(v)) return RETRAIT_D_ABORD;
  if (!VISIBILITES[d].includes(e.visibilite)) return REFUS_VISIBILITE[d];
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
  const d = diffusion(v).youtube;
  if (d === 'non-repertoriee') {
    // oEmbed lit une vidéo non répertoriée comme une publique : le réglage se vérifie dans YouTube Studio.
    return publique
      ? { alerte: false, message: 'Vidéo lisible par lien. Vérifiez dans YouTube Studio qu’elle est bien Non répertoriée.' }
      : { alerte: true, message: 'Vidéo pas encore lisible : passez-la en Non répertoriée dans YouTube Studio.' };
  }
  // Privée, ou Pro confidentielle déjà envoyée sur YouTube avant sa requalification : elle doit rester privée.
  if (d === 'privee' || d === 'aucun') {
    return publique
      ? { alerte: true, message: 'Vidéo lisible publiquement : passez-la en privé dans YouTube Studio.' }
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
