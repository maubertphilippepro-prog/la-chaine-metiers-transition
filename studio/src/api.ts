import type { Ancrage, Consigne, FichierConsignes } from '../../noyau/consignes';
import type { Montage } from '../../noyau/types';
import type { Cible } from '../../remotion/scripts/rendu';
import type { DetailTournage, EtatRendu, ResumeTournage } from '../commun';

export class ErreurApi extends Error {
  constructor(readonly statut: number, message: string, readonly problemes: string[]) {
    super(message);
  }
}

async function appeler<T>(url: string, init?: RequestInit): Promise<T> {
  const reponse = await fetch(url, init);
  const corps: unknown = await reponse.json().catch(() => ({}));
  if (!reponse.ok) {
    const c = corps as { erreur?: string; problemes?: string[] };
    throw new ErreurApi(reponse.status, c.erreur ?? `Erreur ${reponse.status}`, c.problemes ?? []);
  }
  return corps as T;
}

const enJson = (methode: string, corps: unknown): RequestInit => ({
  method: methode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(corps),
});

const chemin = (nom: string) => `/api/tournages/${encodeURIComponent(nom)}`;

export const api = {
  tournages: () => appeler<ResumeTournage[]>('/api/tournages'),
  tournage: (nom: string) => appeler<DetailTournage>(chemin(nom)),
  enregistrer: async (nom: string, montage: Montage) => {
    await appeler<{ ok: true }>(`${chemin(nom)}/montage`, enJson('PUT', montage));
  },
  relancerSuggestions: (nom: string) => appeler<DetailTournage>(`${chemin(nom)}/suggestions`, { method: 'POST' }),
  donnerConsigne: (nom: string, texte: string, ancrage: Ancrage | null) =>
    appeler<Consigne>(`${chemin(nom)}/consignes`, enJson('POST', { texte, ancrage })),
  enregistrerConsignes: async (nom: string, fichier: FichierConsignes) => {
    await appeler<{ ok: true }>(`${chemin(nom)}/consignes`, enJson('PUT', fichier));
  },
  rendre: (nom: string, cible: Cible) => appeler<EtatRendu>(`${chemin(nom)}/rendu`, enJson('POST', { cible })),
  etatRendu: () => appeler<EtatRendu>('/api/rendu'),
};
