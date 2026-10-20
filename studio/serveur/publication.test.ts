import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import exemple from '../../fixtures/analyse-exemple.json';
import type { Publication } from '../../noyau/publication';
import { creerApiPublication, type ConfigPublication } from './publication';

const MONTAGE = {
  version: 1, titre: 'Essai', coupes: [],
  chapitres: [{ titre: 'Intro', debut: 0 }, { titre: 'Le SSO', debut: 3 }],
  termes: [{ terme: 'SSO', definition: 'Authentification unique.', occurrences: [3.8], statut: 'valide', position: 'bas' }],
  elements: [],
};
const RENDU = { version: 1, titre: 'Essai', statut: 'rendu', message: null };
const PROPOSITION = { titre: 'Le SSO expliqué', variantesTitre: ['A', 'B'], description: 'Desc', tags: ['sso'], accroches: ['Un seul mot de passe'] };
const SITE = { categories: [{ id: 1, nom: 'IA' }], playlists: [] };

let racine: string;
let url: string;
let serveur: http.Server;
let config: ConfigPublication;

async function tournage(nom: string, episode: unknown = RENDU): Promise<string> {
  const dossier = path.join(racine, 'tournages', nom);
  await mkdir(path.join(dossier, 'rendus'), { recursive: true });
  await writeFile(path.join(dossier, 'analyse.json'), JSON.stringify(exemple), 'utf-8');
  await writeFile(path.join(dossier, 'montage.json'), JSON.stringify(MONTAGE), 'utf-8');
  await writeFile(path.join(dossier, 'episode.json'), JSON.stringify(episode), 'utf-8');
  for (const f of ['video-complete.mp4', 'episode-01-intro.mp4', 'episode-02-le-sso.mp4']) await writeFile(path.join(dossier, 'rendus', f), '');
  return dossier;
}

const json = { 'Content-Type': 'application/json' };
const lirePublication = async (nom: string) => (await (await fetch(`${url}/api/tournages/${nom}/publication`)).json()).publication as Publication;
const envoyer = (nom: string, p: unknown) => fetch(`${url}/api/tournages/${nom}/publication`, { method: 'PUT', headers: json, body: JSON.stringify(p) });
const action = (nom: string, quoi: string, corps: unknown) =>
  fetch(`${url}/api/tournages/${nom}/publication/${quoi}`, { method: 'POST', headers: json, body: JSON.stringify(corps) });

