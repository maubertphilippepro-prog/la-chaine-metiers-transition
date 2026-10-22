import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Attente } from './Attente';

describe('Attente', () => {
  it('affiche le sablier devant le libellé, annoncé aux lecteurs d’écran', () => {
    expect(renderToStaticMarkup(<Attente libelle="Rendu de la vignette…" />)).toBe(
      '<span class="attente" role="status"><span class="sablier" aria-hidden="true">⏳</span>Rendu de la vignette…</span>',
    );
  });
});
