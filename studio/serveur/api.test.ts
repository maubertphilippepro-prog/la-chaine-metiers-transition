import { existsSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import exemple from '../../fixtures/analyse-exemple.json';
import type { FichierConsignes, ReponseConsigne } from '../../noyau/consignes';
import { creerApi, type ConfigApi } from './api';
import { ErreurInterpretation } from './consignes';
import { SuiviAnalyse } from './suivi-analyse';
import { SuiviRendu } from './suivi-rendu';

const MONTAGE_PRET = {
  version: 1,
  titre: 'Essai',
  coupes: [],
  chapitres: [{ titre: 'Intro', debut: 0 }],
  termes: [{ terme: 'SSO', definition: 'Authentification unique.', occurrences: [3.8], statut: 'valide', position: 'bas' }],
};
const EN_VALIDATION = { version: 1, titre: 'A', statut: 'en-validation', message: null };
const REPONSE: ReponseConsigne = {
  reformulation: 'Couper la salutation.',
  operations: [
    { type: 'couper', premierMot: 0, dernierMot: 2, explication: 'Coupe « Bonjour à tous. ».' },
    { type: 'renommerChapitre', premierMotChapitre: 4, titre: 'X', explication: 'Renomme un chapitre.' },
  ],
  nonRealisable: ['Ajouter une musique : aucune opération ne le permet.'],
};
const EN_ATTENTE: FichierConsignes = {
  version: 1,
  consignes: [{
    id: 'c1',
    date: '2026-10-19T10:00:00.000Z',
    texte: 'Coupe la salutation',
    ancrage: null,
    reformulation: 'Couper la salutation.',
    nonRealisable: [],
    propositions: [{ operation: { type: 'couper', premierMot: 0, dernierMot: 2 }, explication: 'Coupe.', etat: 'en-attente' }],
  }],
};

let racine: string;
let url: string;
let serveur: http.Server;
let config: ConfigApi;

async function tournage(nom: string, fichiers: Record<string, unknown>): Promise<string> {
  const dossier = path.join(racine, 'tournages', nom);
  await mkdir(dossier, { recursive: true });
  for (const [fichier, contenu] of Object.entries(fichiers)) {
    await writeFile(path.join(dossier, fichier), JSON.stringify(contenu), 'utf-8');
  }
  return dossier;
}

const lire = async (chemin: string) => JSON.parse(await readFile(chemin, 'utf-8'));
const json = { 'Content-Type': 'application/json' };
const envoyerMontage = (nom: string, montage: unknown) =>
  fetch(`${url}/api/tournages/${nom}/montage`, { method: 'PUT', headers: json, body: JSON.stringify(montage) });
const demanderRendu = (nom: string, cible: unknown) =>
  fetch(`${url}/api/tournages/${nom}/rendu`, { method: 'POST', headers: json, body: JSON.stringify({ cible }) });
const donnerConsigne = (nom: string, corps: unknown) =>
  fetch(`${url}/api/tournages/${nom}/consignes`, { method: 'POST', headers: json, body: JSON.stringify(corps) });
const envoyerConsignes = (nom: string, fichier: unknown) =>
  fetch(`${url}/api/tournages/${nom}/consignes`, { method: 'PUT', headers: json, body: JSON.stringify(fichier) });
const creerTournage = (corps: unknown) =>
  fetch(`${url}/api/tournages`, { method: 'POST', headers: json, body: JSON.stringify(corps) });
const envoyerVideo = (nom: string, fichier: string, contenu: string) =>
  fetch(`${url}/api/tournages/${nom}/video?fichier=${encodeURIComponent(fichier)}`, { method: 'PUT', body: contenu });

const demanderAnalyse = (nom: string, titre: string) =>
  fetch(`${url}/api/tournages/${nom}/analyse`, { method: 'POST', headers: json, body: JSON.stringify({ titre }) });

async function avecVideo(nom: string, fichiers: Record<string, unknown> = {}): Promise<string> {
  const dossier = await tournage(nom, fichiers);
  await mkdir(path.join(dossier, 'bruts'));
  await writeFile(path.join(dossier, 'bruts', 'film.mp4'), 'x');
  return dossier;
}

// Analyse simulée qui ne se termine qu'à l'appel de la fonction renvoyée.
function analyseBloquee(): () => void {
  let finir = () => {};
  vi.mocked(config.analyser).mockImplementation(() => new Promise<void>(r => { finir = r; }));
  return () => finir();
}

beforeEach(async () => {
  racine = await mkdtemp(path.join(os.tmpdir(), 'pmt-studio-'));
  await mkdir(path.join(racine, 'tournages'));
  config = {
    racineTournages: path.join(racine, 'tournages'),
    cheminGlossaire: path.join(racine, 'glossaire.json'),
    urlFichiers: 'http://127.0.0.1:9999',
    suivi: new SuiviRendu(),
    rendre: vi.fn<ConfigApi['rendre']>(async dossier => [
      { fichier: path.join(dossier, 'rendus', 'video-complete.mp4'), ok: true, message: null },
    ]),
    relancerSuggestions: vi.fn<ConfigApi['relancerSuggestions']>(async () => undefined),
    interpreterConsigne: vi.fn<ConfigApi['interpreterConsigne']>(async () => REPONSE),
    suiviAnalyse: new SuiviAnalyse(),
    analyser: vi.fn<ConfigApi['analyser']>(async () => undefined),
  };
  const api = creerApi(config);
  serveur = http.createServer(async (req, res) => {
    if (!(await api(req, res))) res.writeHead(418).end();
  });
  await new Promise<void>(r => serveur.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await config.suivi.attendre();
  await config.suiviAnalyse.attendre();
  await new Promise<void>(r => serveur.close(() => r()));
});

describe('liste des tournages', () => {
  it('liste les tournages du plus récent au plus ancien avec leur statut', async () => {
    await tournage('2026-10-01-a', { 'analyse.json': exemple, 'episode.json': { version: 1, titre: 'A', statut: 'analyse', message: null } });
    await tournage('2026-10-02-b', {});
    expect(await (await fetch(`${url}/api/tournages`)).json()).toEqual([
      { nom: '2026-10-02-b', titre: '2026-10-02-b', statut: null, message: null, analyseFaite: false, videoPresente: false, analyseEnCours: false, etapeAnalyse: 'preparation' },
      { nom: '2026-10-01-a', titre: 'A', statut: 'analyse', message: null, analyseFaite: true, videoPresente: false, analyseEnCours: false, etapeAnalyse: 'preparation' },
    ]);
  });
  it('laisse passer les requêtes hors API', async () => {
    expect((await fetch(`${url}/index.html`)).status).toBe(418);
  });
});

describe('nouveau tournage', () => {
  it('crée le dossier et bruts/ sous le titre simplifié, et garde le titre dans episode.json', async () => {
    const r = await creerTournage({ titre: 'Métiers & Transition : l’été !', date: '2026-10-23' });
    expect(r.status).toBe(201);
    const { nom } = await r.json();
    expect(nom).toBe('2026-10-23-metiers-transition-l-ete');
    const dossier = path.join(config.racineTournages, nom);
    expect(existsSync(path.join(dossier, 'bruts'))).toBe(true);
    expect(await lire(path.join(dossier, 'episode.json'))).toEqual({ version: 1, titre: 'Métiers & Transition : l’été !', statut: null, message: null });
  });
  it('ajoute -2, -3 quand le nom est pris', async () => {
    await tournage('2026-10-23-essai', {});
    expect((await (await creerTournage({ titre: 'Essai', date: '2026-10-23' })).json()).nom).toBe('2026-10-23-essai-2');
    expect((await (await creerTournage({ titre: 'Essai', date: '2026-10-23' })).json()).nom).toBe('2026-10-23-essai-3');
  });
  it('refuse un titre vide ou une date invalide', async () => {
    expect((await creerTournage({ titre: '  ', date: '2026-10-23' })).status).toBe(400);
    expect((await creerTournage({ titre: 'Essai', date: '23/10/2026' })).status).toBe(400);
    expect((await creerTournage({ titre: 'Essai', date: '2026-13-01' })).status).toBe(400);
  });
});

describe('détail d’un tournage', () => {
  it('propose le montage par défaut tant que montage.json est absent', async () => {
    await tournage('a', { 'analyse.json': exemple });
    const d = await (await fetch(`${url}/api/tournages/a`)).json();
    expect(d.montageEnregistre).toBe(false);
    expect(d.montage.chapitres[0]).toEqual({ titre: 'Introduction', debut: 0 });
    expect(d.analyse.mots).toHaveLength(6);
    expect(d.sourceUrl).toBe('http://127.0.0.1:9999/a/source.mp4');
    expect(d.reglages.definitionMaxCaracteres).toBe(160);
    expect(d.consignes).toEqual({ version: 1, consignes: [] });
  });
  it('renvoie les consignes enregistrées', async () => {
    await tournage('a', { 'analyse.json': exemple, 'consignes.json': EN_ATTENTE });
    expect((await (await fetch(`${url}/api/tournages/a`)).json()).consignes).toEqual(EN_ATTENTE);
  });
  it('signale un consignes.json illisible sans le réécrire', async () => {
    const d = await tournage('a', { 'analyse.json': exemple });
    await writeFile(path.join(d, 'consignes.json'), '{ pas du json', 'utf-8');
    const r = await fetch(`${url}/api/tournages/a`);
    expect(r.status).toBe(409);
    expect((await r.json()).erreur).toContain('a/consignes.json illisible');
    expect((await donnerConsigne('a', { texte: 'Coupe', ancrage: null })).status).toBe(409);
    expect(config.interpreterConsigne).not.toHaveBeenCalled();
    expect(await readFile(path.join(d, 'consignes.json'), 'utf-8')).toBe('{ pas du json');
  });
  it('refuse un tournage inconnu ou un nom qui sort du dossier', async () => {
    expect((await fetch(`${url}/api/tournages/inconnu`)).status).toBe(404);
    expect((await fetch(`${url}/api/tournages/..%5Cautre`)).status).toBe(404);
  });
  it('signale un tournage pas encore analysé', async () => {
    await tournage('b', {});
    const r = await fetch(`${url}/api/tournages/b`);
    expect(r.status).toBe(409);
    expect((await r.json()).erreur).toContain('analyse.json absent');
  });
});

describe('enregistrement du montage', () => {
  it('écrit montage.json et passe le tournage en validation', async () => {
    const d = await tournage('a', { 'analyse.json': exemple, 'episode.json': { version: 1, titre: 'A', statut: 'analyse', message: null } });
    expect((await envoyerMontage('a', MONTAGE_PRET)).status).toBe(200);
    expect(await lire(path.join(d, 'montage.json'))).toEqual(MONTAGE_PRET);
    expect(await lire(path.join(d, 'episode.json'))).toEqual(EN_VALIDATION);
    expect((await (await fetch(`${url}/api/tournages/a`)).json()).montageEnregistre).toBe(true);
  });
  it('refuse un montage invalide', async () => {
    await tournage('a', { 'analyse.json': exemple });
    const r = await envoyerMontage('a', { version: 1, titre: 'x' });
    expect(r.status).toBe(400);
    expect((await r.json()).erreur).toContain('coupes doit être une liste');
  });
});

describe('rendu', () => {
  it('refuse le rendu tant qu’une proposition de consigne est en attente', async () => {
    await tournage('a', { 'analyse.json': exemple, 'montage.json': MONTAGE_PRET, 'consignes.json': EN_ATTENTE });
    const r = await demanderRendu('a', 'tout');
    expect(r.status).toBe(422);
    expect((await r.json()).problemes).toEqual(['Consigne : 1 proposition(s) en attente.']);
  });
  it('refuse le rendu tant qu’un élément à l’écran est à valider', async () => {
    const elements = [{ id: 'se0', debut: 3.0, fin: 4.3, statut: 'a-valider', nature: 'texte', texte: 'SSO', position: 'haut-gauche' }];
    await tournage('a', { 'analyse.json': exemple, 'montage.json': { ...MONTAGE_PRET, elements } });
    const r = await demanderRendu('a', 'tout');
    expect(r.status).toBe(422);
    expect((await r.json()).problemes).toEqual(['1 élément(s) à l’écran à valider.']);
  });
  it('exige un montage enregistré', async () => {
    await tournage('a', { 'analyse.json': exemple });
    const r = await demanderRendu('a', 'tout');
    expect(r.status).toBe(409);
    expect((await r.json()).erreur).toContain('montage.json absent');
  });
  it('liste ce qui empêche le rendu', async () => {
    await tournage('a', { 'analyse.json': exemple, 'montage.json': { ...MONTAGE_PRET, chapitres: [{ titre: ' ', debut: 0 }] } });
    const r = await demanderRendu('a', 'tout');
    expect(r.status).toBe(422);
    expect((await r.json()).problemes).toEqual(['Le chapitre 1 n’a pas de titre.']);
    expect(config.rendre).not.toHaveBeenCalled();
  });
  it('refuse une cible inconnue', async () => {
    await tournage('a', { 'analyse.json': exemple, 'montage.json': MONTAGE_PRET });
    expect((await demanderRendu('a', 0)).status).toBe(400);
  });
  it('met à jour le glossaire, valide le tournage et lance le rendu', async () => {
    await writeFile(config.cheminGlossaire, JSON.stringify({
      termes: [{ terme: 'sso', definition: 'Ancienne.' }, { terme: 'API', definition: 'Interface.' }],
    }));
    const d = await tournage('a', { 'analyse.json': exemple, 'montage.json': MONTAGE_PRET, 'episode.json': EN_VALIDATION });
    const r = await demanderRendu('a', 2);
    expect(r.status).toBe(202);
    expect(config.rendre).toHaveBeenCalledWith(d, 2, expect.any(Function));
    expect(await lire(config.cheminGlossaire)).toEqual({
      termes: [{ terme: 'sso', definition: 'Authentification unique.' }, { terme: 'API', definition: 'Interface.' }],
    });
    expect((await lire(path.join(d, 'episode.json'))).statut).toBe('valide');
    await config.suivi.attendre();
    expect(await (await fetch(`${url}/api/rendu`)).json()).toMatchObject({
      nom: 'a', enCours: false, resultats: [{ fichier: 'video-complete.mp4', ok: true, message: null }],
    });
  });
  it('refuse un second rendu et toute modification du montage pendant le rendu', async () => {
    let finir!: () => void;
    vi.mocked(config.rendre).mockImplementationOnce(() => new Promise(r => { finir = () => r([]); }));
    await tournage('a', { 'analyse.json': exemple, 'montage.json': MONTAGE_PRET });
    expect((await demanderRendu('a', 'tout')).status).toBe(202);
    expect((await envoyerMontage('a', MONTAGE_PRET)).status).toBe(409);
    expect((await demanderRendu('a', 'tout')).status).toBe(409);
    await vi.waitFor(() => expect(finir).toBeTypeOf('function'));
    finir();
  });
  it('accepte un seul rendu parmi deux demandes simultanées', async () => {
    let finir!: () => void;
    vi.mocked(config.rendre).mockImplementationOnce(() => new Promise(r => { finir = () => r([]); }));
    await tournage('a', { 'analyse.json': exemple, 'montage.json': MONTAGE_PRET });
    const statuts = (await Promise.all([demanderRendu('a', 'tout'), demanderRendu('a', 'tout')])).map(r => r.status);
    expect(statuts.sort()).toEqual([202, 409]);
    expect(config.rendre).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(finir).toBeTypeOf('function'));
    finir();
  });
});

describe('relance des suggestions', () => {
  it('relance puis renvoie le tournage relu', async () => {
    const d = await tournage('a', { 'analyse.json': { ...exemple, suggestions: null, erreurSuggestions: 'API indisponible' } });
    vi.mocked(config.relancerSuggestions).mockImplementationOnce(async dossier => {
      await writeFile(path.join(dossier, 'analyse.json'), JSON.stringify(exemple));
    });
    const r = await fetch(`${url}/api/tournages/a/suggestions`, { method: 'POST' });
    expect(r.status).toBe(200);
    expect((await r.json()).analyse.erreurSuggestions).toBeNull();
    expect(config.relancerSuggestions).toHaveBeenCalledWith(d);
  });
  it('signale l’échec de la relance', async () => {
    await tournage('a', { 'analyse.json': exemple });
    vi.mocked(config.relancerSuggestions).mockRejectedValueOnce(new Error('python introuvable'));
    const r = await fetch(`${url}/api/tournages/a/suggestions`, { method: 'POST' });
    expect(r.status).toBe(500);
    expect((await r.json()).erreur).toContain('python introuvable');
  });
});

describe('consignes', () => {
  it('enregistre une proposition dont la zone a été tracée, refuse une zone mal formée', async () => {
    await tournage('a', { 'analyse.json': exemple });
    const avec = (zone: unknown) => ({
      version: 1,
      consignes: [{
        ...EN_ATTENTE.consignes[0]!,
        propositions: [{
          operation: { type: 'ajouterElement', nature: 'zoom', premierMot: 3, dernierMot: 5, zone },
          explication: 'Zoome sur le bouton.',
          etat: 'en-attente',
        }],
      }],
    });
    expect((await envoyerConsignes('a', avec({ x: 480, y: 270, largeur: 960, hauteur: 540 }))).status).toBe(200);
    const r = await envoyerConsignes('a', avec({ x: 'a' }));
    expect(r.status).toBe(400);
    expect((await r.json()).erreur).toBe('consignes invalides : champ zone invalide dans la consigne c1');
  });
  it('interprète une consigne, vérifie les propositions et l’enregistre', async () => {
    const d = await tournage('a', { 'analyse.json': exemple });
    const r = await donnerConsigne('a', { texte: '  Coupe la salutation ', ancrage: { premierMot: 0, dernierMot: 2 } });
    expect(r.status).toBe(200);
    const consigne = await r.json();
    expect(consigne).toMatchObject({
      texte: 'Coupe la salutation',
      ancrage: { premierMot: 0, dernierMot: 2 },
      reformulation: 'Couper la salutation.',
      nonRealisable: ['Ajouter une musique : aucune opération ne le permet.'],
      propositions: [
        { operation: { type: 'couper', premierMot: 0, dernierMot: 2 }, explication: 'Coupe « Bonjour à tous. ».', etat: 'en-attente' },
        {
          operation: { type: 'renommerChapitre', premierMotChapitre: 4, titre: 'X' },
          explication: 'Renomme un chapitre.',
          etat: 'invalide',
          probleme: 'Aucun chapitre ne commence au mot 4.',
        },
      ],
    });
    expect(typeof consigne.id).toBe('string');
    expect(Number.isNaN(Date.parse(consigne.date))).toBe(false);
    expect(await lire(path.join(d, 'consignes.json'))).toEqual({ version: 1, consignes: [consigne] });
    expect(config.interpreterConsigne).toHaveBeenCalledWith(expect.objectContaining({
      texte: 'Coupe la salutation',
      ancrage: { premierMot: 0, dernierMot: 2 },
      definitionMax: 160,
      texteMax: 40,
      modele: 'claude-opus-5-5',
    }));
    const demande = vi.mocked(config.interpreterConsigne).mock.calls[0]![0];
    expect(demande.analyse.mots).toHaveLength(6);
    expect(demande.montage.chapitres[0]).toEqual({ titre: 'Introduction', debut: 0 });
  });
  it('ajoute la consigne à celles déjà enregistrées', async () => {
    const d = await tournage('a', { 'analyse.json': exemple, 'consignes.json': EN_ATTENTE });
    expect((await donnerConsigne('a', { texte: 'Coupe', ancrage: null })).status).toBe(200);
    expect((await lire(path.join(d, 'consignes.json'))).consignes.map((c: { texte: string }) => c.texte)).toEqual([
      'Coupe la salutation', 'Coupe',
    ]);
  });
  it('refuse une consigne vide ou un ancrage hors de la transcription', async () => {
    await tournage('a', { 'analyse.json': exemple });
    expect((await donnerConsigne('a', { texte: '  ', ancrage: null })).status).toBe(400);
    const r = await donnerConsigne('a', { texte: 'Coupe', ancrage: { premierMot: 0, dernierMot: 99 } });
    expect(r.status).toBe(400);
    expect((await r.json()).erreur).toContain('Le mot 99 n’existe pas');
    expect((await donnerConsigne('a', { texte: 'Coupe', ancrage: { premierMot: 'a' } })).status).toBe(400);
    expect(config.interpreterConsigne).not.toHaveBeenCalled();
  });
  it('signale l’échec de Claude sans rien enregistrer', async () => {
    const d = await tournage('a', { 'analyse.json': exemple });
    vi.mocked(config.interpreterConsigne).mockRejectedValueOnce(
      new ErreurInterpretation(503, 'Limite de requêtes de l’API Claude atteinte, réessayez plus tard.'),
    );
    const r = await donnerConsigne('a', { texte: 'Coupe', ancrage: null });
    expect(r.status).toBe(503);
    expect((await r.json()).erreur).toBe('Limite de requêtes de l’API Claude atteinte, réessayez plus tard.');
    vi.mocked(config.interpreterConsigne).mockRejectedValueOnce(new Error('panne'));
    const r2 = await donnerConsigne('a', { texte: 'Coupe', ancrage: null });
    expect(r2.status).toBe(500);
    expect((await r2.json()).erreur).toContain('panne');
    await expect(readFile(path.join(d, 'consignes.json'), 'utf-8')).rejects.toThrow();
  });
  it('enregistre les consignes après une acceptation ou un refus', async () => {
    const d = await tournage('a', { 'analyse.json': exemple });
    expect((await envoyerConsignes('a', EN_ATTENTE)).status).toBe(200);
    expect(await lire(path.join(d, 'consignes.json'))).toEqual(EN_ATTENTE);
    const r = await envoyerConsignes('a', { version: 1 });
    expect(r.status).toBe(400);
    expect((await r.json()).erreur).toContain('consignes doit être une liste');
  });
  it('refuse les consignes pendant un rendu', async () => {
    let finir!: () => void;
    vi.mocked(config.rendre).mockImplementationOnce(() => new Promise(r => { finir = () => r([]); }));
    await tournage('a', { 'analyse.json': exemple, 'montage.json': MONTAGE_PRET });
    expect((await demanderRendu('a', 'tout')).status).toBe(202);
    expect((await donnerConsigne('a', { texte: 'Coupe', ancrage: null })).status).toBe(409);
    expect((await envoyerConsignes('a', EN_ATTENTE)).status).toBe(409);
    expect(config.interpreterConsigne).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(finir).toBeTypeOf('function'));
    finir();
  });
});

