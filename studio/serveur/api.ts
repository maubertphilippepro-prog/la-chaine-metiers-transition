import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { passageEnTemps, proposer, raisonFichierConsignes, type Ancrage, type Consigne, type FichierConsignes, type ReponseConsigne } from '../../noyau/consignes';
import { majGlossaire, type Glossaire } from '../../noyau/glossaire';
import { verifierAvantRendu } from '../../noyau/verifications';
import type { Cible, ResultatRendu } from '../../remotion/scripts/rendu';
import { chargerTournage, lireEpisode, majStatutEpisode, raisonMontage, urlSource, type Tournage } from '../../remotion/scripts/tournage';
import type { DetailTournage, EtatRendu, ResumeTournage } from '../commun';
import { ErreurInterpretation, lireConsignes, type InterpreterConsigne } from './consignes';
import { dossierTournage, ecrireJson, ErreurHttp, lireCorps, message, repondre, repondreErreur } from './http';
import { creerTournage, deposerVideo, envoiEnCours, etapeAnalyse, retirerVideo, videosBrutes } from './nouveau-tournage';
import { deplacerVersSupprimes } from './suppression';
import type { SuiviAnalyse } from './suivi-analyse';
import type { SuiviRendu } from './suivi-rendu';

export interface ConfigApi {
  racineTournages: string;
  // Les tournages supprimés y sont rangés, jamais effacés.
  racineSupprimes: string;
  cheminGlossaire: string;
  // Serveur de fichiers qui sert source.mp4 au lecteur.
  urlFichiers: string;
  suivi: SuiviRendu;
  rendre: (dossier: string, cible: Cible, onProgression: (fichier: string, progression: number) => void) => Promise<ResultatRendu[]>;
  relancerSuggestions: (dossier: string) => Promise<void>;
  suiviAnalyse: SuiviAnalyse;
  // « mtpipeline analyser », injecté pour les tests.
  analyser: (dossier: string, titre: string) => Promise<void>;
  // Appel à Claude, injecté pour les tests.
  interpreterConsigne: InterpreterConsigne;
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

function lireDemandeConsigne(corps: unknown): { texte: string; ancrage: Ancrage | null } {
  const c = corps && typeof corps === 'object' ? (corps as Record<string, unknown>) : {};
  const texte = typeof c.texte === 'string' ? c.texte.trim() : '';
  if (!texte) throw new ErreurHttp(400, 'La consigne est vide.');
  if (c.ancrage === null || c.ancrage === undefined) return { texte, ancrage: null };
  const a = typeof c.ancrage === 'object' ? (c.ancrage as Record<string, unknown>) : {};
  if (!Number.isInteger(a.premierMot) || !Number.isInteger(a.dernierMot)) {
    throw new ErreurHttp(400, 'ancrage attendu : { premierMot, dernierMot } ou null.');
  }
  return { texte, ancrage: { premierMot: a.premierMot as number, dernierMot: a.dernierMot as number } };
}

export function creerApi(c: ConfigApi): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  function dossierDe(nomEncode: string): string {
    return dossierTournage(c.racineTournages, nomEncode);
  }

  async function resume(dossier: string): Promise<ResumeTournage> {
    const nom = path.basename(dossier);
    const e = await lireEpisode(dossier);
    const analyse = c.suiviAnalyse.etat();
    return {
      nom,
      titre: e.titre ?? nom,
      statut: e.statut,
      message: e.message,
      analyseFaite: existsSync(path.join(dossier, 'analyse.json')),
      videoPresente: (await videosBrutes(dossier)).length > 0,
      analyseEnCours: analyse.enCours && analyse.nom === nom,
      etapeAnalyse: etapeAnalyse(dossier),
    };
  }

  async function charger(dossier: string, brouillon: boolean): Promise<Tournage> {
    try {
      return await chargerTournage(dossier, { brouillon });
    } catch (e) {
      throw new ErreurHttp(409, message(e));
    }
  }

  async function consignesDe(dossier: string): Promise<FichierConsignes> {
    try {
      return await lireConsignes(dossier);
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
      consignes: await consignesDe(dossier),
      reglages: t.reglages,
      sourceUrl: urlSource(c.urlFichiers, t.nom),
    };
  }

  // Tournage dont le rendu est en préparation (entre la demande et suivi.lancer).
  let enPreparation: string | null = null;

  function verifierMontageModifiable(dossier: string): void {
    const nom = path.basename(dossier);
    const etat = c.suivi.etat();
    if ((etat.enCours && etat.nom === nom) || enPreparation === nom) {
      throw new ErreurHttp(409, 'Rendu en cours : le montage ne peut pas être modifié.');
    }
  }

