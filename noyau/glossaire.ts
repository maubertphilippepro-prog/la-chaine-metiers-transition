import type { Terme } from './types';

export interface EntreeGlossaire {
  terme: string;
  definition: string;
}

export interface Glossaire {
  termes: EntreeGlossaire[];
}

// Les termes validés sont ajoutés ou mis à jour, sans tenir compte de la casse comme le pipeline.
export function majGlossaire(g: Glossaire, termes: Terme[]): Glossaire {
  const entrees = g.termes.map(e => ({ ...e }));
  for (const t of termes) {
    if (t.statut !== 'valide') continue;
    const existante = entrees.find(e => e.terme.toLowerCase() === t.terme.toLowerCase());
    if (existante) existante.definition = t.definition;
    else entrees.push({ terme: t.terme, definition: t.definition });
  }
  return { ...g, termes: entrees };
}
