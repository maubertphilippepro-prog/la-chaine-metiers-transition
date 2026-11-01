import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import exemple from '../../fixtures/analyse-exemple.json';
import { MISE_PAR_DEFAUT } from '../../noyau/mise-en-page';
import { videoParDefaut, type Publication } from '../../noyau/publication';
import type { Qualification } from '../../noyau/qualification';
import { ErreurInterpretation } from './consignes';
import { creerApiPublication, type ConfigPublication } from './publication';

const MONTAGE = {
  version: 1, titre: 'Essai', coupes: [],
  chapitres: [{ titre: 'Intro', debut: 0 }, { titre: 'Le SSO', debut: 3 }],
  termes: [{ terme: 'SSO', definition: 'Authentification unique.', occurrences: [3.8], statut: 'valide', position: 'bas' }],
  elements: [],
};
const RENDU = { version: 1, titre: 'Essai', statut: 'rendu', message: null };
const PROPOSITION = { titre: 'Le SSO expliqué', variantesTitre: ['A', 'B'], description: 'Desc', tags: ['sso'], accroches: ['Un seul mot de passe'], logiciels: ['Excel'] };
const PROPOSITION_VIGNETTE = {
  pose: 'surpris.jpg', logos: ['excel.png', 'inconnu.png'], captures: ['a.png', 'b.png'], gabarit: 'mosaique' as const, accroche: 'Planning facile', explication: 'Les captures en éventail.',
  mise: { cotePose: 'gauche' as const, tailleAccroche: 'grande' as const, recadrages: [{ x: 10, y: 10, largeur: 50, hauteur: 50 }], logoVedette: null },
};
const REPONSE_VIGNETTE = {
  compris: 'Le planning en avant.', pasRealisable: [' Un fond vert — le fond est celui de la charte ', ''], logosAjoutes: [], propositions: [PROPOSITION_VIGNETTE],
};
const SITE = {
  categories: [{ id: 1, nom: 'IA' }], playlists: [],
  classements: [
    { cle: 'outil', libelle: 'Par outil', multiple: false, obligatoire: true, valeurs: [{ id: 1, nom: 'Claude' }] },
    { cle: 'theme', libelle: 'Par thème', multiple: true, obligatoire: false, valeurs: [{ id: 5, nom: 'vibe-coding' }] },
  ],
};

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
    proposerVignettes: vi.fn(async () => REPONSE_VIGNETTE),
    reduireImage: vi.fn(async (chemin: string) => ({ nom: path.basename(chemin), media_type: 'image/jpeg' as const, data: 'AAAA' })),
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
      creerValeur: vi.fn(async (_c: string, nom: string) => ({ id: 99, nom })),
    },
    mail: {
      sharepoint: { dossierLocal: path.join(racine, 'sharepoint'), site: 'https://sp.example/sites/vitrin3', bibliotheque: 'Bib' },
      copier: vi.fn(async () => true),
      incorporerPochette: vi.fn(async () => ''),
      rediger: vi.fn(async () => '---\nobjet: Essai\n---\n## Titre\n\n[À COMPLÉTER]\n'),
      construire: vi.fn(async (dossier: string) => {
        await mkdir(path.join(dossier, 'build'), { recursive: true });
        await writeFile(path.join(dossier, 'build', 'apercu-bureau.png'), 'png');
        return 'ok';
      }),
      retoucher: vi.fn(async () => ({ remplacements: [], resume: '' })),
      vignetteLecture: vi.fn(async (_source: string, cible: string) => writeFile(cible, 'jpg-lecture')),
      capturer: vi.fn(async () => 'ok'),
      brouillon: vi.fn(async () => 'Brouillon Outlook cree'),
      lireReference: vi.fn(async (r: string) => `contenu de ${r}`),
      logosBandeau: vi.fn(async () => ['there']),
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
    expect(d.urlTournage).toBe('http://127.0.0.1:9999/a');
    expect(d.site).toEqual(SITE);
    expect(d.urlSite).toBe('https://site.example');
    expect(d).not.toHaveProperty('camera');
    expect(d).not.toHaveProperty('sourceUrl');
    expect(d.reglages.titreMax).toBe(100);
  });
  it('liste la banque de logos et les captures du tournage', async () => {
    const dossier = await tournage('a');
    await writeFile(path.join(racine, 'logos', 'excel.png'), 'png');
    await writeFile(path.join(racine, 'logos', 'notes.txt'), '');
    await mkdir(path.join(dossier, 'captures'));
    await writeFile(path.join(dossier, 'captures', 'b.jpg'), 'jpg');
    await writeFile(path.join(dossier, 'captures', 'a.png'), 'png');
    await writeFile(path.join(dossier, 'captures', 'c.svg'), '<svg/>');
    const d = await (await fetch(`${url}/api/tournages/a/publication`)).json();
    expect(d.urlLogos).toBe('http://127.0.0.1:9997');
    expect(d.logos).toEqual([{ fichier: 'excel.png', url: 'http://127.0.0.1:9997/excel.png' }]);
    expect(d.captures).toEqual(['a.png', 'b.jpg', 'c.svg']);
    expect(await (await fetch(`${url}/api/tournages/a/publication/captures`)).json()).toEqual(['a.png', 'b.jpg', 'c.svg']);
  });
});

