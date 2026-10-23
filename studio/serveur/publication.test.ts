import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import exemple from '../../fixtures/analyse-exemple.json';
import { videoParDefaut, type Publication } from '../../noyau/publication';
import type { Qualification } from '../../noyau/qualification';
import { creerApiPublication, type ConfigPublication } from './publication';

const MONTAGE = {
  version: 1, titre: 'Essai', coupes: [],
  chapitres: [{ titre: 'Intro', debut: 0 }, { titre: 'Le SSO', debut: 3 }],
  termes: [{ terme: 'SSO', definition: 'Authentification unique.', occurrences: [3.8], statut: 'valide', position: 'bas' }],
  elements: [],
};
const RENDU = { version: 1, titre: 'Essai', statut: 'rendu', message: null };
const PROPOSITION = { titre: 'Le SSO expliqué', variantesTitre: ['A', 'B'], description: 'Desc', tags: ['sso'], accroches: ['Un seul mot de passe'], logiciels: ['Excel'] };
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
  await mkdir(path.join(racine, 'logos'));
  config = {
    racineTournages: path.join(racine, 'tournages'),
    cheminPoses: path.join(racine, 'poses'),
    cheminLogos: path.join(racine, 'logos'),
    urlFichiers: 'http://127.0.0.1:9999',
    urlPoses: 'http://127.0.0.1:9998',
    urlLogos: 'http://127.0.0.1:9997',
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
    lireVisibiliteYoutube: vi.fn(async () => 'publique' as const),
    ouvrirDossier: vi.fn(async () => {}),
    site: {
      envoyerFichier: vi.fn(async (chemin: string) => (chemin.endsWith('.mp4') ? 'objet-video' : 'objet-vignette')),
      enregistrerVideo: vi.fn(async () => 42),
      supprimerVideo: vi.fn(async () => {}),
    },
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
    expect(d.urlSite).toBe('https://site.example');
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
      titreVideo: 'Essai', chapitres: ['Intro', 'Le SSO'], qualification: { nature: 'perso', confidentielle: false },
      termes: [{ terme: 'SSO', definition: 'Authentification unique.' }],
    }));
    expect(vi.mocked(config.rediger).mock.calls[0]![0].texte).toContain('Bonjour');
    const p = (await r.json()) as Publication;
    expect(p.videos[0]).toMatchObject({ titre: 'Le SSO expliqué', variantesTitre: ['A', 'B'], accroches: ['Un seul mot de passe'] });
  });
  it('met la première accroche proposée dans la vignette déjà composée, à rendre de nouveau', async () => {
    await tournage('a');
    const p = await lirePublication('a');
    const vignette = { pose: { source: 'banque', fichier: 'surpris.jpg' }, fond: { source: 'charte' }, accroche: 'Ancienne', fichier: 'rendus/vignettes/complete.jpg' };
    await envoyer('a', { ...p, videos: p.videos.map(v => (v.cible === 'complete' ? { ...v, vignette } : v)) });
    const r = await action('a', 'redaction', { cible: 'complete' });
    expect(((await r.json()) as Publication).videos[0]!.vignette).toMatchObject({ accroche: 'Un seul mot de passe', fichier: null });
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
      { gabarit: 'classique', fondUrl: null, poseUrl: 'http://127.0.0.1:9998/surpris.detoure.png', logoUrls: [], captureUrls: [], accroche: 'Un seul mot de passe' },
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

const ID = 'dQw4w9WgXcQ';
const PERSO: Qualification = { nature: 'perso', confidentielle: false };
const PERSO_CONF: Qualification = { nature: 'perso', confidentielle: true };
const PRO: Qualification = { nature: 'pro', confidentielle: false };
const PRO_CONF: Qualification = { nature: 'pro', confidentielle: true };
const SITE_CHOISI = { replit: { id: null, categorieId: 1, playlistId: null } };
// Vidéo complète validée, vignette rendue ; `changement` complète ses champs (catégorie du site…).
async function prete(q: Qualification = PERSO, changement: Record<string, unknown> = {}) {
  const dossier = await tournage('a');
  await writeFile(path.join(racine, 'poses', 'surpris.jpg'), 'jpg');
  await writeFile(path.join(racine, 'poses', 'surpris.detoure.png'), 'png');
  const p = await lirePublication('a');
  const vignette = { pose: { source: 'banque', fichier: 'surpris.jpg' }, fond: { source: 'charte' }, accroche: 'Un seul mot de passe', fichier: null };
  await envoyer('a', {
    ...p,
    videos: p.videos.map(v => (v.cible === 'complete'
      ? { ...v, ...q, titre: 'Titre', description: 'Desc', tags: ['sso', 'mot de passe'], vignette, ...changement }
      : v)),
  });
  await action('a', 'vignette', { cible: 'complete' });
  expect((await action('a', 'valider', { cible: 'complete' })).status).toBe(200);
  return dossier;
}
const envoi = (corps: Record<string, unknown> = {}) =>
  action('a', 'youtube/envoi', { cible: 'complete', url: `https://youtu.be/${ID}`, visibilite: 'publique', programmeeLe: null, ...corps });

describe('YouTube', () => {
  it('prépare le dossier à téléverser', async () => {
    const dossier = await prete();
    const r = await action('a', 'youtube/preparer', { cible: 'complete' });
    expect(r.status).toBe(200);
    const d = await r.json();
    const sortie = path.join(dossier, 'publication', 'complete');
    expect(d.dossier).toBe(sortie);
    expect(d.rendu).toBe(path.join(sortie, 'video-complete.mp4'));
    expect(d.textes).toMatchObject({ titre: 'Titre', description: 'Desc', tags: 'sso, mot de passe' });
    expect(await readFile(d.rendu, 'utf-8')).toBe(await readFile(path.join(dossier, 'rendus', 'video-complete.mp4'), 'utf-8'));
    expect(await readFile(path.join(sortie, 'vignette.jpg'), 'utf-8')).toBe('jpg');
    const fiche = await readFile(path.join(sortie, 'youtube.txt'), 'utf-8');
    expect(fiche).toContain('=== TITRE ===\nTitre\n');
    expect(fiche).toContain(`Fichier vidéo : ${d.rendu}`);
    expect(fiche).toContain('Science et technologie');
    expect(fiche).not.toContain('Playlist');
  });
  it('suggère une playlist au nom du tournage quand plusieurs vidéos sont publiées', async () => {
    await prete();
    const p = await lirePublication('a');
    await envoyer('a', { ...p, videos: p.videos.map(v => (v.cible === 1 ? { ...v, publier: true } : v)) });
    const d = await (await action('a', 'youtube/preparer', { cible: 'complete' })).json();
    expect(d.textes.reglages).toContain('Playlist : Essai');
  });
  it('refuse une vidéo non validée ou une vignette trop lourde, en expliquant pourquoi', async () => {
    await tournage('a');
    const refus = await action('a', 'youtube/preparer', { cible: 'complete' });
    expect(refus.status).toBe(422);
    expect((await refus.json()).problemes).toContain('Vidéo pas encore validée pour la publication.');
    const dossier = await prete();
    await writeFile(path.join(dossier, 'rendus', 'vignettes', 'complete.jpg'), Buffer.alloc(2_000_001));
    const lourde = await action('a', 'youtube/preparer', { cible: 'complete' });
    expect((await lourde.json()).problemes).toEqual(['Vignette trop lourde : 2000001 octets, 2000000 au plus.']);
  });
  it('ouvre le dossier une fois préparé', async () => {
    const dossier = await prete();
    expect((await action('a', 'youtube/ouvrir', { cible: 'complete' })).status).toBe(409);
    await action('a', 'youtube/preparer', { cible: 'complete' });
    expect((await action('a', 'youtube/ouvrir', { cible: 'complete' })).status).toBe(200);
    expect(config.ouvrirDossier).toHaveBeenCalledWith(path.join(dossier, 'publication', 'complete'));
  });
  it('enregistre l’URL collée et passe la vidéo à envoyée', async () => {
    const dossier = await prete();
    const r = await envoi();
    expect(r.status).toBe(200);
    expect(((await r.json()) as Publication).videos[0]).toMatchObject({
      statut: 'envoyee-youtube', youtube: { id: ID, visibilite: 'publique', programmeeLe: null, playlistId: null },
    });
    const enregistree = JSON.parse(await readFile(path.join(dossier, 'publication.json'), 'utf-8')) as Publication;
    expect(enregistree.videos[0]!.youtube.id).toBe(ID);
  });
  it('refuse une URL non reconnue en rappelant les formes acceptées', async () => {
    await prete();
    const r = await envoi({ url: 'https://vimeo.com/123' });
    expect(r.status).toBe(400);
    expect((await r.json()).erreur).toContain('youtu.be/');
  });
  it('n’accepte que la visibilité déduite de la qualification', async () => {
    await prete(PERSO_CONF);
    const r = await envoi();
    expect(r.status).toBe(422);
    expect((await r.json()).erreur).toBe('Une vidéo Perso confidentielle reste privée sur YouTube.');
    expect((await envoi({ visibilite: 'privee' })).status).toBe(200);
  });
  it('enregistre une vidéo Pro non confidentielle en Non répertoriée', async () => {
    await prete(PRO);
    const r = await envoi({ visibilite: 'non-repertoriee' });
    expect(r.status).toBe(200);
    expect(((await r.json()) as Publication).videos[0]!.youtube.visibilite).toBe('non-repertoriee');
    const d = await (await action('a', 'youtube/preparer', { cible: 'complete' })).json();
    expect(d.textes.reglages).toContain('Visibilité : Non répertoriée');
  });
  it('ne prépare pas pour YouTube une vidéo Pro confidentielle', async () => {
    await prete(PRO_CONF);
    const r = await action('a', 'youtube/preparer', { cible: 'complete' });
    expect(r.status).toBe(422);
    expect((await r.json()).problemes).toEqual(['Une vidéo Pro confidentielle ne va pas sur YouTube : elle est seulement relayée sur le site.']);
  });
  it('vérifie la visibilité par oEmbed une fois l’URL collée', async () => {
    await prete();
    expect((await action('a', 'youtube/verifier', { cible: 'complete' })).status).toBe(409);
    await envoi();
    vi.mocked(config.lireVisibiliteYoutube).mockResolvedValueOnce('non-publique');
    const r = await action('a', 'youtube/verifier', { cible: 'complete' });
    expect(await r.json()).toEqual({
      lecture: 'non-publique', alerte: true,
      message: 'Vidéo pas encore lisible publiquement : passez-la en public dans YouTube Studio, ou attendez l’heure programmée.',
    });
    expect(config.lireVisibiliteYoutube).toHaveBeenCalledWith(ID);
  });
});

describe('relais sur le site', () => {
  const relayer = () => action('a', 'relais', { cible: 'complete' });
  const site = () => config.site!;

  it('relaie une vidéo Pro confidentielle : fichier et vignette dans le stockage, réservée aux comptes autorisés', async () => {
    const dossier = await prete(PRO_CONF, SITE_CHOISI);
    const r = await relayer();
    expect(r.status).toBe(200);
    expect(((await r.json()) as Publication).videos[0]).toMatchObject({ statut: 'relayee', replit: { id: 42, categorieId: 1 }, erreur: null });
    expect(site().envoyerFichier).toHaveBeenCalledWith(path.join(dossier, 'rendus', 'vignettes', 'complete.jpg'), 'image/jpeg');
    expect(site().envoyerFichier).toHaveBeenCalledWith(path.join(dossier, 'rendus', 'video-complete.mp4'), 'video/mp4');
    expect(site().enregistrerVideo).toHaveBeenCalledWith(null, expect.objectContaining({
      title: 'Titre', description: 'Desc', tags: ['sso', 'mot de passe'], categoryId: 1, playlistId: null, format: 'long', status: 'published',
      visibility: 'interne', videoObject: 'objet-video', videoUrl: null, thumbnailObject: 'objet-vignette', durationSeconds: expect.any(Number),
    }));
    expect(config.lireVisibiliteYoutube).not.toHaveBeenCalled();
    const enregistree = JSON.parse(await readFile(path.join(dossier, 'publication.json'), 'utf-8')) as Publication;
    expect(enregistree.videos[0]!.replit.id).toBe(42);
  });
  it('met à jour la vidéo du site au relais suivant', async () => {
    await prete(PRO_CONF, SITE_CHOISI);
    await relayer();
    expect((await relayer()).status).toBe(200);
    expect(site().enregistrerVideo).toHaveBeenLastCalledWith(42, expect.anything());
  });
  it('refuse une vidéo Perso, ou sans catégorie, en expliquant pourquoi', async () => {
    await prete(PERSO);
    const perso = await relayer();
    expect(perso.status).toBe(422);
    expect((await perso.json()).problemes).toEqual(['Une vidéo Perso n’est pas relayée sur le site.']);
    await prete(PRO_CONF);
    expect((await (await relayer()).json()).problemes).toEqual(['Choisissez la catégorie du site.']);
    expect(site().enregistrerVideo).not.toHaveBeenCalled();
  });
  it('refuse tant que le site n’est pas configuré', async () => {
    await prete(PRO_CONF, SITE_CHOISI);
    config.site = null;
    expect((await (await relayer()).json()).problemes)
      .toEqual(['Site non configuré : renseignez REPLIT_SITE_URL et REPLIT_API_KEY dans .env, puis relancez le studio.']);
  });
  it('relaie une vidéo Pro non confidentielle une fois lisible par lien, en intégrant la vidéo YouTube', async () => {
    await prete(PRO, SITE_CHOISI);
    expect((await (await relayer()).json()).problemes)
      .toEqual(['Enregistrez d’abord l’envoi sur YouTube : une vidéo Pro non confidentielle est relayée avec son lien YouTube.']);
    await envoi({ visibilite: 'non-repertoriee' });
    vi.mocked(config.lireVisibiliteYoutube).mockResolvedValueOnce('non-publique');
    const attente = await relayer();
    expect(attente.status).toBe(422);
    expect((await attente.json()).erreur).toBe('Vidéo pas encore lisible : passez-la en Non répertoriée dans YouTube Studio.');
    expect((await relayer()).status).toBe(200);
    expect(config.lireVisibiliteYoutube).toHaveBeenLastCalledWith(ID);
    expect(site().envoyerFichier).toHaveBeenCalledTimes(1);
    expect(site().enregistrerVideo).toHaveBeenCalledWith(null, expect.objectContaining({
      visibility: 'public', videoUrl: `https://www.youtube.com/watch?v=${ID}`, videoObject: null, thumbnailObject: 'objet-vignette',
    }));
  });
  it('garde le statut et note l’erreur si le site échoue, puis reprend au relais suivant', async () => {
    const dossier = await prete(PRO_CONF, SITE_CHOISI);
    vi.mocked(site().enregistrerVideo).mockRejectedValueOnce(new Error('Site injoignable (ECONNREFUSED) : le relais reste à faire, rien n’est perdu.'));
    const r = await relayer();
    expect(r.status).toBe(502);
    expect((await r.json()).erreur).toBe('Relais impossible : Site injoignable (ECONNREFUSED) : le relais reste à faire, rien n’est perdu.');
    const apres = JSON.parse(await readFile(path.join(dossier, 'publication.json'), 'utf-8')) as Publication;
    expect(apres.videos[0]).toMatchObject({ statut: 'prete', erreur: { etape: 'replit' } });
    expect(((await (await relayer()).json()) as Publication).videos[0]).toMatchObject({ statut: 'relayee', erreur: null });
  });
});

describe('lecture d’un publication.json en version 1', () => {
  it('convertit les profils et réécrit le fichier en version 2 au prochain enregistrement', async () => {
    const dossier = await tournage('a');
    const { nature: _n, confidentielle: _c, ...base } = videoParDefaut('complete', PERSO);
    await writeFile(path.join(dossier, 'publication.json'),
      JSON.stringify({ version: 1, profilParDefaut: 'mixte', videos: [{ ...base, profil: 'interne' }] }), 'utf-8');
    const p = await lirePublication('a');
    expect(p.version).toBe(2);
    expect(p.qualificationParDefaut).toEqual(PRO);
    expect(p.videos[0]).toMatchObject(PRO_CONF);
    expect(p.videos[0]).not.toHaveProperty('profil');
    expect((await envoyer('a', p)).status).toBe(200);
    expect(JSON.parse(await readFile(path.join(dossier, 'publication.json'), 'utf-8')).version).toBe(2);
  });
});

describe('retrait du site', () => {
  const relayer = () => action('a', 'relais', { cible: 'complete' });
  const retirer = (q: Qualification = PERSO) => action('a', 'site/retirer', { cible: 'complete', ...q });
  const site = () => config.site!;

  it('enregistre la qualification, retire la vidéo du site et la ramène à prête', async () => {
    const dossier = await prete(PRO_CONF, SITE_CHOISI);
    await relayer();
    const r = await retirer();
    expect(r.status).toBe(200);
    expect(((await r.json()) as Publication).videos[0]).toMatchObject({
      ...PERSO, statut: 'prete', replit: { id: null, categorieId: null, playlistId: null }, erreur: null,
    });
    expect(site().supprimerVideo).toHaveBeenCalledWith(42);
    const enregistree = JSON.parse(await readFile(path.join(dossier, 'publication.json'), 'utf-8')) as Publication;
    expect(enregistree.videos[0]).toMatchObject({ ...PERSO, replit: { id: null } });
  });
  it('ramène à envoyée une vidéo qui a une URL YouTube', async () => {
    await prete(PRO, SITE_CHOISI);
    await envoi({ visibilite: 'non-repertoriee' });
    await relayer();
    expect(((await (await retirer(PERSO_CONF)).json()) as Publication).videos[0]).toMatchObject({ statut: 'envoyee-youtube', youtube: { id: ID } });
  });
  it('refuse quand il n’y a rien à retirer ou que la qualification est invalide', async () => {
    await prete(PRO_CONF, SITE_CHOISI);
    expect((await retirer()).status).toBe(409);
    await relayer();
    expect((await retirer(PRO)).status).toBe(409);
    expect((await action('a', 'site/retirer', { cible: 'complete', nature: 'autre', confidentielle: false })).status).toBe(400);
    expect(site().supprimerVideo).not.toHaveBeenCalled();
  });
  it('garde la requalification quand un enregistrement concurrent la remet en Pro pendant le retrait', async () => {
    const dossier = await prete(PRO_CONF, SITE_CHOISI);
    await relayer();
    vi.mocked(site().supprimerVideo).mockImplementationOnce(async () => {
      const en_cours = JSON.parse(await readFile(path.join(dossier, 'publication.json'), 'utf-8')) as Publication;
      expect(en_cours.videos[0]).toMatchObject(PERSO);
      const revert = { ...en_cours, videos: en_cours.videos.map(v => ({ ...v, ...PRO, titre: 'Titre modifié' })) };
      expect((await envoyer('a', revert)).status).toBe(200);
    });
    const r = await retirer();
    expect(r.status).toBe(200);
    const apres = JSON.parse(await readFile(path.join(dossier, 'publication.json'), 'utf-8')) as Publication;
    expect(apres.videos[0]).toMatchObject({ ...PERSO, titre: 'Titre modifié', statut: 'prete', replit: { id: null } });
    expect(((await r.json()) as Publication).videos[0]).toMatchObject({ ...PERSO, replit: { id: null } });
  });
  it('garde la qualification et note l’erreur si le site échoue, bloque YouTube, puis reprend', async () => {
    const dossier = await prete(PRO_CONF, SITE_CHOISI);
    await relayer();
    vi.mocked(site().supprimerVideo).mockRejectedValueOnce(new Error('Site injoignable (ECONNREFUSED) : la vidéo y est encore visible.'));
    const r = await retirer();
    expect(r.status).toBe(502);
    expect((await r.json()).erreur).toBe('Retrait du site impossible : Site injoignable (ECONNREFUSED) : la vidéo y est encore visible.');
    const apres = JSON.parse(await readFile(path.join(dossier, 'publication.json'), 'utf-8')) as Publication;
    expect(apres.videos[0]).toMatchObject({ ...PERSO, statut: 'relayee', replit: { id: 42 }, erreur: { etape: 'replit' } });
    expect((await (await action('a', 'youtube/preparer', { cible: 'complete' })).json()).problemes).toContain('Retirez d’abord la vidéo du site.');
    expect((await envoi()).status).toBe(422);
    expect(((await (await retirer()).json()) as Publication).videos[0]).toMatchObject({ statut: 'prete', replit: { id: null }, erreur: null });
  });
});
