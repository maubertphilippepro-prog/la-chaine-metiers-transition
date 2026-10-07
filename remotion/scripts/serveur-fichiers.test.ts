import http from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cheminDemande, demarrerServeur, lirePlage, type ServeurFichiers } from './serveur-fichiers';

describe('cheminDemande', () => {
  it('refuse de sortir de la racine', () => {
    const racine = path.resolve('/racine');
    expect(cheminDemande(racine, '/..%2fsecret')).toBeNull();
    expect(cheminDemande(racine, '/a%20b/video.mp4')).toBe(path.join(racine, 'a b', 'video.mp4'));
  });
});

describe('lirePlage', () => {
  it('lit les plages HTTP', () => {
    expect(lirePlage(undefined, 1000)).toBeNull();
    expect(lirePlage('bytes=100-199', 1000)).toEqual({ debut: 100, fin: 199 });
    expect(lirePlage('bytes=900-', 1000)).toEqual({ debut: 900, fin: 999 });
    expect(lirePlage('bytes=-100', 1000)).toEqual({ debut: 900, fin: 999 });
    expect(lirePlage('bytes=2000-', 1000)).toBe('invalide');
    expect(lirePlage('octets=1-2', 1000)).toBe('invalide');
  });
});

describe('demarrerServeur', () => {
  let serveur: ServeurFichiers;
  let racine: string;
  const contenu = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));

  beforeAll(async () => {
    racine = await mkdtemp(path.join(os.tmpdir(), 'pmt-serveur-'));
    await mkdir(path.join(racine, 'a b'));
    await writeFile(path.join(racine, 'a b', 'video.mp4'), contenu);
    await writeFile(path.join(racine, 'gros.bin'), Buffer.alloc(5 * 1024 * 1024));
    serveur = await demarrerServeur(racine);
  });
  afterAll(async () => {
    await serveur.fermer();
    await rm(racine, { recursive: true, force: true });
  });

  const requeteBrute = (options: http.RequestOptions) =>
    new Promise<number | undefined>((resolve, reject) => {
      const { port } = new URL(serveur.url);
      const req = http.request({ host: '127.0.0.1', port, ...options }, res => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end();
    });

  it('sert un fichier entier avec CORS', async () => {
    const r = await fetch(`${serveur.url}/a%20b/video.mp4`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('video/mp4');
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    expect(Buffer.from(await r.arrayBuffer())).toEqual(contenu);
  });
  it('sert une plage', async () => {
    const r = await fetch(`${serveur.url}/a%20b/video.mp4`, { headers: { Range: 'bytes=100-199' } });
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe('bytes 100-199/1000');
    expect(Buffer.from(await r.arrayBuffer())).toEqual(contenu.subarray(100, 200));
  });
  it('refuse une plage impossible', async () => {
    const r = await fetch(`${serveur.url}/a%20b/video.mp4`, { headers: { Range: 'bytes=5000-' } });
    expect(r.status).toBe(416);
  });
  it('répond 404 pour un fichier absent et HEAD sans corps', async () => {
    expect((await fetch(`${serveur.url}/absent.mp4`)).status).toBe(404);
    const h = await fetch(`${serveur.url}/a%20b/video.mp4`, { method: 'HEAD' });
    expect(h.status).toBe(200);
    expect(h.headers.get('content-length')).toBe('1000');
    expect((await h.arrayBuffer()).byteLength).toBe(0);
  });
  it('survit à un client qui coupe la connexion en cours de lecture', async () => {
    const abandon = new AbortController();
    const r = await fetch(`${serveur.url}/gros.bin`, { signal: abandon.signal });
    expect(r.status).toBe(200);
    abandon.abort();
    await new Promise(fini => setTimeout(fini, 100));
    expect((await fetch(`${serveur.url}/a%20b/video.mp4`)).status).toBe(200);
  });
  it('répond 404 pour un fichier supprimé et reste disponible', async () => {
    const ephemere = path.join(racine, 'ephemere.mp4');
    await writeFile(ephemere, contenu);
    expect((await fetch(`${serveur.url}/ephemere.mp4`)).status).toBe(200);
    await rm(ephemere);
    expect((await fetch(`${serveur.url}/ephemere.mp4`)).status).toBe(404);
    expect((await fetch(`${serveur.url}/a%20b/video.mp4`)).status).toBe(200);
  });
  it('refuse un en-tête Host étranger (DNS rebinding)', async () => {
    expect(await requeteBrute({ path: '/a%20b/video.mp4', headers: { Host: 'evil.example' } })).toBe(403);
    expect((await fetch(`${serveur.url}/a%20b/video.mp4`)).status).toBe(200);
  });
  it('gère traversée de chemin, OPTIONS et méthodes interdites', async () => {
    expect(await requeteBrute({ path: '/..%2f..%2fsecret' })).toBe(404);
    const o = await fetch(`${serveur.url}/a%20b/video.mp4`, { method: 'OPTIONS' });
    expect(o.status).toBe(204);
    expect(o.headers.get('access-control-allow-origin')).toBe('*');
    expect((await fetch(`${serveur.url}/a%20b/video.mp4`, { method: 'POST' })).status).toBe(405);
  });
});
