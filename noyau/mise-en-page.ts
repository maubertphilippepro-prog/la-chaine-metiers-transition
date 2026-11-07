// Réglages fins d'une vignette, que Claude fait varier d'une proposition à l'autre. Absents, ils valent le rendu
// d'origine des gabarits.

export interface Recadrage { x: number; y: number; largeur: number; hauteur: number }

export interface MiseEnPage {
  cotePose: 'gauche' | 'droite';
  tailleAccroche: 'petite' | 'normale' | 'grande';
  // Un par capture, dans l'ordre ; null : image entière. Zone en % de l'image.
  recadrages: (Recadrage | null)[];
  // Logo mis en avant (plus grand, en premier), parmi ceux de la vignette.
  logoVedette: string | null;
}

export const COTES_POSE = ['gauche', 'droite'] as const;
export const TAILLES_ACCROCHE = ['petite', 'normale', 'grande'] as const;
export const COTE_MIN_RECADRAGE = 10;

export const MISE_PAR_DEFAUT: MiseEnPage = { cotePose: 'droite', tailleAccroche: 'normale', recadrages: [], logoVedette: null };

const borne = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));

function bornerRecadrage(r: Recadrage | null | undefined): Recadrage | null {
  if (!r) return null;
  const largeur = borne(r.largeur, COTE_MIN_RECADRAGE, 100);
  const hauteur = borne(r.hauteur, COTE_MIN_RECADRAGE, 100);
  return { x: borne(r.x, 0, 100 - largeur), y: borne(r.y, 0, 100 - hauteur), largeur, hauteur };
}

// Mise ramenée à ce que la vignette permet : valeurs connues, un recadrage par capture, logo vedette présent.
export function bornerMise(m: Partial<MiseEnPage> | undefined, logos: string[], captures: number): MiseEnPage {
  const recadrages = Array.from({ length: captures }, (_, i) => bornerRecadrage(m?.recadrages?.[i]));
  return {
    cotePose: COTES_POSE.includes(m?.cotePose as never) ? m!.cotePose! : MISE_PAR_DEFAUT.cotePose,
    tailleAccroche: TAILLES_ACCROCHE.includes(m?.tailleAccroche as never) ? m!.tailleAccroche! : MISE_PAR_DEFAUT.tailleAccroche,
    recadrages,
    logoVedette: m?.logoVedette && logos.includes(m.logoVedette) ? m.logoVedette : null,
  };
}

const estNombre = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
const estRecadrage = (r: unknown) => r === null
  || (typeof r === 'object' && ['x', 'y', 'largeur', 'hauteur'].every(k => estNombre((r as Record<string, unknown>)[k])));

export function raisonMise(m: unknown): string | null {
  if (typeof m !== 'object' || m === null) return 'mise invalide';
  const v = m as Record<string, unknown>;
  const ok = COTES_POSE.includes(v.cotePose as never) && TAILLES_ACCROCHE.includes(v.tailleAccroche as never)
    && Array.isArray(v.recadrages) && v.recadrages.every(estRecadrage)
    && (v.logoVedette === null || typeof v.logoVedette === 'string');
  return ok ? null : 'mise invalide';
}

// Vide pour la mise par défaut : les vignettes déjà rendues gardent leur clé et ne redeviennent pas « à rendre ».
export function cleMise(m: MiseEnPage | undefined): string {
  if (!m) return '';
  const defaut = m.cotePose === 'droite' && m.tailleAccroche === 'normale' && m.recadrages.every(r => r === null) && m.logoVedette === null;
  return defaut ? '' : JSON.stringify(m);
}
