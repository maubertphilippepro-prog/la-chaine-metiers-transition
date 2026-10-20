import { describe, expect, it, vi } from 'vitest';
import { lireReferencesSite } from './site-replit';

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
