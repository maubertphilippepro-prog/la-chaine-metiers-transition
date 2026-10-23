import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { lireEpisode } from '../../remotion/scripts/tournage';
import { EXTENSIONS_VIDEO, type EtapeAnalyse } from '../commun';
import { ecrireJson, ErreurHttp, message } from './http';

const LONGUEUR_MAX = 50;

// « Métiers & Transition : l’été ! » → « metiers-transition-l-ete ».
export function simplifierTitre(titre: string): string {
  const simple = titre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return simple.slice(0, LONGUEUR_MAX).replace(/-+$/, '') || 'tournage';
}

function lireDemandeCreation(corps: unknown): { titre: string; date: string } {
  const c = corps && typeof corps === 'object' ? (corps as Record<string, unknown>) : {};
  const titre = typeof c.titre === 'string' ? c.titre.trim() : '';
  if (!titre) throw new ErreurHttp(400, 'Le titre est vide.');
  const date = typeof c.date === 'string' ? c.date : '';
  const jour = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(jour.getTime()) || jour.toISOString().slice(0, 10) !== date) {
    throw new ErreurHttp(400, 'date attendue : AAAA-MM-JJ.');
  }
  return { titre, date };
}

// Crée <date>-<titre simplifié>/bruts/ (suffixe -2, -3… si le nom est pris) ; renvoie le nom du dossier.
export async function creerTournage(racine: string, corps: unknown): Promise<string> {
  const { titre, date } = lireDemandeCreation(corps);
  const base = `${date}-${simplifierTitre(titre)}`;
  await mkdir(racine, { recursive: true });
  for (let n = 1; ; n++) {
    const nom = n === 1 ? base : `${base}-${n}`;
    const dossier = path.join(racine, nom);
    try {
      await mkdir(dossier);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') continue;
      throw e;
    }
    await mkdir(path.join(dossier, 'bruts'));
    // Le titre reste disponible pour « Analyser » si l’envoi de la vidéo échoue.
    await ecrireJson(path.join(dossier, 'episode.json'), { version: 1, titre, statut: null, message: null });
    return nom;
  }
}

// L'enregistrement de la webcam (« -camera », plugin OBS Source Record) sert aux vignettes, pas au montage.
const estVideoMontage = (fichier: string) =>
  EXTENSIONS_VIDEO.includes(path.extname(fichier).toLowerCase()) && !path.parse(fichier).name.toLowerCase().endsWith('-camera');

export async function videosBrutes(dossier: string): Promise<string[]> {
  const bruts = path.join(dossier, 'bruts');
  return existsSync(bruts) ? (await readdir(bruts)).filter(estVideoMontage) : [];
}

// Noms que Windows interdit : caractères réservés, point ou espace final, périphériques (CON, NUL, COM1…).
const NOM_WINDOWS_INVALIDE = /[<>:"|?*\x00-\x1f]|[. ]$|^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;

// Tournages dont une vidéo est en cours d’envoi : la vérification « déjà une vidéo » et l’écriture ne sont pas atomiques.
const envoisEnCours = new Set<string>();
export const envoiEnCours = (dossier: string) => envoisEnCours.has(dossier);

// Vidéo envoyée par le studio, écrite en flux dans bruts/ ; un envoi interrompu ne laisse rien.
export async function deposerVideo(req: IncomingMessage, dossier: string): Promise<string> {
  const fichier = new URL(req.url ?? '/', 'http://local').searchParams.get('fichier') ?? '';
  if (
    !fichier || path.basename(fichier) !== fichier || fichier.includes('\\') || fichier.startsWith('.') ||
    NOM_WINDOWS_INVALIDE.test(fichier) || !estVideoMontage(fichier)
  ) {
    throw new ErreurHttp(400, `fichier attendu : une vidéo ${EXTENSIONS_VIDEO.join(', ')} (hors enregistrement « -camera »), sans chemin.`);
  }
  if (envoisEnCours.has(dossier)) throw new ErreurHttp(409, 'Une vidéo est déjà en cours d’envoi pour ce tournage.');
  envoisEnCours.add(dossier);
  try {
    if ((await videosBrutes(dossier)).length > 0) throw new ErreurHttp(409, 'Ce tournage a déjà une vidéo dans bruts/.');
    const bruts = path.join(dossier, 'bruts');
    await mkdir(bruts, { recursive: true });
    const partiel = path.join(bruts, `${fichier}.partiel`);
    // Un échec du nettoyage ne doit pas masquer l’erreur d’origine.
    const nettoyer = () => rm(partiel, { force: true }).catch(() => undefined);
    try {
      await pipeline(req, createWriteStream(partiel));
    } catch (e) {
      await nettoyer();
      throw new ErreurHttp(500, `Envoi de la vidéo interrompu : ${message(e)}`);
    }
    if ((await stat(partiel)).size === 0) {
      await nettoyer();
      throw new ErreurHttp(400, 'Vidéo vide.');
    }
    await rename(partiel, path.join(bruts, fichier));
    return fichier;
  } finally {
    envoisEnCours.delete(dossier);
  }
}

// Fichiers que le pipeline tire de la vidéo du montage : à refaire avec la nouvelle vidéo.
const FICHIERS_DE_LA_VIDEO = ['source.mp4', 'preparation.json', 'transcription.json', 'detections.json'];

// Retire la vidéo d'un tournage en erreur au premier chargement, pour en déposer une autre ; l'enregistrement « -camera » reste.
export async function retirerVideo(dossier: string): Promise<void> {
  if (existsSync(path.join(dossier, 'analyse.json'))) {
    throw new ErreurHttp(409, 'Ce tournage est déjà analysé : supprimez-le et créez-en un autre.');
  }
  if ((await lireEpisode(dossier)).statut !== 'erreur') throw new ErreurHttp(409, 'Seule la vidéo d’un tournage en erreur peut être remplacée.');
  if (envoiEnCours(dossier)) throw new ErreurHttp(409, 'Une vidéo est déjà en cours d’envoi pour ce tournage.');
  for (const f of await videosBrutes(dossier)) await rm(path.join(dossier, 'bruts', f), { force: true });
  for (const f of FICHIERS_DE_LA_VIDEO) await rm(path.join(dossier, f), { force: true });
}

// Le pipeline écrit un fichier par étape finie ; l'étape en cours est la suivante.
export function etapeAnalyse(dossier: string): EtapeAnalyse {
  const present = (fichier: string) => existsSync(path.join(dossier, fichier));
  if (present('detections.json')) return 'suggestions';
  if (present('transcription.json')) return 'detections';
  if (present('preparation.json')) return 'transcription';
  return 'preparation';
}
