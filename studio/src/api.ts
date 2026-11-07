import type { ValeurClassement } from '../../noyau/classements';
import type { Ancrage, Consigne, FichierConsignes } from '../../noyau/consignes';
import type { Montage } from '../../noyau/types';
import type { CiblePublication, Publication } from '../../noyau/publication';
import type { Qualification } from '../../noyau/qualification';
import type { Cible } from '../../remotion/scripts/rendu';
import type { VisibiliteYoutube } from '../../noyau/youtube';
import type { Formulaire } from './logique/publication';
import type { BriefLinkedin, ProfilLinkedin } from '../../noyau/linkedin';
import type { Presentation } from '../../noyau/presentation';
import type { DetailLinkedin, DetailMail, DetailPresentation, DetailPublication, DetailTournage, DossierYoutube, EtatInsertion, EtatRendu, Pose, ResumeTournage, VerificationYoutube } from '../commun';

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

// XMLHttpRequest plutôt que fetch : lui seul donne la progression de l'envoi.
function envoyerFichier<T>(url: string, fichier: File, onProgression: (part: number) => void): Promise<T> {
  return new Promise<T>((resoudre, rejeter) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgression(e.loaded / e.total); };
    xhr.onload = () => {
      let corps: unknown = {};
      try {
        corps = JSON.parse(xhr.responseText);
      } catch {
        // corps non JSON : le statut suffit
      }
      if (xhr.status >= 200 && xhr.status < 300) resoudre(corps as T);
      else rejeter(new ErreurApi(xhr.status, (corps as { erreur?: string }).erreur ?? `Erreur ${xhr.status}`, []));
    };
    xhr.onerror = () => rejeter(new ErreurApi(0, 'Envoi de la vidéo interrompu : studio fermé, disque plein ou fichier refusé.', []));
    xhr.send(fichier);
  });
}