  async function enregistrerMontage(req: IncomingMessage, dossier: string): Promise<void> {
    verifierMontageModifiable(dossier);
    const montage = await lireCorps(req);
    verifierMontageModifiable(dossier);
    const probleme = raisonMontage(montage);
    if (probleme) throw new ErreurHttp(400, `montage invalide : ${probleme}`);
    await ecrireJson(path.join(dossier, 'montage.json'), montage);
    if ((await lireEpisode(dossier)).statut !== 'en-validation') await majStatutEpisode(dossier, 'en-validation', null);
  }

  // Claude traduit la consigne ; les propositions sont vérifiées en chaîne sur le montage enregistré.
  async function donnerConsigne(req: IncomingMessage, dossier: string): Promise<Consigne> {
    verifierMontageModifiable(dossier);
    const { texte, ancrage } = lireDemandeConsigne(await lireCorps(req));
    const t = await charger(dossier, true);
    if (ancrage) {
      const passage = passageEnTemps(t.analyse, ancrage.premierMot, ancrage.dernierMot);
      if (typeof passage === 'string') throw new ErreurHttp(400, `ancrage invalide : ${passage}`);
    }
    await consignesDe(dossier);
    let reponse: ReponseConsigne;
    try {
      reponse = await c.interpreterConsigne({
        analyse: t.analyse,
        montage: t.montage,
        texte,
        ancrage,
        definitionMax: t.reglages.definitionMaxCaracteres,
        texteMax: t.reglages.elements.texteMaxCaracteres,
        modele: t.reglages.modeles.claude,
      });
    } catch (e) {
      if (e instanceof ErreurInterpretation) throw new ErreurHttp(e.statut, e.message);
      throw new ErreurHttp(500, `Interprétation de la consigne impossible : ${message(e)}`);
    }
    verifierMontageModifiable(dossier);
    const consigne: Consigne = {
      id: randomUUID(),
      date: new Date().toISOString(),
      texte,
      ancrage,
      reformulation: reponse.reformulation,
      nonRealisable: reponse.nonRealisable,
      propositions: proposer(t.analyse, t.montage, reponse.operations, t.reglages),
    };
    // Relu après l'appel : une acceptation a pu être enregistrée entre-temps.
    const fichier = await consignesDe(dossier);
    verifierMontageModifiable(dossier);
    await ecrireJson(path.join(dossier, 'consignes.json'), { ...fichier, consignes: [...fichier.consignes, consigne] });
    return consigne;
  }

  async function enregistrerConsignes(req: IncomingMessage, dossier: string): Promise<void> {
    verifierMontageModifiable(dossier);
    const fichier = await lireCorps(req);
    verifierMontageModifiable(dossier);
    const probleme = raisonFichierConsignes(fichier);
    if (probleme) throw new ErreurHttp(400, `consignes invalides : ${probleme}`);
    await ecrireJson(path.join(dossier, 'consignes.json'), fichier);
  }

  async function lancerRendu(req: IncomingMessage, dossier: string): Promise<EtatRendu> {
    const cible = lireCible(await lireCorps(req));
    if (c.suivi.etat().enCours || enPreparation) throw new ErreurHttp(409, 'Un rendu est déjà en cours.');
    enPreparation = path.basename(dossier);
    try {
      const t = await charger(dossier, false);
      const { consignes } = await consignesDe(dossier);
      const problemes = verifierAvantRendu(t.analyse, t.montage, t.reglages, consignes);
      if (problemes.length > 0) throw new ErreurHttp(422, 'Le montage n’est pas prêt pour le rendu.', problemes);
      await ecrireJson(c.cheminGlossaire, majGlossaire(await lireGlossaire(c.cheminGlossaire), t.montage.termes));
      await majStatutEpisode(dossier, 'valide', null);
      c.suivi.lancer(t.nom, onProgression => c.rendre(dossier, cible, onProgression));
      return c.suivi.etat();
    } finally {
      enPreparation = null;
    }
  }

  async function supprimerTournage(dossier: string): Promise<void> {
    const nom = path.basename(dossier);
    const analyse = c.suiviAnalyse.etat();
    if (analyse.enCours && analyse.nom === nom) throw new ErreurHttp(409, 'Analyse en cours sur ce tournage : attendez sa fin avant de le supprimer.');
    const rendu = c.suivi.etat();
    if ((rendu.enCours && rendu.nom === nom) || enPreparation === nom) {
      throw new ErreurHttp(409, 'Rendu en cours sur ce tournage : attendez sa fin avant de le supprimer.');
    }
    if (envoiEnCours(dossier)) throw new ErreurHttp(409, 'Vidéo en cours d’envoi sur ce tournage : attendez sa fin avant de le supprimer.');
    await deplacerVersSupprimes(dossier, c.racineSupprimes);
  }

