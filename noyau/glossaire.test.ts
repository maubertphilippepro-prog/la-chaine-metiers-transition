import { describe, expect, it } from 'vitest';
import { majGlossaire } from './glossaire';
import type { Terme } from './types';

describe('majGlossaire', () => {
  it('ajoute les termes validés et met à jour les définitions sans tenir compte de la casse', () => {
    const g = { termes: [{ terme: 'sso', definition: 'Ancienne.' }, { terme: 'API', definition: 'Interface.' }] };
    const termes: Terme[] = [
      { terme: 'SSO', definition: 'Nouvelle.', occurrences: [], statut: 'valide', position: 'bas' },
      { terme: 'IA', definition: 'Intelligence artificielle.', occurrences: [], statut: 'valide', position: 'haut' },
      { terme: 'Web', definition: 'Écarté.', occurrences: [], statut: 'ecarte', position: 'bas' },
    ];
    expect(majGlossaire(g, termes)).toEqual({
      termes: [
        { terme: 'sso', definition: 'Nouvelle.' },
        { terme: 'API', definition: 'Interface.' },
        { terme: 'IA', definition: 'Intelligence artificielle.' },
      ],
    });
    expect(g.termes[0]!.definition).toBe('Ancienne.');
  });
});