describe('dépôt de la vidéo', () => {
  it('écrit la vidéo dans bruts/ et la signale dans la liste', async () => {
    const d = await tournage('a', {});
    const r = await envoyerVideo('a', 'Film Clipchamp.mp4', 'contenu vidéo');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ fichier: 'Film Clipchamp.mp4' });
    expect(await readFile(path.join(d, 'bruts', 'Film Clipchamp.mp4'), 'utf-8')).toBe('contenu vidéo');
    expect((await (await fetch(`${url}/api/tournages`)).json())[0].videoPresente).toBe(true);
  });
  it('ne compte pas l’enregistrement de la webcam comme vidéo du montage', async () => {
    const d = await tournage('a', {});
    await mkdir(path.join(d, 'bruts'));
    await writeFile(path.join(d, 'bruts', 'film-camera.mkv'), 'webcam');
    expect((await (await fetch(`${url}/api/tournages`)).json())[0].videoPresente).toBe(false);
    expect((await envoyerVideo('a', 'film.mkv', 'x')).status).toBe(200);
  });
  it('refuse un fichier non vidéo, un chemin ou une vidéo vide', async () => {
    const d = await tournage('a', {});
    await mkdir(path.join(d, 'bruts'));
    for (const invalide of ['notes.txt', '..\\film.mp4', 'sous\\film.mp4', 'a.mp4:x.mp4', 'CON.mp4', 'film?.mp4']) {
      expect((await envoyerVideo('a', invalide, 'x')).status, invalide).toBe(400);
    }
    expect((await envoyerVideo('a', 'film-camera.mp4', 'x')).status).toBe(400);
    expect((await envoyerVideo('a', 'film.mp4', '')).status).toBe(400);
    expect(readdirSync(path.join(d, 'bruts'))).toEqual([]);
  });
  it('refuse une seconde vidéo', async () => {
    await tournage('a', {});
    await envoyerVideo('a', 'film.mp4', 'x');
    const r = await envoyerVideo('a', 'autre.mov', 'y');
    expect(r.status).toBe(409);
    expect((await r.json()).erreur).toBe('Ce tournage a déjà une vidéo dans bruts/.');
  });
  it('refuse un second envoi simultané puis accepte le premier', async () => {
    const d = await tournage('a', {});
    const partiel = path.join(d, 'bruts', 'film.mp4.partiel');
    const req = http.request(`${url}/api/tournages/a/video?fichier=film.mp4`, { method: 'PUT' });
    const fini = new Promise<number | undefined>(resolve => req.on('response', res => { res.resume(); resolve(res.statusCode); }));
    req.write(Buffer.alloc(1000));
    await vi.waitFor(() => expect(existsSync(partiel)).toBe(true));
    const r = await envoyerVideo('a', 'autre.mov', 'y');
    expect(r.status).toBe(409);
    expect((await r.json()).erreur).toBe('Une vidéo est déjà en cours d’envoi pour ce tournage.');
    req.end();
    expect(await fini).toBe(200);
    expect(readdirSync(path.join(d, 'bruts'))).toEqual(['film.mp4']);
  });
  it('supprime le fichier partiel d’un envoi interrompu', async () => {
    const d = await tournage('a', {});
    const partiel = path.join(d, 'bruts', 'film.mp4.partiel');
    const req = http.request(`${url}/api/tournages/a/video?fichier=film.mp4`, { method: 'PUT' });
    req.on('error', () => undefined);
    req.write(Buffer.alloc(1000));
    await vi.waitFor(() => expect(existsSync(partiel)).toBe(true));
    req.destroy();
    await vi.waitFor(() => expect(readdirSync(path.join(d, 'bruts'))).toEqual([]));
  });
});

