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
  await new Promise<void>(r => serveur.close(() => r()));
});

describe('liste des tournages', () => {
  it('liste les tournages du plus récent au plus ancien avec leur statut', async () => {
    await tournage('2026-10-01-a', { 'analyse.json': exemple, 'episode.json': { version: 1, titre: 'A', statut: 'analyse', message: null } });
    await tournage('2026-10-02-b', {});
    expect(await (await fetch(`${url}/api/tournages`)).json()).toEqual([
      { nom: '2026-10-02-b', titre: '2026-10-02-b', statut: null, message: null, analyseFaite: false },
      { nom: '2026-10-01-a', titre: 'A', statut: 'analyse', message: null, analyseFaite: true },
    ]);
  });
  it('laisse passer les requêtes hors API', async () => {
    expect((await fetch(`${url}/index.html`)).status).toBe(418);
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
