import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ecrireDossierYoutube, lireVisibiliteYoutube } from './youtube';
import { ficheYoutube } from '../../noyau/youtube';

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
  it('met la vidéo, la vignette et la fiche dans le dossier, en remplaçant une préparation précédente', async () => {
    const racine = await mkdtemp(path.join(os.tmpdir(), 'pmt-youtube-'));
    const vignette = path.join(racine, 'complete.jpg');
    const video = path.join(racine, 'video-complete.mp4');
    await writeFile(vignette, 'jpg');
    await writeFile(video, 'mp4');
    const dossier = path.join(racine, 'publication', 'complete');
    const textes = { titre: 'Titre', description: 'Desc', tags: 'a, b', reglages: 'Réglages' };
    await ecrireDossierYoutube(dossier, { ...textes, titre: 'Ancien' }, vignette, video);
    await writeFile(path.join(dossier, 'titre.txt'), 'ancien format');
    await ecrireDossierYoutube(dossier, textes, vignette, video);
    const lire = (f: string) => readFile(path.join(dossier, f), 'utf-8');
    expect((await readdir(dossier)).sort()).toEqual(['video-complete.mp4', 'vignette.jpg', 'youtube.txt']);
    expect(await lire('video-complete.mp4')).toBe('mp4');
    expect(await lire('vignette.jpg')).toBe('jpg');
    expect(await lire('youtube.txt')).toBe(ficheYoutube(textes));
  });
});
