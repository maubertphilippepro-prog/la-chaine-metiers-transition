import { existsSync, statSync } from 'node:fs';
import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { majGlossaire, type Glossaire } from '../../noyau/glossaire';
import type { StatutEpisode } from '../../noyau/types';
import { verifierAvantRendu } from '../../noyau/verifications';
import type { Cible, ResultatRendu } from '../../remotion/scripts/rendu';
import { chargerTournage, majStatutEpisode, raisonMontage, urlSource, type Tournage } from '../../remotion/scripts/tournage';
import type { DetailTournage, EtatRendu, ResumeTournage } from '../commun';
import type { SuiviRendu } from './suivi-rendu';

export interface ConfigApi {
  racineTournages: string;
  cheminGlossaire: string;
  // Serveur de fichiers qui sert source.mp4 au lecteur.
  urlFichiers: string;
  suivi: SuiviRendu;
  rendre: (dossier: string, cible: Cible, onProgression: (fichier: string, progression: number) => void) => Promise<ResultatRendu[]>;
  relancerSuggestions: (dossier: string) => Promise<void>;
}

class ErreurHttp extends Error {
  constructor(readonly statut: number, message: string, readonly problemes?: string[]) {
    super(message);
  }
}

const STATUTS: StatutEpisode[] = ['analyse', 'en-validation', 'valide', 'rendu', 'erreur'];
const TAILLE_MAX = 50_000_000;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function repondre(res: ServerResponse, statut: number, corps: unknown): void {
  res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(corps));
}

async function lireCorps(req: IncomingMessage): Promise<unknown> {
  const morceaux: Buffer[] = [];
  let taille = 0;
  for await (const morceau of req as AsyncIterable<Buffer>) {
    taille += morceau.length;
    if (taille > TAILLE_MAX) throw new ErreurHttp(413, 'Requête trop volumineuse.');
    morceaux.push(morceau);
  }
  try {
    return JSON.parse(Buffer.concat(morceaux).toString('utf-8'));
  } catch {
    throw new ErreurHttp(400, 'JSON invalide.');
  }
}

async function ecrireJson(chemin: string, valeur: unknown): Promise<void> {
  const temporaire = `${chemin}.tmp`;
  await writeFile(temporaire, JSON.stringify(valeur, null, 2), 'utf-8');
  await rename(temporaire, chemin);
}

async function lireEpisode(dossier: string): Promise<{ titre: string | null; statut: StatutEpisode | null; message: string | null }> {
  try {
    const lu: unknown = JSON.parse(await readFile(path.join(dossier, 'episode.json'), 'utf-8'));
    if (lu && typeof lu === 'object' && !Array.isArray(lu)) {
      const e = lu as Record<string, unknown>;
      return {
        titre: typeof e.titre === 'string' ? e.titre : null,
        statut: STATUTS.includes(e.statut as StatutEpisode) ? (e.statut as StatutEpisode) : null,
        message: typeof e.message === 'string' ? e.message : null,
      };
    }
  } catch {
    // absent ou illisible : tournage sans statut
  }
  return { titre: null, statut: null, message: null };
}

async function resume(dossier: string): Promise<ResumeTournage> {
  const nom = path.basename(dossier);
  const e = await lireEpisode(dossier);
  return { nom, titre: e.titre ?? nom, statut: e.statut, message: e.message, analyseFaite: existsSync(path.join(dossier, 'analyse.json')) };
}

async function lireGlossaire(chemin: string): Promise<Glossaire> {
  if (!existsSync(chemin)) return { termes: [] };
  try {
    const g: unknown = JSON.parse(await readFile(chemin, 'utf-8'));
    if (g && typeof g === 'object' && Array.isArray((g as Glossaire).termes)) return g as Glossaire;
  } catch {
    // signalé ci-dessous
  }
  throw new ErreurHttp(500, 'glossaire.json illisible : corrigez-le avant de lancer le rendu.');
}

function lireCible(corps: unknown): Cible {
  const v = corps && typeof corps === 'object' ? (corps as Record<string, unknown>).cible : undefined;
  if (v === 'tout' || v === 'complete') return v;
  if (typeof v === 'number' && Number.isInteger(v) && v >= 1) return v;
  throw new ErreurHttp(400, 'cible attendue : « tout », « complete » ou un numéro d’épisode.');
}

