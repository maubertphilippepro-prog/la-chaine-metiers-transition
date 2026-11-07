import { MAX_ELEMENTS } from '../../../noyau/gabarits';
import type { CiblePublication, PoseVignette, PropositionVignette, Publication, StatutPublication, VideoPubliee, Vignette } from '../../../noyau/publication';
import { diffusion, memeQualification, type Diffusion, type DiffusionSite, type DiffusionYoutube, type Nature, type Qualification } from '../../../noyau/qualification';
import type { VisibiliteYoutube } from '../../../noyau/youtube';

export const LIBELLES_NATURE: Record<Nature, string> = { pro: 'Pro', perso: 'Perso' };

const RESUME_YOUTUBE: Record<DiffusionYoutube, string> = {
  aucun: 'aucun envoi',
  'non-repertoriee': 'Non répertoriée',
  privee: 'Privée',
  publique: 'Publique ou Programmée',
};
const RESUME_SITE: Record<DiffusionSite, string> = {
  fichier: 'fichier vidéo, réservé aux comptes autorisés',
  lien: 'lien YouTube, visible de tous',
  aucun: 'rien',
};

// Diffusion déduite de la qualification, en une ligne sous ses contrôles.
export const resumeDiffusion = (d: Diffusion) => `YouTube : ${RESUME_YOUTUBE[d.youtube]} · Site : ${RESUME_SITE[d.site]}`;

export const EXPLICATIONS_RELAIS: Record<Exclude<DiffusionSite, 'aucun'>, string> = {
  fichier: 'Le fichier vidéo et la vignette sont envoyés sur le site, visibles des seuls comptes autorisés. '
    + 'Un nouveau relais renvoie le fichier et met à jour la fiche.',
  lien: 'La vidéo YouTube est intégrée au site, visible de tous, une fois lisible par lien sur YouTube. '
    + 'Un nouveau relais met à jour la fiche.',
};

export const EXPLICATION_RETRAIT = 'Vidéo passée en Perso : elle doit être retirée du site, où elle est encore visible.';
export const CONFIRMATION_RETRAIT = 'Cette vidéo est sur le site : la passer en Perso la retirera du site.';

// Une requalification qui fait sortir du site une vidéo qui y est demande confirmation, puis le retrait.
export const requalificationRetire = (v: VideoPubliee, q: Qualification) =>
  v.replit.id !== null && diffusion(v).site !== 'aucun' && diffusion(q).site === 'aucun';

export const LIBELLES_STATUT: Record<StatutPublication, string> = {
  'a-preparer': 'À préparer',
  prete: 'Prête',
  'envoyee-youtube': 'Envoyée sur YouTube',
  relayee: 'Relayée sur le site',
  erreur: 'Erreur',
};

export const libelleCible = (c: CiblePublication) => (c === 'complete' ? 'Vidéo complète' : `Épisode ${c}`);

export const tagsDepuisTexte = (texte: string) => texte.split(',').map(t => t.trim()).filter(t => t !== '');
export const texteDepuisTags = (tags: string[]) => tags.join(', ');

// Les vidéos qui suivaient l’ancienne qualification par défaut prennent la nouvelle, sauf celles déjà sur le site :
// elles se requalifient une par une, avec confirmation du retrait.
export function changerQualificationParDefaut(p: Publication, q: Qualification): Publication {
  return {
    ...p,
    qualificationParDefaut: q,
    videos: p.videos.map(v => (memeQualification(v, p.qualificationParDefaut) && v.replit.id === null ? { ...v, ...q } : v)),
  };
}

// Pose de départ d’une vignette : la sienne, sinon celle de la vidéo complète, sinon la première pose de la banque.
export function basePose(vignette: Vignette | null, complete: Vignette | null, premierePose: string | undefined): PoseVignette | null {
  const source = vignette ?? complete;
  if (source) return source.pose;
  return premierePose ? { source: 'banque', fichier: premierePose } : null;
}

export const LIBELLES_VISIBILITE: Record<VisibiliteYoutube, string> = {
  privee: 'Privée', 'non-repertoriee': 'Non répertoriée', publique: 'Publique', programmee: 'Programmée',
};

// Champ « datetime-local » (heure locale, sans fuseau) ↔ date ISO enregistrée.
export function isoDepuisLocal(valeur: string): string | null {
  if (!valeur) return null;
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function localDepuisIso(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const deux = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}T${deux(d.getHours())}:${deux(d.getMinutes())}`;
}

// Logo ou capture coché ou décoché ; au plus `max`, dans l'ordre des clics.
export function basculer(liste: string[], fichier: string, max = MAX_ELEMENTS): string[] {
  if (liste.includes(fichier)) return liste.filter(f => f !== fichier);
  return liste.length < max ? [...liste, fichier] : liste;
}

// Vignette composée d'après une proposition de Claude.
export function vignetteDepuisProposition(p: PropositionVignette, fichier: string | null): Vignette {
  return {
    pose: { source: 'banque', fichier: p.pose }, accroche: p.accroche, gabarit: p.gabarit, logos: p.logos, captures: p.captures, fichier,
    ...(p.mise ? { mise: p.mise } : {}),
  };
}

// Applique à la vignette la proposition `indice` de la consigne `consigne` et la marque retenue ; le fichier rendu
// est gardé tel quel (il redevient « à rendre » dès que l'image change, comme pour une retouche à la main).
export function appliquerProposition(v: VideoPubliee, consigne: number, indice: number): Partial<VideoPubliee> {
  const p = v.consignesVignette[consigne]?.propositions[indice];
  if (!p) return {};
  return {
    vignette: vignetteDepuisProposition(p, v.vignette?.fichier ?? null),
    consignesVignette: v.consignesVignette.map((c, i) => (i === consigne ? { ...c, choisie: indice } : c)),
  };
}

export interface Formulaire {
  pose: string; accroche: string; logosTexte: string; captures: string[]; consignes: string;
  base: { consigne: number; proposition: number } | null;
}

// Logos en texte : la saisie du tour si elle existe, sinon les noms de fichiers sans extension.
const texteLogos = (logos: string[]) => logos.map(f => f.replace(/\.[^.]+$/, '')).join(', ');

// Repartir d'une variante : ses éléments et son accroche ; les consignes sont à réécrire.
export function formulaireDepuisBase(v: VideoPubliee, consigne: number, proposition: number): Formulaire {
  const tour = v.consignesVignette[consigne]!;
  const p = tour.propositions[proposition]!;
  return {
    pose: p.pose, accroche: p.accroche, logosTexte: tour.elements?.logosTexte ?? texteLogos(p.logos),
    captures: p.captures, consignes: '', base: { consigne, proposition },
  };
}

// Formulaire d'une vignette pas encore générée : la vignette actuelle, sinon la pose de la vidéo complète, les logiciels
// cités et la première accroche rédigée.
export function formulaireInitial(v: VideoPubliee, premierePose: string | undefined, complete: Vignette | null): Formulaire {
  const vi = v.vignette;
  return {
    pose: basePose(vi, complete, premierePose)?.fichier ?? '',
    accroche: vi?.accroche ?? v.accroches[0] ?? '',
    logosTexte: vi ? texteLogos(vi.logos) : v.logiciels.join(', '),
    captures: vi?.captures ?? [], consignes: '', base: null,
  };
}
