import { GABARITS, MAX_ELEMENTS, type Gabarit } from './gabarits';
import { nomFichierEpisode } from './nommage';
import { diffusion, memeQualification, NATURES, QUALIFICATION_PAR_DEFAUT, qualificationDepuisProfil, type Nature, type Qualification } from './qualification';
import type { Reglages } from './types';

export type StatutPublication = 'a-preparer' | 'prete' | 'envoyee-youtube' | 'relayee' | 'erreur';
// Vidéo complète ou numéro d'épisode (1, 2…), comme la cible du rendu.
export type CiblePublication = 'complete' | number;

// Pose prise dans donnees/poses/ ; la forme { source, fichier } est celle des fichiers déjà enregistrés.
export type PoseVignette = { source: 'banque'; fichier: string };

export interface Vignette {
  pose: PoseVignette;
  accroche: string;
  gabarit: Gabarit;
  // Fichiers de donnees/logos/ et de captures/ du tournage, dans l'ordre choisi ; 3 au plus.
  logos: string[];
  captures: string[];
  // rendus/vignettes/<cible>.jpg une fois rendue ; null tant qu'elle ne l'est pas.
  fichier: string | null;
}

export interface VideoPubliee {
  cible: CiblePublication;
  publier: boolean;
  // Qualification choisie par l’auteur ; la diffusion s’en déduit (noyau/qualification.ts).
  nature: Nature;
  confidentielle: boolean;
  statut: StatutPublication;
  titre: string;
  variantesTitre: string[];
  description: string;
  tags: string[];
  accroches: string[];
  // Logiciels et services cités dans la vidéo, d'après la rédaction : servent à pré-cocher les logos.
  logiciels: string[];
  vignette: Vignette | null;
  youtube: { id: string | null; visibilite: 'privee' | 'non-repertoriee' | 'publique' | 'programmee'; programmeeLe: string | null; playlistId: string | null };
  replit: { id: number | null; categorieId: number | null; playlistId: number | null };
  erreur: { etape: 'vignette' | 'youtube' | 'replit'; message: string; le: string } | null;
}

export interface Publication {
  version: 2;
  qualificationParDefaut: Qualification;
  videos: VideoPubliee[];
}

export type ReglagesPublication = Reglages['publication'];

// Adresses (sans barre finale) qui servent le dossier du tournage, la banque de poses et celle de logos.
export interface BasesImages {
  tournage: string;
  poses: string;
  logos: string;
}

const STATUTS: StatutPublication[] = ['a-preparer', 'prete', 'envoyee-youtube', 'relayee', 'erreur'];

export function videoParDefaut(cible: CiblePublication, q: Qualification): VideoPubliee {
  return {
    cible,
    publier: cible === 'complete',
    nature: q.nature,
    confidentielle: q.confidentielle,
    statut: 'a-preparer',
    titre: '',
    variantesTitre: [],
    description: '',
    tags: [],
    accroches: [],
    logiciels: [],
    vignette: null,
    youtube: { id: null, visibilite: 'privee', programmeeLe: null, playlistId: null },
    replit: { id: null, categorieId: null, playlistId: null },
    erreur: null,
  };
}

// Une entrée par vidéo rendue, dans l'ordre des cibles : les vidéos d'un montage précédent qui n'existent plus disparaissent.
export function accorderPublication(p: Publication | null, cibles: CiblePublication[]): Publication {
  const q = p?.qualificationParDefaut ?? QUALIFICATION_PAR_DEFAUT;
  return {
    version: 2,
    qualificationParDefaut: { ...q },
    videos: cibles.map(c => p?.videos.find(v => v.cible === c) ?? videoParDefaut(c, q)),
  };
}

export function modifierVideo(p: Publication, cible: CiblePublication, changement: Partial<VideoPubliee>): Publication {
  return { ...p, videos: p.videos.map(v => (v.cible === cible ? { ...v, ...changement } : v)) };
}

