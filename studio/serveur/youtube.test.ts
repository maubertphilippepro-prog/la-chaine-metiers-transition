import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ecrireDossierYoutube, lireVisibiliteYoutube } from './youtube';

const ID = 'dQw4w9WgXcQ';
const reponse = (status: number) => ({ ok: status >= 200 && status < 300, status, json: async () => ({}) }) as Response;
const avec = (status: number) => vi.fn(async () => reponse(status)) as unknown as typeof fetch;

describe('lireVisibiliteYoutube', () => {
  it('interroge l’adresse oEmbed de la vidéo', async () => {
    const recuperer = avec(200);
    expect(await lireVisibiliteYoutube(ID, recuperer)).toBe('publique');
    const attendue = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${ID}`)}&format=json`;
    expect(recuperer).toHaveBeenCalledWith(attendue, expect.anything());
  });
  it('lit 401, 403 et 404 comme non lisible, le reste comme inconnu', async () => {
    for (const status of [401, 403, 404]) expect(await lireVisibiliteYoutube(ID, avec(status))).toBe('non-publique');
    expect(await lireVisibiliteYoutube(ID, avec(500))).toBe('inconnue');
    const injoignable = vi.fn(async () => { throw new Error('ENOTFOUND'); }) as unknown as typeof fetch;
    expect(await lireVisibiliteYoutube(ID, injoignable)).toBe('inconnue');
  });
});

describe('ecrireDossierYoutube', () => {
  it('écrit la vignette et les textes, en remplaçant une préparation précédente', async () => {
    const racine = await mkdtemp(path.join(os.tmpdir(), 'pmt-youtube-'));
    const vignette = path.join(racine, 'complete.jpg');
    await writeFile(vignette, 'jpg');
    const dossier = path.join(racine, 'publication', 'complete');
    const textes = { titre: 'Titre', description: 'Desc', tags: 'a, b', reglages: 'Réglages' };
    await ecrireDossierYoutube(dossier, { ...textes, titre: 'Ancien' }, vignette);
    await ecrireDossierYoutube(dossier, textes, vignette);
    const lire = (f: string) => readFile(path.join(dossier, f), 'utf-8');
    expect(await lire('vignette.jpg')).toBe('jpg');
    expect(await lire('titre.txt')).toBe('Titre');
    expect(await lire('description.txt')).toBe('Desc');
    expect(await lire('tags.txt')).toBe('a, b');
    expect(await lire('reglages-youtube.txt')).toBe('Réglages');
  });
});
