import { nomFichierEpisode } from './nommage';
import type { Reglages } from './types';

export type Profil = 'interne' | 'perso' | 'mixte';
export type StatutPublication = 'a-preparer' | 'prete' | 'envoyee-youtube' | 'relayee' | 'erreur';
// Vidéo complète ou numéro d'épisode (1, 2…), comme la cible du rendu.
export type CiblePublication = 'complete' | number;

export type PoseVignette = { source: 'banque'; fichier: string } | { source: 'camera'; instant: number };
export type FondVignette = { source: 'ecran'; instant: number } | { source: 'charte' };

export interface Vignette {
  pose: PoseVignette;
  fond: FondVignette;
  accroche: string;
  // rendus/vignettes/<cible>.jpg une fois rendue ; null tant qu'elle ne l'est pas.
  fichier: string | null;
}

export interface VideoPubliee {
  cible: CiblePublication;
  publier: boolean;
  profil: Profil;
  statut: StatutPublication;
  titre: string;
  variantesTitre: string[];
  description: string;
  tags: string[];
  accroches: string[];
  vignette: Vignette | null;
  youtube: { id: string | null; visibilite: 'privee' | 'publique' | 'programmee'; programmeeLe: string | null; playlistId: string | null };
  replit: { id: number | null; categorieId: number | null; playlistId: number | null };
  erreur: { etape: 'vignette' | 'youtube' | 'replit'; message: string; le: string } | null;
}

export interface Publication {
  version: 1;
  profilParDefaut: Profil;
  videos: VideoPubliee[];
}

export type ReglagesPublication = Reglages['publication'];

// Adresses (sans barre finale) qui servent le dossier du tournage et la banque de poses.
export interface BasesImages {
  tournage: string;
  poses: string;
}

export const PROFILS: Profil[] = ['interne', 'perso', 'mixte'];
const STATUTS: StatutPublication[] = ['a-preparer', 'prete', 'envoyee-youtube', 'relayee', 'erreur'];

export function videoParDefaut(cible: CiblePublication, profil: Profil): VideoPubliee {
  return {
    cible,
    publier: cible === 'complete',
    profil,
    statut: 'a-preparer',
    titre: '',
    variantesTitre: [],
    description: '',
    tags: [],
    accroches: [],
    vignette: null,
    youtube: { id: null, visibilite: 'privee', programmeeLe: null, playlistId: null },
    replit: { id: null, categorieId: null, playlistId: null },
    erreur: null,
  };
}

// Une entrée par vidéo rendue, dans l'ordre des cibles : les vidéos d'un montage précédent qui n'existent plus disparaissent.
export function accorderPublication(p: Publication | null, cibles: CiblePublication[]): Publication {
  const profil = p?.profilParDefaut ?? 'perso';
  return {
    version: 1,
    profilParDefaut: profil,
    videos: cibles.map(c => p?.videos.find(v => v.cible === c) ?? videoParDefaut(c, profil)),
  };
}

export function modifierVideo(p: Publication, cible: CiblePublication, changement: Partial<VideoPubliee>): Publication {
  return { ...p, videos: p.videos.map(v => (v.cible === cible ? { ...v, ...changement } : v)) };
}

// Ce qui distingue deux vignettes à l'image : pose, fond et accroche (pas le fichier rendu).
export function cleVignette(v: Vignette | null): string {
  if (!v) return '';
  const pose = v.pose.source === 'banque' ? `banque:${v.pose.fichier}` : `camera:${v.pose.instant}`;
  const fond = v.fond.source === 'ecran' ? `ecran:${v.fond.instant}` : 'charte';
  return `${pose}|${fond}|${v.accroche}`;
}

// Modifications venues du studio : statut, fichier de vignette, états YouTube et Replit et erreur ne changent
// que par les routes du serveur ; une vidéo prête dont le contenu change revient à préparer.
export function appliquerModifications(ancienne: Publication, nouvelle: Publication): Publication {
  return {
    ...nouvelle,
    videos: nouvelle.videos.map(n => {
      const a = ancienne.videos.find(v => v.cible === n.cible) ?? videoParDefaut(n.cible, nouvelle.profilParDefaut);
      const memeImage = cleVignette(a.vignette) === cleVignette(n.vignette);
      const vignette = n.vignette && { ...n.vignette, fichier: memeImage ? (a.vignette?.fichier ?? null) : null };
      const change = a.profil !== n.profil || a.titre !== n.titre || a.description !== n.description
        || a.tags.join('\n') !== n.tags.join('\n') || !memeImage;
      return {
        ...n,
        vignette,
        statut: a.statut === 'prete' && change ? 'a-preparer' : a.statut,
        youtube: a.youtube,
        replit: { ...n.replit, id: a.replit.id },
        erreur: a.erreur,
      };
    }),
  };
}

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const estTexte = (v: unknown): v is string => typeof v === 'string';
const listeDeTextes = (v: unknown) => Array.isArray(v) && v.every(estTexte);
const estInstant = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const estId = (v: unknown) => v === null || (typeof v === 'number' && Number.isInteger(v));

function raisonVignette(v: unknown): string | null {
  if (v === null) return null;
  if (!estObjet(v) || !estObjet(v.pose) || !estObjet(v.fond)) return 'vignette : pose et fond attendus';
  const pose = v.pose;
  const poseValide = (pose.source === 'banque' && estTexte(pose.fichier) && pose.fichier !== '' && !/[\\/]/.test(pose.fichier))
    || (pose.source === 'camera' && estInstant(pose.instant));
  if (!poseValide) return 'vignette : pose invalide';
  if (!(v.fond.source === 'charte' || (v.fond.source === 'ecran' && estInstant(v.fond.instant)))) return 'vignette : fond invalide';
  if (!estTexte(v.accroche)) return 'vignette : accroche attendue';
  if (v.fichier !== null && !estTexte(v.fichier)) return 'vignette : fichier invalide';
  return null;
}