  async function lancerAnalyse(req: IncomingMessage, dossier: string): Promise<void> {
    const corps = await lireCorps(req);
    const titre = corps && typeof corps === 'object' && typeof (corps as Record<string, unknown>).titre === 'string'
      ? ((corps as Record<string, unknown>).titre as string).trim()
      : '';
    if (!titre) throw new ErreurHttp(400, 'Le titre est vide.');
    if ((await videosBrutes(dossier)).length === 0) throw new ErreurHttp(409, 'Aucune vidéo dans bruts/ : déposez-la avant d’analyser.');
    if (existsSync(path.join(dossier, 'analyse.json'))) throw new ErreurHttp(409, 'Ce tournage est déjà analysé.');
    const avant = await lireEpisode(dossier);
    const lancee = c.suiviAnalyse.lancer(path.basename(dossier), titre, async () => {
      try {
        await c.analyser(dossier, titre);
      } catch (e) {
        // Le pipeline note lui-même ses erreurs ; un échec avant (Python introuvable…) est reporté ici.
        const apres = await lireEpisode(dossier);
        const ecritParPipeline = apres.statut === 'erreur' && apres.message !== avant.message;
        if (!ecritParPipeline) await majStatutEpisode(dossier, 'erreur', message(e));
        throw e;
      }
    });
    if (!lancee) throw new ErreurHttp(409, `Une analyse est déjà en cours : ${c.suiviAnalyse.etat().titre}`);
  }

  return async function traiter(req, res) {
    const chemin = new URL(req.url ?? '/', 'http://local').pathname;
    if (!chemin.startsWith('/api/')) return false;
    try {
      const route = /^\/api\/tournages\/([^/]+)(?:\/(montage|rendu|suggestions|consignes|video|analyse))?$/.exec(chemin);
      const nom = route?.[1];
      const action = route?.[2];
      if (chemin === '/api/tournages' && req.method === 'GET') {
        const entrees = existsSync(c.racineTournages) ? await readdir(c.racineTournages, { withFileTypes: true }) : [];
        const noms = entrees.filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name).sort().reverse();
        repondre(res, 200, await Promise.all(noms.map(n => resume(path.join(c.racineTournages, n)))));
      } else if (chemin === '/api/tournages' && req.method === 'POST') {
        repondre(res, 201, { nom: await creerTournage(c.racineTournages, await lireCorps(req)) });
      } else if (chemin === '/api/rendu' && req.method === 'GET') {
        repondre(res, 200, c.suivi.etat());
      } else if (nom && !action && req.method === 'GET') {
        repondre(res, 200, await detail(dossierDe(nom)));
      } else if (nom && !action && req.method === 'DELETE') {
        await supprimerTournage(dossierDe(nom));
        repondre(res, 200, { ok: true });
      } else if (nom && action === 'montage' && req.method === 'PUT') {
        await enregistrerMontage(req, dossierDe(nom));
        repondre(res, 200, { ok: true });
      } else if (nom && action === 'consignes' && req.method === 'POST') {
        repondre(res, 200, await donnerConsigne(req, dossierDe(nom)));
      } else if (nom && action === 'consignes' && req.method === 'PUT') {
        await enregistrerConsignes(req, dossierDe(nom));
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
      } else if (nom && action === 'video' && req.method === 'PUT') {
        repondre(res, 200, { fichier: await deposerVideo(req, dossierDe(nom)) });
      } else if (nom && action === 'video' && req.method === 'DELETE') {
        const dossier = dossierDe(nom);
        const analyse = c.suiviAnalyse.etat();
        if (analyse.enCours && analyse.nom === path.basename(dossier)) throw new ErreurHttp(409, 'Analyse en cours sur ce tournage : attendez sa fin.');
        await retirerVideo(dossier);
        repondre(res, 200, { ok: true });
      } else if (nom && action === 'analyse' && req.method === 'POST') {
        await lancerAnalyse(req, dossierDe(nom));
        repondre(res, 202, { ok: true });
      } else {
        repondre(res, 404, { erreur: 'Route inconnue.' });
      }
    } catch (e) {
      repondreErreur(res, e);
    }
    return true;
  };
}
