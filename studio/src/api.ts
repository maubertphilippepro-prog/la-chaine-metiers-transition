import type { Ancrage, Consigne, FichierConsignes } from '../../noyau/consignes';
import type { Montage } from '../../noyau/types';
import type { CiblePublication, Publication } from '../../noyau/publication';
import type { Qualification } from '../../noyau/qualification';
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
  creerTournage: (titre: string, date: string) => appeler<{ nom: string }>('/api/tournages', enJson('POST', { titre, date })),
  // XMLHttpRequest plutôt que fetch : lui seul donne la progression de l'envoi.
  deposerVideo: (nom: string, fichier: File, onProgression: (part: number) => void) => new Promise<void>((resoudre, rejeter) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `${chemin(nom)}/video?fichier=${encodeURIComponent(fichier.name)}`);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgression(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resoudre();
        return;
      }
      let erreur = `Erreur ${xhr.status}`;
      try {
        erreur = (JSON.parse(xhr.responseText) as { erreur?: string }).erreur ?? erreur;
      } catch {
        // corps non JSON : le statut suffit
      }
      rejeter(new ErreurApi(xhr.status, erreur, []));
    };
    xhr.onerror = () => rejeter(new ErreurApi(0, 'Envoi de la vidéo interrompu : studio fermé, disque plein ou fichier refusé.', []));
    xhr.send(fichier);
  }),
  analyser: async (nom: string, titre: string) => {
    await appeler<{ ok: true }>(`${chemin(nom)}/analyse`, enJson('POST', { titre }));
  },
  supprimerTournage: async (nom: string) => {
    await appeler<{ ok: true }>(chemin(nom), { method: 'DELETE' });
  },
  retirerVideo: async (nom: string) => {
    await appeler<{ ok: true }>(`${chemin(nom)}/video`, { method: 'DELETE' });
  },
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
  retirerDuSite: (nom: string, cible: CiblePublication, q: Qualification) =>
    appeler<Publication>(`${chemin(nom)}/publication/site/retirer`, enJson('POST', { cible, ...q })),
  etatRendu: () => appeler<EtatRendu>('/api/rendu'),
  publication: (nom: string) => appeler<DetailPublication>(`${chemin(nom)}/publication`),
  enregistrerPublication: (nom: string, p: Publication) => appeler<Publication>(`${chemin(nom)}/publication`, enJson('PUT', p)),
  rediger: (nom: string, cible: CiblePublication) => appeler<Publication>(`${chemin(nom)}/publication/redaction`, enJson('POST', { cible })),
  image: (nom: string, source: 'ecran' | 'camera', instant: number) =>
    appeler<{ chemin: string }>(`${chemin(nom)}/publication/image`, enJson('POST', { source, instant })),
  rendreVignette: (nom: string, cible: CiblePublication) => appeler<Publication>(`${chemin(nom)}/publication/vignette`, enJson('POST', { cible })),
  captures: (nom: string) => appeler<string[]>(`${chemin(nom)}/publication/captures`),
  deposerCapture: (nom: string, fichier: string, contenu: Blob) => appeler<{ fichier: string; captures: string[] }>(
    `${chemin(nom)}/publication/captures?fichier=${encodeURIComponent(fichier)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: contenu },
  ),
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