beforeEach(async () => {
  racine = await mkdtemp(path.join(os.tmpdir(), 'pmt-publication-'));
  await mkdir(path.join(racine, 'tournages'));
  await mkdir(path.join(racine, 'poses'));
  config = {
    racineTournages: path.join(racine, 'tournages'),
    cheminPoses: path.join(racine, 'poses'),
    urlFichiers: 'http://127.0.0.1:9999',
    urlPoses: 'http://127.0.0.1:9998',
    urlSite: 'https://site.example',
    lireSite: vi.fn(async () => SITE),
    rediger: vi.fn(async () => PROPOSITION),
    extraireImage: vi.fn(async (_video: string, _instant: number, sortie: string) => {
      await mkdir(path.dirname(sortie), { recursive: true });
      await writeFile(sortie, 'png');
    }),
    detourer: vi.fn(async (_entree: string, sortie: string) => { await writeFile(sortie, 'png'); }),
    rendreVignette: vi.fn(async (_props, sortie: string) => {
      await mkdir(path.dirname(sortie), { recursive: true });
      await writeFile(sortie, 'jpg');
      return { octets: 3, qualite: 90 };
    }),
  };
  const api = creerApiPublication(config);
  serveur = http.createServer(async (req, res) => {
    if (!(await api(req, res))) res.writeHead(418).end();
  });
  await new Promise<void>(r => serveur.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>(r => serveur.close(() => r()));
});

describe('détail de la publication', () => {
  it('laisse passer les autres routes', async () => {
    expect((await fetch(`${url}/api/tournages`)).status).toBe(418);
  });
  it('attend la fin du rendu', async () => {
    await tournage('a', { ...RENDU, statut: 'valide' });
    const r = await fetch(`${url}/api/tournages/a/publication`);
    expect(r.status).toBe(409);
    expect((await r.json()).erreur).toContain('rendu');
  });
  it('liste les vidéos rendues et une publication par défaut', async () => {
    await tournage('a');
    const d = await (await fetch(`${url}/api/tournages/a/publication`)).json();
    expect(d.videos.map((v: { cible: unknown; titre: string; fichier: string; rendue: boolean }) => [v.cible, v.titre, v.fichier, v.rendue])).toEqual([
      ['complete', 'Essai', 'video-complete.mp4', true],
      [1, 'Intro', 'episode-01-intro.mp4', true],
      [2, 'Le SSO', 'episode-02-le-sso.mp4', true],
    ]);
    expect(d.videos[0].chapitres).toEqual([]);
    expect(d.publication.videos.map((v: { publier: boolean }) => v.publier)).toEqual([true, false, false]);
    expect(d.sourceUrl).toBe('http://127.0.0.1:9999/a/source.mp4');
    expect(d.urlTournage).toBe('http://127.0.0.1:9999/a');
    expect(d.site).toEqual(SITE);
    expect(d.camera).toBeNull();
    expect(d.reglages.titreMax).toBe(100);
  });
  it('repère un enregistrement caméra séparé s’il accompagne un seul autre enregistrement', async () => {
    const dossier = await tournage('a');
    await mkdir(path.join(dossier, 'bruts'));
    await writeFile(path.join(dossier, 'bruts', 'prise.mp4'), '');
    await writeFile(path.join(dossier, 'bruts', 'prise-camera.mp4'), '');
    expect((await (await fetch(`${url}/api/tournages/a/publication`)).json()).camera).toBe('prise-camera.mp4');
    await writeFile(path.join(dossier, 'bruts', 'prise2.mp4'), '');
    expect((await (await fetch(`${url}/api/tournages/a/publication`)).json()).camera).toBeNull();
  });
});

describe('enregistrement', () => {
  it('refuse une publication mal formée', async () => {
    await tournage('a');
    expect((await envoyer('a', { version: 2 })).status).toBe(400);
  });
  it('enregistre les modifications sans laisser le studio changer le statut', async () => {
    const dossier = await tournage('a');
    const p = await lirePublication('a');
    const modifiee = { ...p, videos: p.videos.map(v => (v.cible === 1 ? { ...v, publier: true, titre: 'X', statut: 'prete' } : v)) };
    const r = await envoyer('a', modifiee);
    expect(r.status).toBe(200);
    const enregistree = JSON.parse(await readFile(path.join(dossier, 'publication.json'), 'utf-8')) as Publication;
    expect(enregistree.videos[1]).toMatchObject({ publier: true, titre: 'X', statut: 'a-preparer' });
  });
});

describe('rédaction', () => {
  it('envoie à Claude les paroles conservées et enregistre la proposition', async () => {
    await tournage('a');
    const r = await action('a', 'redaction', { cible: 'complete' });
    expect(r.status).toBe(200);
    expect(config.rediger).toHaveBeenCalledWith(expect.objectContaining({
      titreVideo: 'Essai', chapitres: ['Intro', 'Le SSO'], profil: 'perso',
      termes: [{ terme: 'SSO', definition: 'Authentification unique.' }],
    }));
    expect(vi.mocked(config.rediger).mock.calls[0]![0].texte).toContain('Bonjour');
    const p = (await r.json()) as Publication;
    expect(p.videos[0]).toMatchObject({ titre: 'Le SSO expliqué', variantesTitre: ['A', 'B'], accroches: ['Un seul mot de passe'] });
  });
  it('refuse une cible inconnue', async () => {
    await tournage('a');
    expect((await action('a', 'redaction', { cible: 9 })).status).toBe(400);
  });
});

describe('images', () => {
  it('extrait l’image de l’écran une seule fois', async () => {
    const dossier = await tournage('a');
    const r = await action('a', 'image', { source: 'ecran', instant: 1.5 });
    expect(await r.json()).toEqual({ chemin: 'publication/images/ecran-1500.png' });
    expect(config.extraireImage).toHaveBeenCalledWith(path.join(dossier, 'source.mp4'), 1.5, path.join(dossier, 'publication', 'images', 'ecran-1500.png'));
    await action('a', 'image', { source: 'ecran', instant: 1.5 });
    expect(config.extraireImage).toHaveBeenCalledTimes(1);
  });
  it('extrait et détoure l’image de la caméra séparée', async () => {
    const dossier = await tournage('a');
    await mkdir(path.join(dossier, 'bruts'));
    await writeFile(path.join(dossier, 'bruts', 'prise.mp4'), '');
    await writeFile(path.join(dossier, 'bruts', 'prise-camera.mp4'), '');
    const r = await action('a', 'image', { source: 'camera', instant: 2 });
    expect(await r.json()).toEqual({ chemin: 'publication/images/camera-2000.detoure.png' });
    expect(config.detourer).toHaveBeenCalledTimes(1);
  });
  it('refuse la caméra sans enregistrement séparé, et un instant hors de la vidéo', async () => {
    await tournage('a');
    expect((await action('a', 'image', { source: 'camera', instant: 2 })).status).toBe(409);
    expect((await action('a', 'image', { source: 'ecran', instant: 999 })).status).toBe(400);
  });
});

describe('vignette et validation', () => {
  async function preparer() {
    const dossier = await tournage('a');
    await writeFile(path.join(racine, 'poses', 'surpris.jpg'), 'jpg');
    await writeFile(path.join(racine, 'poses', 'surpris.detoure.png'), 'png');
    const p = await lirePublication('a');
    const vignette = { pose: { source: 'banque', fichier: 'surpris.jpg' }, fond: { source: 'charte' }, accroche: 'Un seul mot de passe', fichier: null };
    await envoyer('a', { ...p, videos: p.videos.map(v => (v.cible === 'complete' ? { ...v, titre: 'Titre', description: 'Desc', vignette } : v)) });
    return dossier;
  }
  it('rend la vignette avec les adresses de ses images', async () => {
    const dossier = await preparer();
    const r = await action('a', 'vignette', { cible: 'complete' });
    expect(r.status).toBe(200);
    expect(config.rendreVignette).toHaveBeenCalledWith(
      { fondUrl: null, poseUrl: 'http://127.0.0.1:9998/surpris.detoure.png', accroche: 'Un seul mot de passe' },
      path.join(dossier, 'rendus', 'vignettes', 'complete.jpg'),
      2_000_000,
    );
    expect(((await r.json()) as Publication).videos[0]!.vignette!.fichier).toBe('rendus/vignettes/complete.jpg');
  });
  it('refuse une vignette dont l’image manque', async () => {
    await preparer();
    await rm(path.join(racine, 'poses', 'surpris.detoure.png'));
    expect((await action('a', 'vignette', { cible: 'complete' })).status).toBe(409);
  });
  it('valide une vidéo complète, et explique ce qui manque sinon', async () => {
    await preparer();
    const refus = await action('a', 'valider', { cible: 'complete' });
    expect(refus.status).toBe(422);
    expect((await refus.json()).problemes).toEqual(['Vignette à rendre.']);
    await action('a', 'vignette', { cible: 'complete' });
    const ok = await action('a', 'valider', { cible: 'complete' });
    expect(((await ok.json()) as Publication).videos[0]!.statut).toBe('prete');
  });
});

describe('banque de poses', () => {
  it('détoure les photos nouvelles une seule fois', async () => {
    await writeFile(path.join(racine, 'poses', 'souriant.jpg'), 'jpg');
    await writeFile(path.join(racine, 'poses', 'notes.txt'), '');
    const poses = await (await fetch(`${url}/api/poses`)).json();
    expect(poses).toEqual([{ fichier: 'souriant.jpg', url: 'http://127.0.0.1:9998/souriant.detoure.png' }]);
    expect(existsSync(path.join(racine, 'poses', 'souriant.detoure.png'))).toBe(true);
    await fetch(`${url}/api/poses`);
    expect(config.detourer).toHaveBeenCalledTimes(1);
  });
  it('partage un seul détourage entre des appels simultanés', async () => {
    await writeFile(path.join(racine, 'poses', 'souriant.jpg'), 'jpg');
    const reponses = await Promise.all([fetch(`${url}/api/poses`), fetch(`${url}/api/poses`)]);
    expect(reponses.map(r => r.status)).toEqual([200, 200]);
    expect(config.detourer).toHaveBeenCalledTimes(1);
  });
});
