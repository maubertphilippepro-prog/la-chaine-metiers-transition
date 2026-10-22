import type { Ancrage, Consigne, FichierConsignes } from '../../noyau/consignes';
import type { Montage } from '../../noyau/types';
import type { CiblePublication, Publication } from '../../noyau/publication';
import type { Cible } from '../../remotion/scripts/rendu';
import type { VisibiliteYoutube } from '../../noyau/youtube';
import type { DetailPublication, DetailTournage, DossierYoutube, EtatRendu, Pose, ResumeTournage, VerificationYoutube } from '../commun';

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
  publication: (nom: string) => appeler<DetailPublication>(`${chemin(nom)}/publication`),
  enregistrerPublication: (nom: string, p: Publication) => appeler<Publication>(`${chemin(nom)}/publication`, enJson('PUT', p)),
  rediger: (nom: string, cible: CiblePublication) => appeler<Publication>(`${chemin(nom)}/publication/redaction`, enJson('POST', { cible })),
  image: (nom: string, source: 'ecran' | 'camera', instant: number) =>
    appeler<{ chemin: string }>(`${chemin(nom)}/publication/image`, enJson('POST', { source, instant })),
  rendreVignette: (nom: string, cible: CiblePublication) => appeler<Publication>(`${chemin(nom)}/publication/vignette`, enJson('POST', { cible })),
  validerVideo: (nom: string, cible: CiblePublication) => appeler<Publication>(`${chemin(nom)}/publication/valider`, enJson('POST', { cible })),
  preparerYoutube: (nom: string, cible: CiblePublication) =>
    appeler<DossierYoutube>(`${chemin(nom)}/publication/youtube/preparer`, enJson('POST', { cible })),
  ouvrirDossierYoutube: async (nom: string, cible: CiblePublication) => {
    await appeler<{ ok: true }>(`${chemin(nom)}/publication/youtube/ouvrir`, enJson('POST', { cible }));
  },
  envoiYoutube: (nom: string, cible: CiblePublication, envoi: { url: string; visibilite: VisibiliteYoutube; programmeeLe: string | null }) =>
    appeler<Publication>(`${chemin(nom)}/publication/youtube/envoi`, enJson('POST', { cible, ...envoi })),
  verifierYoutube: (nom: string, cible: CiblePublication) =>
    appeler<VerificationYoutube>(`${chemin(nom)}/publication/youtube/verifier`, enJson('POST', { cible })),
  relayer: (nom: string, cible: CiblePublication) => appeler<Publication>(`${chemin(nom)}/publication/relais`, enJson('POST', { cible })),
  poses: () => appeler<Pose[]>('/api/poses'),
};