export function raisonPublication(p: unknown): string | null {
  if (!estObjet(p)) return 'objet attendu';
  if (p.version !== 1) return 'version 1 attendue';
  if (!PROFILS.includes(p.profilParDefaut as Profil)) return 'profilParDefaut invalide';
  if (!Array.isArray(p.videos)) return 'videos doit être une liste';
  for (const [i, v] of p.videos.entries()) {
    const ou = `videos[${i}]`;
    if (!estObjet(v)) return `${ou} : objet attendu`;
    if (v.cible !== 'complete' && !(Number.isInteger(v.cible) && (v.cible as number) >= 1)) return `${ou} : cible invalide`;
    if (typeof v.publier !== 'boolean') return `${ou} : publier doit être vrai ou faux`;
    if (!PROFILS.includes(v.profil as Profil)) return `${ou} : profil invalide`;
    if (!STATUTS.includes(v.statut as StatutPublication)) return `${ou} : statut invalide`;
    for (const champ of ['titre', 'description']) if (!estTexte(v[champ])) return `${ou} : ${champ} doit être un texte`;
    for (const champ of ['variantesTitre', 'tags', 'accroches']) if (!listeDeTextes(v[champ])) return `${ou} : ${champ} doit être une liste de textes`;
    const vignette = raisonVignette(v.vignette);
    if (vignette) return `${ou} : ${vignette}`;
    if (!estObjet(v.youtube) || !estObjet(v.replit)) return `${ou} : youtube et replit attendus`;
    if (!estId(v.replit.id) || !estId(v.replit.categorieId) || !estId(v.replit.playlistId)) return `${ou} : identifiants du site invalides`;
  }
  const cles = p.videos.map(v => String((v as Record<string, unknown>).cible));
  if (new Set(cles).size !== cles.length) return 'une vidéo apparaît deux fois';
  return null;
}

export const nomCible = (c: CiblePublication) => (c === 'complete' ? 'complete' : `episode-${String(c).padStart(2, '0')}`);

export function fichierRendu(c: CiblePublication, titresEpisodes: string[]): string {
  return c === 'complete' ? 'video-complete.mp4' : nomFichierEpisode(c - 1, titresEpisodes[c - 1] ?? '');
}

export const fichierVignette = (c: CiblePublication) => `rendus/vignettes/${nomCible(c)}.jpg`;

const ms = (instant: number) => Math.round(instant * 1000);
export const imageEcran = (instant: number) => `publication/images/ecran-${ms(instant)}.png`;
export const imageCamera = (instant: number) => ({
  brute: `publication/images/camera-${ms(instant)}.png`,
  detouree: `publication/images/camera-${ms(instant)}.detoure.png`,
});
export const poseDetouree = (fichier: string) => `${fichier.replace(/\.[^.]+$/, '')}.detoure.png`;

export function urlsVignette(v: Vignette, b: BasesImages): { pose: string; fond: string | null } {
  return {
    pose: v.pose.source === 'banque'
      ? `${b.poses}/${encodeURIComponent(poseDetouree(v.pose.fichier))}`
      : `${b.tournage}/${imageCamera(v.pose.instant).detouree}`,
    fond: v.fond.source === 'ecran' ? `${b.tournage}/${imageEcran(v.fond.instant)}` : null,
  };
}

// Comme YouTube : tags séparés par des virgules, un tag contenant une espace compte ses guillemets.
export function longueurTags(tags: string[]): number {
  return tags.reduce((n, t) => n + t.length + (t.includes(' ') ? 2 : 0), 0) + Math.max(0, tags.length - 1);
}

export function mentionsTrouvees(textes: string[], mentions: string[]): string[] {
  const tout = textes.join('\n').toLowerCase();
  return mentions.filter(m => tout.includes(m.toLowerCase()));
}

export function problemesPreparation(
  v: VideoPubliee, descriptionFinale: string, r: ReglagesPublication, vignettePresente: boolean,
): string[] {
  const problemes: string[] = [];
  const titre = v.titre.trim();
  if (!titre) problemes.push('Titre vide.');
  else if (titre.length > r.titreMax) problemes.push(`Titre trop long : ${titre.length} caractères, ${r.titreMax} au plus.`);
  if (!v.description.trim()) problemes.push('Description vide.');
  else if (descriptionFinale.length > r.descriptionMax) {
    problemes.push(`Description trop longue avec les chapitres : ${descriptionFinale.length} caractères, ${r.descriptionMax} au plus.`);
  }
  const tags = longueurTags(v.tags);
  if (tags > r.tagsMax) problemes.push(`Tags trop longs : ${tags} caractères, ${r.tagsMax} au plus.`);
  if (!v.vignette) problemes.push('Vignette à composer.');
  else if (!v.vignette.fichier || !vignettePresente) problemes.push('Vignette à rendre.');
  if (v.profil !== 'interne') {
    for (const m of mentionsTrouvees([v.titre, v.description, ...v.tags], r.mentionsInterdites)) {
      problemes.push(`Mention interdite pour une vidéo publique : « ${m} ».`);
    }
  }
  return problemes;
}
