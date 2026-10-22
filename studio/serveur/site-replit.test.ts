import { mkdtemp, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CorpsVideoSite } from '../../noyau/relais';
import { creerClientSite, lireReferencesSite } from './site-replit';

const reponse = (corps: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => corps }) as Response;

describe('lireReferencesSite', () => {
  it('lit les catégories et les playlists du site', async () => {
    const recuperer = vi.fn(async (url: string) => reponse(url.endsWith('/api/categories')
      ? [{ id: 1, name: 'IA & outils numériques' }, { id: 'x' }]
      : [{ id: 7, name: 'Bureautique', categoryId: 1 }]));
    expect(await lireReferencesSite('https://site.example/', recuperer as unknown as typeof fetch)).toEqual({
      categories: [{ id: 1, nom: 'IA & outils numériques' }],
      playlists: [{ id: 7, nom: 'Bureautique', categorieId: 1 }],
    });
    expect(recuperer).toHaveBeenCalledWith('https://site.example/api/categories', expect.anything());
  });
  it('renvoie null sans adresse, ou si le site ne répond pas correctement', async () => {
    expect(await lireReferencesSite(undefined)).toBeNull();
    const enPanne = vi.fn(async () => reponse({}, false));
    expect(await lireReferencesSite('https://site.example', enPanne as unknown as typeof fetch)).toBeNull();
    const injoignable = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    expect(await lireReferencesSite('https://site.example', injoignable as unknown as typeof fetch)).toBeNull();
  });
});

// Site simulé par un vrai serveur local : l’envoi du fichier passe par un flux, qu’un faux fetch ne vérifierait pas.
interface Requete { methode: string; chemin: string; entetes: http.IncomingHttpHeaders; corps: Buffer }
const CORPS: CorpsVideoSite = {
  title: 'Titre', description: 'Desc', tags: [], categoryId: 1, playlistId: null, durationSeconds: 60,
  format: 'long', status: 'published', visibility: 'interne', videoObject: 'abc', thumbnailObject: 'def',
};

describe('creerClientSite', () => {
  let serveur: http.Server;
  let base: string;
  let requetes: Requete[];
  let reponse: (r: Requete) => [number, unknown];
  const parDefaut = (r: Requete): [number, unknown] => {
    if (r.chemin === '/api/uploads') return [200, { uploadUrl: `${base}/stockage/abc?signature=x`, objectId: 'abc' }];
    if (r.chemin.startsWith('/stockage/')) return [200, {}];
    if (r.methode === 'POST' && r.chemin === '/api/videos') return [201, { id: 42 }];
    if (r.methode === 'PATCH' && r.chemin === '/api/videos/42') return [200, { id: 42 }];
    return [404, { error: 'Not found' }];
  };
  const site = () => creerClientSite(`${base}/`, 'cle-secrete')!;

  beforeEach(async () => {
    requetes = [];
    reponse = parDefaut;
    serveur = http.createServer(async (req, res) => {
      const morceaux: Buffer[] = [];
      for await (const m of req) morceaux.push(m as Buffer);
      const r = { methode: req.method ?? '', chemin: req.url ?? '', entetes: req.headers, corps: Buffer.concat(morceaux) };
      requetes.push(r);
      const [statut, corps] = reponse(r);
      res.writeHead(statut, { 'Content-Type': 'application/json' }).end(JSON.stringify(corps));
    });
    await new Promise<void>(r => serveur.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    await new Promise<void>(r => serveur.close(() => r()));
  });

  it('n’existe pas sans adresse ou sans clé', () => {
    expect(creerClientSite(undefined, 'cle')).toBeNull();
    expect(creerClientSite('https://site.example', '')).toBeNull();
  });
  it('demande une URL d’envoi avec la clé, puis y envoie le fichier sans la clé', async () => {
    const fichier = path.join(await mkdtemp(path.join(os.tmpdir(), 'pmt-site-')), 'video.mp4');
    await writeFile(fichier, 'contenu');
    expect(await site().envoyerFichier(fichier, 'video/mp4')).toBe('abc');
    const [demande, envoi] = requetes;
    expect(demande).toMatchObject({ methode: 'POST', chemin: '/api/uploads' });
    expect(demande!.entetes['x-api-key']).toBe('cle-secrete');
    expect(JSON.parse(demande!.corps.toString())).toEqual({ contentType: 'video/mp4' });
    expect(envoi).toMatchObject({ methode: 'PUT', chemin: '/stockage/abc?signature=x' });
    expect(envoi!.entetes['content-type']).toBe('video/mp4');
    expect(envoi!.entetes['content-length']).toBe('7');
    expect(envoi!.entetes['x-api-key']).toBeUndefined();
    expect(envoi!.corps.toString()).toBe('contenu');
  });
  it('crée la vidéo, la met à jour, et la recrée si elle a disparu du site', async () => {
    expect(await site().enregistrerVideo(null, CORPS)).toBe(42);
    expect(requetes[0]).toMatchObject({ methode: 'POST', chemin: '/api/videos' });
    expect(JSON.parse(requetes[0]!.corps.toString())).toEqual(CORPS);
    expect(await site().enregistrerVideo(42, CORPS)).toBe(42);
    expect(requetes[1]).toMatchObject({ methode: 'PATCH', chemin: '/api/videos/42' });
    expect(await site().enregistrerVideo(7, CORPS)).toBe(42);
    expect(requetes.slice(2).map(r => `${r.methode} ${r.chemin}`)).toEqual(['PATCH /api/videos/7', 'POST /api/videos']);
  });
  it('explique une clé refusée, un refus du site ou du stockage, et un site injoignable', async () => {
    reponse = () => [401, { error: 'Authentication required' }];
    await expect(site().enregistrerVideo(null, CORPS)).rejects.toThrow('Clé refusée par le site');
    reponse = r => (r.chemin === '/api/videos' ? [400, { error: 'Invalid body' }] : parDefaut(r));
    await expect(site().enregistrerVideo(null, CORPS)).rejects.toThrow('Vidéo refusée par le site (400 : Invalid body) ; le relais reste à faire, rien n’est perdu.');
    reponse = r => (r.chemin.startsWith('/stockage/') ? [403, {}] : parDefaut(r));
    const fichier = path.join(await mkdtemp(path.join(os.tmpdir(), 'pmt-site-')), 'v.jpg');
    await writeFile(fichier, 'jpg');
    await expect(site().envoyerFichier(fichier, 'image/jpeg')).rejects.toThrow('Fichier refusé par le stockage du site (403)');
    const injoignable = vi.fn(async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    await expect(creerClientSite(base, 'cle', injoignable)!.enregistrerVideo(null, CORPS)).rejects.toThrow('Site injoignable (ECONNREFUSED)');
    // fetch ne dit que « fetch failed » : la vraie raison est dans la cause.
    const coupe = vi.fn(async () => { throw new TypeError('fetch failed', { cause: new Error('read ECONNRESET') }); }) as unknown as typeof fetch;
    await expect(creerClientSite(base, 'cle', coupe)!.enregistrerVideo(null, CORPS)).rejects.toThrow('Site injoignable (fetch failed : read ECONNRESET)');
  });
});