export const api = {
  tournages: () => appeler<ResumeTournage[]>('/api/tournages'),
  mail: (nom: string, cible: CiblePublication) => appeler<DetailMail>(`${chemin(nom)}/publication/mail?cible=${cible}`),
  enregistrerMail: (nom: string, cible: CiblePublication, champs: { texte?: string; notes?: string }) =>
    appeler<DetailMail>(`${chemin(nom)}/publication/mail`, enJson('PUT', { cible, ...champs })),
  actionMail: (nom: string, cible: CiblePublication, quoi: 'copie' | 'onedrive' | 'deplacer' | 'redaction' | 'construire' | 'brouillon') =>
    appeler<DetailMail>(`${chemin(nom)}/publication/mail/${quoi}`, enJson('POST', { cible })),
  presentation: (nom: string, cible: CiblePublication) => appeler<DetailPresentation>(`${chemin(nom)}/publication/presentation?cible=${cible}`),
  enregistrerPresentation: (nom: string, cible: CiblePublication, presentation: Presentation) =>
    appeler<DetailPresentation>(`${chemin(nom)}/publication/presentation`, enJson('PUT', { cible, presentation })),
  redigerPresentation: (nom: string, cible: CiblePublication) =>
    appeler<DetailPresentation>(`${chemin(nom)}/publication/presentation/redaction`, enJson('POST', { cible })),
  linkedin: (nom: string, cible: CiblePublication) => appeler<DetailLinkedin>(`${chemin(nom)}/publication/linkedin?cible=${cible}`),
  enregistrerLinkedin: (nom: string, cible: CiblePublication, champs: { brief?: BriefLinkedin; posts?: Partial<Record<ProfilLinkedin, string>> }) =>
    appeler<DetailLinkedin>(`${chemin(nom)}/publication/linkedin`, enJson('PUT', { cible, ...champs })),
  redigerLinkedin: (nom: string, cible: CiblePublication, profils: ProfilLinkedin[]) =>
    appeler<DetailLinkedin>(`${chemin(nom)}/publication/linkedin/redaction`, enJson('POST', { cible, profils })),
  retoucherMail: (nom: string, cible: CiblePublication, consigne: string) =>
    appeler<DetailMail & { resumeRetouche: string }>(`${chemin(nom)}/publication/mail/retouche`, enJson('POST', { cible, consigne })),
  deposerImageMail: (nom: string, cible: CiblePublication, fichier: string, contenu: Blob) => appeler<DetailMail>(
    `${chemin(nom)}/publication/mail/images?cible=${cible}&fichier=${encodeURIComponent(fichier)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: contenu },
  ),
  tournage: (nom: string) => appeler<DetailTournage>(chemin(nom)),
  creerValeurClassement: (cle: string, nom: string) =>
    appeler<ValeurClassement>(`/api/site/classements/${encodeURIComponent(cle)}/valeurs`, enJson('POST', { nom })),
  creerTournage: (titre: string, date: string) => appeler<{ nom: string }>('/api/tournages', enJson('POST', { titre, date })),
  // XMLHttpRequest plutôt que fetch : lui seul donne la progression de l'envoi.
  deposerVideo: async (nom: string, fichier: File, onProgression: (part: number) => void) => {
    await envoyerFichier(`${chemin(nom)}/video?fichier=${encodeURIComponent(fichier.name)}`, fichier, onProgression);
  },
  deposerRush: (nom: string, fichier: File, onProgression: (part: number) => void) =>
    envoyerFichier<{ fichier: string }>(`${chemin(nom)}/rush?fichier=${encodeURIComponent(fichier.name)}`, fichier, onProgression),
  insererRush: async (nom: string, fichier: string, t: number, titre: string) => {
    await appeler<{ ok: true }>(`${chemin(nom)}/rush`, enJson('POST', { fichier, t, titre }));
  },
  etatInsertion: (nom: string) => appeler<EtatInsertion>(`${chemin(nom)}/rush`),
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
  rendreVignette: (nom: string, cible: CiblePublication) => appeler<Publication>(`${chemin(nom)}/publication/vignette`, enJson('POST', { cible })),
  genererVignette: (nom: string, cible: CiblePublication, f: Formulaire) =>
    appeler<Publication>(`${chemin(nom)}/publication/vignette/generer`, enJson('POST', { cible, ...f })),
  captures: (nom: string) => appeler<string[]>(`${chemin(nom)}/publication/captures`),
  deposerCapture: (nom: string, fichier: string, contenu: Blob) => appeler<{ fichier: string; captures: string[] }>(
    `${chemin(nom)}/publication/captures?fichier=${encodeURIComponent(fichier)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: contenu },
  ),
  validerVideo: (nom: string, cible: CiblePublication) => appeler<Publication>(`${chemin(nom)}/publication/valider`, enJson('POST', { cible })),
  preparerYoutube: (nom: string, cible: CiblePublication) =>
    appeler<DossierYoutube>(`${chemin(nom)}/publication/youtube/preparer`, enJson('POST', { cible })),
  ouvrirDossier: async (nom: string, dossier: 'vignettes' | 'sharepoint' | 'onedrive') => {
    await appeler<{ ok: true }>(`${chemin(nom)}/publication/ouvrir`, enJson('POST', { dossier }));
  },
  ouvrirDossierYoutube: async (nom: string, cible: CiblePublication) => {
    await appeler<{ ok: true }>(`${chemin(nom)}/publication/youtube/ouvrir`, enJson('POST', { cible }));
  },
  envoiYoutube: (nom: string, cible: CiblePublication, envoi: { url: string; visibilite: VisibiliteYoutube; programmeeLe: string | null }) =>
    appeler<Publication>(`${chemin(nom)}/publication/youtube/envoi`, enJson('POST', { cible, ...envoi })),
  verifierYoutube: (nom: string, cible: CiblePublication) =>
    appeler<VerificationYoutube>(`${chemin(nom)}/publication/youtube/verifier`, enJson('POST', { cible })),
  relayer: (nom: string, cible: CiblePublication) => appeler<Publication>(`${chemin(nom)}/publication/relais`, enJson('POST', { cible })),
  poses: () => appeler<Pose[]>('/api/poses'),
  deposerPose: (fichier: string, contenu: Blob) => appeler<{ fichier: string; poses: Pose[] }>(
    `/api/poses?fichier=${encodeURIComponent(fichier)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: contenu },
  ),
};
