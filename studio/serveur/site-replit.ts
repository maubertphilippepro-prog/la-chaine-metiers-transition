export interface ReferencesSite {
  categories: { id: number; nom: string }[];
  playlists: { id: number; nom: string; categorieId: number }[];
}

const DELAI = 5000;
const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// Catégories et playlists du site, lues sur ses routes publiques (sans clé) ;
// null si l’adresse manque ou si le site ne répond pas correctement.
export async function lireReferencesSite(urlSite: string | undefined, recuperer: typeof fetch = fetch): Promise<ReferencesSite | null> {
  if (!urlSite) return null;
  const base = urlSite.replace(/\/+$/, '');
  try {
    const [categories, playlists] = await Promise.all(['categories', 'playlists'].map(async route => {
      const reponse = await recuperer(`${base}/api/${route}`, { signal: AbortSignal.timeout(DELAI) });
      if (!reponse.ok) throw new Error(`${route} : ${reponse.status}`);
      return (await reponse.json()) as unknown;
    }));
    if (!Array.isArray(categories) || !Array.isArray(playlists)) return null;
    return {
      categories: categories.filter(estObjet)
        .filter(c => typeof c.id === 'number' && typeof c.name === 'string')
        .map(c => ({ id: c.id as number, nom: c.name as string })),
      playlists: playlists.filter(estObjet)
        .filter(p => typeof p.id === 'number' && typeof p.name === 'string' && typeof p.categoryId === 'number')
        .map(p => ({ id: p.id as number, nom: p.name as string, categorieId: p.categoryId as number })),
    };
  } catch {
    return null;
  }
}