describe('analyse', () => {
  it('lance l’analyse en arrière-plan et la montre en cours dans la liste', async () => {
    const d = await avecVideo('a', { 'preparation.json': {} });
    const finir = analyseBloquee();
    const r = await demanderAnalyse('a', 'Mon titre');
    expect(r.status).toBe(202);
    expect(config.analyser).toHaveBeenCalledWith(d, 'Mon titre');
    expect((await (await fetch(`${url}/api/tournages`)).json())[0]).toMatchObject({ analyseEnCours: true, etapeAnalyse: 'transcription', videoPresente: true });
    finir();
    await config.suiviAnalyse.attendre();
    expect((await (await fetch(`${url}/api/tournages`)).json())[0].analyseEnCours).toBe(false);
  });
  it('refuse une deuxième analyse pendant la première', async () => {
    await avecVideo('a');
    await avecVideo('b');
    const finir = analyseBloquee();
    await demanderAnalyse('a', 'Premier');
    const r = await demanderAnalyse('b', 'Second');
    expect(r.status).toBe(409);
    expect((await r.json()).erreur).toBe('Une analyse est déjà en cours : Premier');
    expect(config.analyser).toHaveBeenCalledTimes(1);
    finir();
  });
  it('refuse sans titre ou sans vidéo', async () => {
    await avecVideo('a');
    await tournage('b', {});
    expect((await demanderAnalyse('a', ' ')).status).toBe(400);
    expect((await demanderAnalyse('b', 'Titre')).status).toBe(409);
    expect(config.analyser).not.toHaveBeenCalled();
  });
  it('garde l’erreur du pipeline et la reporte dans episode.json', async () => {
    const d = await avecVideo('a');
    vi.mocked(config.analyser).mockRejectedValue(new Error('python.exe introuvable'));
    await demanderAnalyse('a', 'Titre');
    await config.suiviAnalyse.attendre();
    expect(config.suiviAnalyse.etat()).toMatchObject({ enCours: false, nom: 'a', titre: 'Titre', erreur: 'python.exe introuvable' });
    expect(await lire(path.join(d, 'episode.json'))).toMatchObject({ statut: 'erreur', message: 'python.exe introuvable' });
  });
  it('laisse le message écrit par le pipeline', async () => {
    const d = await avecVideo('a');
    vi.mocked(config.analyser).mockImplementation(async dossier => {
      await writeFile(path.join(dossier, 'episode.json'), JSON.stringify({ version: 1, titre: 'Titre', statut: 'erreur', message: 'Aucune vidéo lisible.' }));
      throw new Error('Erreur : Aucune vidéo lisible.\nTraceback…');
    });
    await demanderAnalyse('a', 'Titre');
    await config.suiviAnalyse.attendre();
    expect((await lire(path.join(d, 'episode.json'))).message).toBe('Aucune vidéo lisible.');
  });
});