describe('dépôt de captures', () => {
  const deposer = (fichier: string, contenu = 'png') =>
    fetch(`${url}/api/tournages/a/publication/captures?fichier=${encodeURIComponent(fichier)}`, { method: 'POST', body: contenu });
  it('copie l’image dans captures/ sans écraser un fichier du même nom', async () => {
    const dossier = await tournage('a');
    expect(await (await deposer('étape 1.png')).json()).toEqual({ fichier: 'étape 1.png', captures: ['étape 1.png'] });
    expect(await (await deposer('étape 1.png', 'autre')).json()).toEqual({ fichier: 'étape 1-2.png', captures: ['étape 1-2.png', 'étape 1.png'] });
    expect(await readFile(path.join(dossier, 'captures', 'étape 1.png'), 'utf-8')).toBe('png');
    expect((await (await deposer('schéma.svg', '<svg/>')).json()).fichier).toBe('schéma.svg');
  });
  it('refuse un autre format, un chemin ou une image vide', async () => {
    await tournage('a');
    expect((await deposer('notes.txt')).status).toBe(400);
    expect((await deposer('../x.png')).status).toBe(400);
    expect((await deposer('x.png', '')).status).toBe(400);
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
  it('ignore le fond d’une vignette envoyée par un ancien studio', async () => {
    const dossier = await tournage('a');
    const p = await lirePublication('a');
    const vignette = { pose: { source: 'banque', fichier: 'surpris.jpg' }, fond: { source: 'ecran', instant: 2 }, accroche: 'A', fichier: null };
    expect((await envoyer('a', { ...p, videos: p.videos.map(v => (v.cible === 'complete' ? { ...v, vignette } : v)) })).status).toBe(200);
    const enregistree = JSON.parse(await readFile(path.join(dossier, 'publication.json'), 'utf-8')) as Publication;
    expect(enregistree.videos[0]!.vignette).not.toHaveProperty('fond');
  });
  it('refuse de lire une publication dont la vignette a une pose caméra', async () => {
    const dossier = await tournage('a');
    const p = await lirePublication('a');
    const vignette = { pose: { source: 'camera', instant: 2 }, accroche: 'A', gabarit: 'classique', logos: [], captures: [], fichier: null };
    await writeFile(path.join(dossier, 'publication.json'), JSON.stringify({ ...p, videos: p.videos.map(v => (v.cible === 'complete' ? { ...v, vignette } : v)) }));
    const r = await fetch(`${url}/api/tournages/a/publication`);
    expect(r.status).toBe(409);
    expect((await r.json()).erreur).toContain('pose caméra plus prise en charge, choisissez une pose de la banque');
  });
  it('ne connaît plus la route des images', async () => {
    await tournage('a');
    // Hors de l'expression des routes : l'API de publication laisse passer, le serveur de test répond 418.
    expect((await action('a', 'image', { source: 'ecran', instant: 1 })).status).toBe(418);
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
    const vignette = { pose: { source: 'banque', fichier: 'surpris.jpg' }, accroche: 'Ancienne', fichier: 'rendus/vignettes/complete.jpg' };
    await envoyer('a', { ...p, videos: p.videos.map(v => (v.cible === 'complete' ? { ...v, vignette } : v)) });
    const r = await action('a', 'redaction', { cible: 'complete' });
    expect(((await r.json()) as Publication).videos[0]!.vignette).toMatchObject({ accroche: 'Un seul mot de passe', fichier: null });
  });
  it('pré-coche les logos des logiciels cités quand la vignette n’en a aucun', async () => {
    await tournage('a');
    await writeFile(path.join(racine, 'logos', 'excel.png'), 'png');
    const p = await lirePublication('a');
    const vignette = { pose: { source: 'banque', fichier: 'surpris.jpg' }, accroche: 'Ancienne', fichier: null };
    await envoyer('a', { ...p, videos: p.videos.map(v => (v.cible === 'complete' ? { ...v, vignette } : v)) });
    const r = await action('a', 'redaction', { cible: 'complete' });
    const video = ((await r.json()) as Publication).videos[0]!;
    expect(video.logiciels).toEqual(['Excel']);
    expect(video.vignette).toMatchObject({ logos: ['excel.png'], gabarit: 'classique' });
  });
  it('refuse une cible inconnue', async () => {
    await tournage('a');
    expect((await action('a', 'redaction', { cible: 9 })).status).toBe(400);
  });
});

describe('vignette et validation', () => {
  async function preparer() {
    const dossier = await tournage('a');
    await writeFile(path.join(racine, 'poses', 'surpris.jpg'), 'jpg');
    await writeFile(path.join(racine, 'poses', 'surpris.detoure.png'), 'png');
    const p = await lirePublication('a');
    const vignette = { pose: { source: 'banque', fichier: 'surpris.jpg' }, accroche: 'Un seul mot de passe', fichier: null };
    await envoyer('a', { ...p, videos: p.videos.map(v => (v.cible === 'complete' ? { ...v, titre: 'Titre', description: 'Desc', vignette } : v)) });
    return dossier;
  }
  it('rend la vignette avec les adresses de ses images', async () => {
    const dossier = await preparer();
    const r = await action('a', 'vignette', { cible: 'complete' });
    expect(r.status).toBe(200);
    expect(config.rendreVignette).toHaveBeenCalledWith(
      {
        gabarit: 'classique', poseUrl: 'http://127.0.0.1:9998/surpris.detoure.png', logoUrls: [], captureUrls: [], accroche: 'Un seul mot de passe',
        mise: MISE_PAR_DEFAUT, vedette: null,
      },
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
  it('passe logos et captures à la composition', async () => {
    const dossier = await preparer();
    await writeFile(path.join(racine, 'logos', 'excel.png'), 'png');
    await mkdir(path.join(dossier, 'captures'));
    await writeFile(path.join(dossier, 'captures', 'a.png'), 'png');
    const p = await lirePublication('a');
    await envoyer('a', { ...p, videos: p.videos.map(v => (v.cible === 'complete'
      ? { ...v, vignette: { ...v.vignette!, gabarit: 'demonstration', logos: ['excel.png'], captures: ['a.png'] } }
      : v)) });
    expect((await action('a', 'vignette', { cible: 'complete' })).status).toBe(200);
    expect(vi.mocked(config.rendreVignette).mock.calls[0]![0]).toMatchObject({
      gabarit: 'demonstration', logoUrls: ['http://127.0.0.1:9997/excel.png'], captureUrls: ['http://127.0.0.1:9999/a/captures/a.png'],
    });
  });
  it('refuse le rendu et la validation quand un logo ou une capture a disparu', async () => {
    await preparer();
    const p = await lirePublication('a');
    await envoyer('a', { ...p, videos: p.videos.map(v => (v.cible === 'complete'
      ? { ...v, vignette: { ...v.vignette!, logos: ['excel.png'], captures: ['a.png'] } }
      : v)) });
    const rendu = await action('a', 'vignette', { cible: 'complete' });
    expect(rendu.status).toBe(409);
    expect((await rendu.json()).erreur).toBe('Image de la vignette absente : logo excel.png, capture a.png.');
    const refus = await action('a', 'valider', { cible: 'complete' });
    expect((await refus.json()).problemes).toEqual([
      'Vignette à rendre.', 'Vignette : logo excel.png introuvable.', 'Vignette : capture a.png introuvable.',
    ]);
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
const SITE_CHOISI = { replit: { id: null, classements: { outil: [1], theme: 'aucun' }, playlistId: null } };
// Vidéo complète validée, vignette rendue ; `changement` complète ses champs (catégorie du site…).
async function prete(q: Qualification = PERSO, changement: Record<string, unknown> = {}) {
  const dossier = await tournage('a');
  await writeFile(path.join(racine, 'poses', 'surpris.jpg'), 'jpg');
  await writeFile(path.join(racine, 'poses', 'surpris.detoure.png'), 'png');
  const p = await lirePublication('a');
  const vignette = { pose: { source: 'banque', fichier: 'surpris.jpg' }, accroche: 'Un seul mot de passe', fichier: null };
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
    expect(((await r.json()) as Publication).videos[0]).toMatchObject({ statut: 'relayee', replit: { id: 42, classements: { outil: [1] } }, erreur: null });
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
    expect(site().enregistrerVideo).not.toHaveBeenCalled();
  });
  it('refuse le relais tant qu’un classement n’est pas décidé', async () => {
    await prete(PRO_CONF, { replit: { id: null, classements: { outil: [1] }, playlistId: null } });
    expect((await (await relayer()).json()).problemes).toEqual(['Par thème : choisissez une valeur ou cochez Aucune sélection.']);
    expect(site().enregistrerVideo).not.toHaveBeenCalled();
  });
  it('relaie avec les classements du site', async () => {
    await prete(PRO_CONF, SITE_CHOISI);
    await relayer();
    expect(site().enregistrerVideo).toHaveBeenCalledWith(null, expect.objectContaining({ categoryId: 1, classifications: { outil: [1], theme: [] } }));
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

describe('valeurs de classement', () => {
  const creer = (cle: string, corps: unknown) =>
    fetch(`${url}/api/site/classements/${cle}/valeurs`, { method: 'POST', headers: json, body: JSON.stringify(corps) });
  it('crée la valeur sur le site', async () => {
    const r = await creer('theme', { nom: ' IA ' });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ id: 99, nom: 'IA' });
    expect(config.site!.creerValeur).toHaveBeenCalledWith('theme', 'IA');
  });
  it('répond 400 à une clé mal encodée', async () => {
    expect((await creer('%E0%A4%A', { nom: 'IA' })).status).toBe(400);
    expect(config.site!.creerValeur).not.toHaveBeenCalled();
  });
  it('refuse un nom vide, et sans site configuré', async () => {
    expect((await creer('theme', { nom: '  ' })).status).toBe(400);
    config.site = null;
    expect((await creer('theme', { nom: 'IA' })).status).toBe(422);
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
      ...PERSO, statut: 'prete', replit: { id: null, classements: { outil: [1] }, playlistId: null }, erreur: null,
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

describe('génération de vignette', () => {
  async function preparer() {
    const dossier = await tournage('a');
    await writeFile(path.join(racine, 'poses', 'surpris.jpg'), 'jpg');
    await writeFile(path.join(racine, 'poses', 'surpris.detoure.png'), 'png');
    await writeFile(path.join(racine, 'logos', 'excel.png'), 'png');
    await mkdir(path.join(dossier, 'captures'));
    await writeFile(path.join(dossier, 'captures', 'a.png'), 'png');
    await writeFile(path.join(dossier, 'captures', 'b.png'), 'png');
    return dossier;
  }
  const generer = (corps: unknown) => action('a', 'vignette/generer', corps);
  const CORPS = { cible: 'complete', pose: 'surpris.jpg', accroche: 'Planning sans effort', logosTexte: 'excel, word', captures: ['b.png'], consignes: ' Zoome ', base: null };

  it('génère 3 variantes à partir des éléments du formulaire', async () => {
    const dossier = await preparer();
    const r = await generer(CORPS);
    expect(r.status).toBe(200);
    expect(config.proposerVignettes).toHaveBeenCalledWith(expect.objectContaining({
      elements: { pose: 'surpris.jpg', accroche: 'Planning sans effort', logosTexte: 'excel, word', logos: ['excel.png'], captures: ['b.png'] },
      consignes: 'Zoome', base: null, ambigus: [],
    }));
    expect(config.reduireImage).toHaveBeenCalledWith(expect.stringMatching(/surpris\.detoure\.png$/));
    const tour = ((await r.json()) as Publication).videos[0]!.consignesVignette.at(-1)!;
    expect(tour).toMatchObject({ texte: 'Zoome', introuvables: ['word'], base: null, choisie: null });
    expect(tour.elements!.logos).toEqual(['excel.png']);
    // Éléments de l'auteur rétablis, mise bornée sur l'unique capture.
    expect(tour.propositions[0]).toMatchObject({ pose: 'surpris.jpg', logos: ['excel.png'], captures: ['b.png'], gabarit: 'vitrine' });
    expect(tour.propositions[0]!.mise!.recadrages).toHaveLength(1);
    expect(tour.pasRealisable).toContain('Un fond vert — le fond est celui de la charte');
    const enregistree = JSON.parse(await readFile(path.join(dossier, 'publication.json'), 'utf-8')) as Publication;
    expect(enregistree.videos[0]!.consignesVignette).toHaveLength(1);
  });
  it('passe la variante de départ', async () => {
    await preparer();
    await generer(CORPS);
    await generer({ ...CORPS, base: { consigne: 0, proposition: 0 } });
    expect(config.proposerVignettes).toHaveBeenLastCalledWith(expect.objectContaining({ base: expect.objectContaining({ gabarit: expect.any(String) }) }));
  });
  it('refuse une pose ou une capture inconnue et une accroche vide', async () => {
    await preparer();
    expect((await generer({ ...CORPS, pose: 'x.jpg' })).status).toBe(400);
    expect((await generer({ ...CORPS, captures: ['absente.png'] })).status).toBe(400);
    expect((await generer({ ...CORPS, accroche: ' ' })).status).toBe(400);
    expect(config.proposerVignettes).not.toHaveBeenCalled();
  });
  it('garde les tours du disque quand le studio enregistre une publication qui n’en a pas', async () => {
    const dossier = await preparer();
    await generer(CORPS);
    const p = await lirePublication('a');
    const perimee = { ...p, videos: p.videos.map(v => ({ ...v, consignesVignette: [] })) };
    expect((await envoyer('a', perimee)).status).toBe(200);
    const enregistree = JSON.parse(await readFile(path.join(dossier, 'publication.json'), 'utf-8')) as Publication;
    expect(enregistree.videos[0]!.consignesVignette.map(c => c.texte)).toEqual(['Zoome']);
  });
  it('refuse une seconde génération pendant qu’une première est en cours, puis réaccepte', async () => {
    await preparer();
    let echouer!: (e: Error) => void;
    vi.mocked(config.proposerVignettes).mockImplementationOnce(() => new Promise((_, rejeter) => { echouer = rejeter; }));
    const a = generer(CORPS);
    await vi.waitFor(() => expect(config.proposerVignettes).toHaveBeenCalledTimes(1));
    const b = await generer(CORPS);
    expect(b.status).toBe(409);
    expect((await b.json()).erreur).toBe('Une génération est déjà en cours pour cette vignette.');
    echouer(new Error('boum'));
    expect((await a).status).toBe(500);
    expect((await generer(CORPS)).status).toBe(200);
  });
  it('n’enregistre rien quand Claude échoue ou ne propose rien', async () => {
    const dossier = await preparer();
    vi.mocked(config.proposerVignettes).mockRejectedValueOnce(new ErreurInterpretation(503, 'Connexion à l’API Claude impossible : hors ligne'));
    const r = await generer(CORPS);
    expect(r.status).toBe(503);
    expect((await r.json()).erreur).toContain('Connexion à l’API Claude impossible');
    vi.mocked(config.proposerVignettes).mockResolvedValueOnce({ ...REPONSE_VIGNETTE, propositions: [] });
    expect((await generer(CORPS)).status).toBe(422);
    expect(existsSync(path.join(dossier, 'publication.json'))).toBe(false);
  });
});