// Ce qui distingue deux vignettes à l'image : pose, accroche, gabarit, logos et captures (pas le fichier rendu).
export function cleVignette(v: Vignette | null): string {
  if (!v) return '';
  return [v.pose.fichier, v.accroche, v.gabarit, v.logos.join(','), v.captures.join(',')].join('|');
}

// Modifications venues du studio : statut, fichier de vignette, états YouTube et Replit et erreur ne changent
// que par les routes du serveur ; une vidéo prête dont le contenu change revient à préparer.
export function appliquerModifications(ancienne: Publication, nouvelle: Publication): Publication {
  return {
    ...nouvelle,
    videos: nouvelle.videos.map(n => {
      const a = ancienne.videos.find(v => v.cible === n.cible) ?? videoParDefaut(n.cible, nouvelle.qualificationParDefaut);
      const memeImage = cleVignette(a.vignette) === cleVignette(n.vignette);
      const vignette = n.vignette && { ...n.vignette, fichier: memeImage ? (a.vignette?.fichier ?? null) : null };
      const change = !memeQualification(a, n) || a.titre !== n.titre || a.description !== n.description
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

// Vidéo encore sur le site alors que sa qualification ne l’y met plus (passée en Perso) : à retirer.
export const retraitAFaire = (v: VideoPubliee) => diffusion(v).site === 'aucun' && v.replit.id !== null;

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const estTexte = (v: unknown): v is string => typeof v === 'string';
const listeDeTextes = (v: unknown) => Array.isArray(v) && v.every(estTexte);
const estId = (v: unknown) => v === null || (typeof v === 'number' && Number.isInteger(v));

const estQualification = (q: unknown) => estObjet(q) && NATURES.includes(q.nature as Nature) && typeof q.confidentielle === 'boolean';

// publication.json version 1 (profils Interne, Perso, Mixte) lu comme une version 2 ; il est réécrit en version 2
// au prochain enregistrement. Une forme inattendue est rendue telle quelle : raisonPublication dira ce qui ne va pas.
function migrerVersion1(valeur: unknown): unknown {
  if (!estObjet(valeur) || valeur.version !== 1 || !Array.isArray(valeur.videos)) return valeur;
  const { profilParDefaut, ...reste } = valeur;
  return {
    ...reste,
    version: 2,
    qualificationParDefaut: qualificationDepuisProfil(profilParDefaut) ?? profilParDefaut,
    videos: valeur.videos.map((v: unknown) => {
      if (!estObjet(v)) return v;
      const { profil, ...autres } = v;
      return { ...autres, ...(qualificationDepuisProfil(profil) ?? {}) };
    }),
  };
}

// Champs venus après la version 2 (vignettes variées), absents des fichiers plus anciens. Le fond (charte ou écran),
// abandonné depuis, est ignoré.
function completerVideo(v: unknown): unknown {
  if (!estObjet(v)) return v;
  let vignette = v.vignette;
  if (estObjet(vignette)) {
    const { fond: _, ...reste } = vignette;
    vignette = { gabarit: 'classique', logos: [], captures: [], ...reste };
  }
  return { logiciels: [], ...v, vignette };
}

// publication.json tel que lu sur le disque ou reçu du studio, mis à la forme actuelle.
export function migrerPublication(valeur: unknown): unknown {
  const v2 = migrerVersion1(valeur);
  if (!estObjet(v2) || v2.version !== 2 || !Array.isArray(v2.videos)) return v2;
  return { ...v2, videos: v2.videos.map(completerVideo) };
}

const estNomFichier = (f: unknown) => estTexte(f) && f !== '' && !/[\\/]/.test(f);

function raisonVignette(v: unknown): string | null {
  if (v === null) return null;
  if (!estObjet(v) || !estObjet(v.pose)) return 'vignette : pose attendue';
  if (v.pose.source === 'camera') return 'vignette : pose caméra plus prise en charge, choisissez une pose de la banque';
  if (v.pose.source !== 'banque' || !estNomFichier(v.pose.fichier)) return 'vignette : pose invalide';
  if (!estTexte(v.accroche)) return 'vignette : accroche attendue';
  if (!GABARITS.includes(v.gabarit as Gabarit)) return 'vignette : gabarit invalide';
  for (const champ of ['logos', 'captures']) {
    const liste = v[champ];
    if (!(Array.isArray(liste) && liste.length <= MAX_ELEMENTS && liste.every(estNomFichier))) return `vignette : ${champ} invalides`;
  }
  if (v.fichier !== null && !estTexte(v.fichier)) return 'vignette : fichier invalide';
  return null;
}

export function raisonPublication(p: unknown): string | null {
  if (!estObjet(p)) return 'objet attendu';
  if (p.version !== 2) return 'version 2 attendue';
  if (!estQualification(p.qualificationParDefaut)) return 'qualificationParDefaut invalide';
  if (!Array.isArray(p.videos)) return 'videos doit être une liste';
  for (const [i, v] of p.videos.entries()) {
    const ou = `videos[${i}]`;
    if (!estObjet(v)) return `${ou} : objet attendu`;
    if (v.cible !== 'complete' && !(Number.isInteger(v.cible) && (v.cible as number) >= 1)) return `${ou} : cible invalide`;
    if (typeof v.publier !== 'boolean') return `${ou} : publier doit être vrai ou faux`;
    if (!NATURES.includes(v.nature as Nature)) return `${ou} : nature invalide`;
    if (typeof v.confidentielle !== 'boolean') return `${ou} : confidentielle doit être vrai ou faux`;
    if (!STATUTS.includes(v.statut as StatutPublication)) return `${ou} : statut invalide`;
    for (const champ of ['titre', 'description']) if (!estTexte(v[champ])) return `${ou} : ${champ} doit être un texte`;
    for (const champ of ['variantesTitre', 'tags', 'accroches', 'logiciels']) if (!listeDeTextes(v[champ])) return `${ou} : ${champ} doit être une liste de textes`;
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

export const poseDetouree = (fichier: string) => `${fichier.replace(/\.[^.]+$/, '')}.detoure.png`;

export const DOSSIER_CAPTURES = 'captures';

// Ce que la composition Remotion « Vignette » reçoit : gabarit, adresses HTTP des images, accroche.
export type ProprietesVignette = {
  gabarit: Gabarit;
  // Pose détourée (PNG transparent).
  poseUrl: string | null;
  logoUrls: string[];
  captureUrls: string[];
  accroche: string;
};

export function proprietesVignette(v: Vignette, b: BasesImages): ProprietesVignette {
  return {
    gabarit: v.gabarit,
    poseUrl: `${b.poses}/${encodeURIComponent(poseDetouree(v.pose.fichier))}`,
    logoUrls: v.logos.map(f => `${b.logos}/${encodeURIComponent(f)}`),
    captureUrls: v.captures.map(f => `${b.tournage}/${DOSSIER_CAPTURES}/${encodeURIComponent(f)}`),
    accroche: v.accroche.trim(),
  };
}

// Comme YouTube : tags séparés par des virgules, un tag contenant une espace compte ses guillemets.
export function longueurTags(tags: string[]): number {
  return tags.reduce((n, t) => n + t.length + (t.includes(' ') ? 2 : 0), 0) + Math.max(0, tags.length - 1);
}

const sansAccents = (t: string) => t.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

export function mentionsTrouvees(textes: string[], mentions: string[]): string[] {
  const tout = sansAccents(textes.join('\n'));
  const vues = new Set<string>();
  return mentions.filter(m => {
    const cle = sansAccents(m);
    if (!tout.includes(cle) || vues.has(cle)) return false;
    vues.add(cle);
    return true;
  });
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
  // Tout ce qui part sur YouTube, même privé ou non répertorié, peut être vu hors du cercle prévu.
  if (diffusion(v).youtube !== 'aucun') {
    for (const m of mentionsTrouvees([v.titre, descriptionFinale, ...v.tags, v.vignette?.accroche ?? ''], r.mentionsInterdites)) {
      problemes.push(`Mention interdite pour une vidéo envoyée sur YouTube : « ${m} ».`);
    }
  }
  return problemes;
}