export function creerApi(c: ConfigApi): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  function dossierDe(nomEncode: string): string {
    let nom: string;
    try {
      nom = decodeURIComponent(nomEncode);
    } catch {
      throw new ErreurHttp(404, 'Tournage introuvable.');
    }
    const dossier = path.join(c.racineTournages, nom);
    if (nom.startsWith('.') || /[\\/]/.test(nom) || !statSync(dossier, { throwIfNoEntry: false })?.isDirectory()) {
      throw new ErreurHttp(404, `Tournage introuvable : ${nom}`);
    }
    return dossier;
  }

  async function charger(dossier: string, brouillon: boolean): Promise<Tournage> {
    try {
      return await chargerTournage(dossier, { brouillon });
    } catch (e) {
      throw new ErreurHttp(409, message(e));
    }
  }

  async function detail(dossier: string): Promise<DetailTournage> {
    const t = await charger(dossier, true);
    return {
      ...(await resume(dossier)),
      analyse: t.analyse,
      montage: t.montage,
      montageEnregistre: existsSync(path.join(dossier, 'montage.json')),
      reglages: t.reglages,
      sourceUrl: urlSource(c.urlFichiers, t.nom),
    };
  }

  async function enregistrerMontage(req: IncomingMessage, dossier: string): Promise<void> {
    const etat = c.suivi.etat();
    if (etat.enCours && etat.nom === path.basename(dossier)) {
      throw new ErreurHttp(409, 'Rendu en cours : le montage ne peut pas être modifié.');
    }
    const montage = await lireCorps(req);
    const probleme = raisonMontage(montage);
    if (probleme) throw new ErreurHttp(400, `montage invalide : ${probleme}`);
    await ecrireJson(path.join(dossier, 'montage.json'), montage);
    if ((await lireEpisode(dossier)).statut !== 'en-validation') await majStatutEpisode(dossier, 'en-validation', null);
  }

  async function lancerRendu(req: IncomingMessage, dossier: string): Promise<EtatRendu> {
    const cible = lireCible(await lireCorps(req));
    if (c.suivi.etat().enCours) throw new ErreurHttp(409, 'Un rendu est déjà en cours.');
    const t = await charger(dossier, false);
    const problemes = verifierAvantRendu(t.montage, t.reglages.definitionMaxCaracteres);
    if (problemes.length > 0) throw new ErreurHttp(422, 'Le montage n’est pas prêt pour le rendu.', problemes);
    await ecrireJson(c.cheminGlossaire, majGlossaire(await lireGlossaire(c.cheminGlossaire), t.montage.termes));
    await majStatutEpisode(dossier, 'valide', null);
    c.suivi.lancer(t.nom, onProgression => c.rendre(dossier, cible, onProgression));
    return c.suivi.etat();
  }

  return async function traiter(req, res) {
    const chemin = new URL(req.url ?? '/', 'http://local').pathname;
    if (!chemin.startsWith('/api/')) return false;
    try {
      const route = /^\/api\/tournages\/([^/]+)(?:\/(montage|rendu|suggestions))?$/.exec(chemin);
      const nom = route?.[1];
      const action = route?.[2];
      if (chemin === '/api/tournages' && req.method === 'GET') {
        const entrees = existsSync(c.racineTournages) ? await readdir(c.racineTournages, { withFileTypes: true }) : [];
        const noms = entrees.filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name).sort().reverse();
        repondre(res, 200, await Promise.all(noms.map(n => resume(path.join(c.racineTournages, n)))));
      } else if (chemin === '/api/rendu' && req.method === 'GET') {
        repondre(res, 200, c.suivi.etat());
      } else if (nom && !action && req.method === 'GET') {
        repondre(res, 200, await detail(dossierDe(nom)));
      } else if (nom && action === 'montage' && req.method === 'PUT') {
        await enregistrerMontage(req, dossierDe(nom));
        repondre(res, 200, { ok: true });
      } else if (nom && action === 'rendu' && req.method === 'POST') {
        repondre(res, 202, await lancerRendu(req, dossierDe(nom)));
      } else if (nom && action === 'suggestions' && req.method === 'POST') {
        const dossier = dossierDe(nom);
        try {
          await c.relancerSuggestions(dossier);
        } catch (e) {
          throw new ErreurHttp(500, `Relance des suggestions impossible : ${message(e)}`);
        }
        repondre(res, 200, await detail(dossier));
      } else {
        repondre(res, 404, { erreur: 'Route inconnue.' });
      }
    } catch (e) {
      if (e instanceof ErreurHttp) repondre(res, e.statut, { erreur: e.message, ...(e.problemes ? { problemes: e.problemes } : {}) });
      else repondre(res, 500, { erreur: message(e) });
    }
    return true;
  };
}
