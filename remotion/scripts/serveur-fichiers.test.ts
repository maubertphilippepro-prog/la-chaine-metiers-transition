import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
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
  const contenu = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));

  beforeAll(async () => {
    const racine = await mkdtemp(path.join(os.tmpdir(), 'pmt-serveur-'));
    await mkdir(path.join(racine, 'a b'));
    await writeFile(path.join(racine, 'a b', 'video.mp4'), contenu);
    serveur = await demarrerServeur(racine);
  });
  afterAll(() => serveur.fermer());

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
});
