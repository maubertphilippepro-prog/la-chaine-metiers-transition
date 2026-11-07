// Classements du site (par outil, par thème…) : le site déclare ses types et leurs valeurs, le studio y range chaque vidéo.
export const CLE_OUTIL = 'outil';

export interface ValeurClassement { id: number; nom: string }
export interface TypeClassement { cle: string; libelle: string; multiple: boolean; obligatoire: boolean; valeurs: ValeurClassement[] }
// 'aucun' : « Aucune sélection » cochée sciemment ; clé absente : pas encore décidé.
export type ChoixClassements = Record<string, number[] | 'aucun'>;

export function classementsManquants(types: TypeClassement[], choix: ChoixClassements): string[] {
  return types.flatMap(t => {
    const c = choix[t.cle];
    const aucunPossible = !t.obligatoire && c === 'aucun';
    if (aucunPossible) return [];
    if (c === undefined || c === 'aucun' || c.length === 0) {
      return [`${t.libelle} : choisissez une valeur${t.obligatoire ? '' : ' ou cochez Aucune sélection'}.`];
    }
    if (!t.multiple && c.length > 1) return [`${t.libelle} : une seule valeur possible.`];
    if (c.some(id => !t.valeurs.some(v => v.id === id))) return [`${t.libelle} : valeur inconnue du site, choisissez-en une autre.`];
    return [];
  });
}

// Corps `classifications` du site : seuls ses types actuels, Aucune sélection en liste vide.
export function classificationsSite(types: TypeClassement[], choix: ChoixClassements): Record<string, number[]> {
  return Object.fromEntries(types.map(t => {
    const c = choix[t.cle];
    return [t.cle, Array.isArray(c) ? c : []];
  }));
}
