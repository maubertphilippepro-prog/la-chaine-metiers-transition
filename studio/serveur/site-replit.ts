import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { CorpsVideoSite } from '../../noyau/relais';
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

// Écritures sur le site avec la clé d’API machine (en-tête X-Api-Key) : stockage des fichiers, création ou mise à jour des vidéos.
export interface ClientSite {
  envoyerFichier: (chemin: string, typeContenu: string) => Promise<string>;
  enregistrerVideo: (id: number | null, corps: CorpsVideoSite) => Promise<number>;
}

const RIEN_PERDU = 'le relais reste à faire, rien n’est perdu';
const texteErreur = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function creerClientSite(urlSite: string | undefined, cle: string | undefined, recuperer: typeof fetch = fetch): ClientSite | null {
  if (!urlSite || !cle) return null;
  const base = urlSite.replace(/\/+$/, '');
  const entetes = { 'Content-Type': 'application/json', 'X-Api-Key': cle };

  async function appeler(chemin: string, methode: string, corps: unknown): Promise<{ statut: number; json: Record<string, unknown> }> {
    let reponse: Response;
    try {
      reponse = await recuperer(`${base}${chemin}`, {
        method: methode, headers: entetes, body: JSON.stringify(corps), signal: AbortSignal.timeout(DELAI),
      });
    } catch (e) {
      throw new Error(`Site injoignable (${texteErreur(e)}) : ${RIEN_PERDU}.`);
    }
    if (reponse.status === 401 || reponse.status === 403) {
      throw new Error(`Clé refusée par le site : vérifiez REPLIT_API_KEY dans .env et AUTOMATION_API_KEY sur le site ; ${RIEN_PERDU}.`);
    }
    const json: unknown = await reponse.json().catch(() => ({}));
    return { statut: reponse.status, json: estObjet(json) ? json : {} };
  }
  const refus = (quoi: string, statut: number, json: Record<string, unknown>) =>
    new Error(`${quoi} refusée par le site (${statut}${typeof json.error === 'string' ? ` : ${json.error}` : ''}) ; ${RIEN_PERDU}.`);

  return {
    async envoyerFichier(chemin, typeContenu) {
      const { statut, json } = await appeler('/api/uploads', 'POST', { contentType: typeContenu });
      if (statut !== 200 || typeof json.uploadUrl !== 'string' || typeof json.objectId !== 'string') {
        throw refus('Demande d’envoi', statut, json);
      }
      // Envoi en flux, sans la clé : l’URL signée suffit. Pas de délai : une vidéo peut prendre plusieurs minutes.
      let reponse: Response;
      try {
        reponse = await recuperer(json.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': typeContenu, 'Content-Length': String((await stat(chemin)).size) },
          body: Readable.toWeb(createReadStream(chemin)) as ReadableStream,
          duplex: 'half',
        } as RequestInit);
      } catch (e) {
        throw new Error(`Stockage du site injoignable (${texteErreur(e)}) : ${RIEN_PERDU}.`);
      }
      if (!reponse.ok) throw new Error(`Fichier refusé par le stockage du site (${reponse.status}) ; ${RIEN_PERDU}.`);
      return json.objectId;
    },
    async enregistrerVideo(id, corps) {
      let r = id === null ? null : await appeler(`/api/videos/${id}`, 'PATCH', corps);
      // Vidéo supprimée du site entre-temps : elle est recréée.
      if (r === null || r.statut === 404) r = await appeler('/api/videos', 'POST', corps);
      if ((r.statut !== 200 && r.statut !== 201) || typeof r.json.id !== 'number') throw refus('Vidéo', r.statut, r.json);
      return r.json.id;
    },
  };
}
