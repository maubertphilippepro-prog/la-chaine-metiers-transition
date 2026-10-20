import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import exemple from '../../fixtures/analyse-exemple.json';
import type { ReponseConsigne } from '../../noyau/consignes';
import { montageInitial } from '../../noyau/montage-initial';
import type { Analyse } from '../../noyau/types';
import type { DemandeInterpretation } from './consignes';
import { construirePrompt, interpreterConsigne } from './interpretation';

const analyse = exemple as Analyse;
const demande: DemandeInterpretation = {
  analyse,
  montage: {
    ...montageInitial(analyse, 'Essai'),
    elements: [{ id: 'e0', debut: 3.0, fin: 4.3, statut: 'valide', nature: 'texte', texte: 'sso.example.com', position: 'haut-gauche' }],
  },
  texte: 'Coupe la salutation',
  ancrage: { premierMot: 0, dernierMot: 2 },
  definitionMax: 160,
  texteMax: 40,
  modele: 'claude-opus-5-5',
};
const REPONSE: ReponseConsigne = {
  reformulation: 'Couper la salutation.',
  operations: [{ type: 'couper', premierMot: 0, dernierMot: 2, explication: 'Coupe « Bonjour à tous. ».' }],
  nonRealisable: [],
};

// Faux client : seul messages.parse est appelé.
function client(parse: (...args: unknown[]) => Promise<unknown>) {
  const fonction = vi.fn(parse);
  return { client: { messages: { parse: fonction } } as unknown as Anthropic, parse: fonction };
}

describe('construirePrompt', () => {
  it('donne la transcription numérotée, l’état du montage, la consigne et le passage', () => {
    const prompt = construirePrompt(demande);
    expect(prompt).toContain("0:Bonjour 1:à 2:tous. 3:Aujourd'hui, 4:le 5:SSO.");
    expect(prompt).toContain('Titre de la vidéo : Essai');
    expect(prompt).toContain('- d1 · hesitation · appliquée · aucun mot (blanc entre deux mots)');
    expect(prompt).toContain('- l0 · longueur · longueur en attente · aucun mot (blanc entre deux mots)');
    expect(prompt).toContain('- mot 3 · Le SSO');
    expect(prompt).toContain('- SSO · a-valider · bas · Authentification unique');
    expect(prompt).toContain('Coupe la salutation');
    expect(prompt).toContain('mots 0 à 2 (« Bonjour à tous. »)');
    expect(prompt).toContain('160 caractères');
    expect(prompt).toContain('- e0 · texte · valide · mots 3 à 5 · « sso.example.com » · haut-gauche');
    expect(prompt).toContain('- ajouterElement : ');
    expect(prompt).toContain('ne donne jamais de zone');
    expect(prompt).toContain('40 caractères');
    expect(prompt).toMatchSnapshot();
  });
  it('indique l’absence d’élément', () => {
    expect(construirePrompt({ ...demande, montage: montageInitial(analyse, 'Essai') })).toContain(
      'Éléments à l\'écran (id · nature · statut · mots couverts · texte · position) :\n(aucun)',
    );
  });
  it('n’indique pas de passage sans ancrage', () => {
    expect(construirePrompt({ ...demande, ancrage: null })).not.toContain('Passage sélectionné');
  });
});

describe('interpreterConsigne', () => {
  it('renvoie la réponse structurée de Claude', async () => {
    const { client: c, parse } = client(async () => ({ stop_reason: 'end_turn', parsed_output: REPONSE }));
    expect(await interpreterConsigne(demande, c)).toEqual(REPONSE);
    expect(parse).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-opus-5-5', fallbacks: 'default' }),
      { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } },
    );
  });
  it('retire les champs laissés à null par Claude', async () => {
    const brute = {
      reformulation: 'r',
      operations: [{
        type: 'modifierElement', idElement: 'se0', premierMot: null, dernierMot: null,
        texte: null, position: null, statut: 'valide', explication: 'e',
      }],
      nonRealisable: [],
    };
    const { client: c } = client(async () => ({ stop_reason: 'end_turn', parsed_output: brute }));
    expect((await interpreterConsigne(demande, c)).operations).toEqual([
      { type: 'modifierElement', idElement: 'se0', statut: 'valide', explication: 'e' },
    ]);
  });
  it('n’envoie aucun champ facultatif dans le schéma (grammaire de taille bornée)', async () => {
    const { client: c, parse } = client(async () => ({ stop_reason: 'end_turn', parsed_output: REPONSE }));
    await interpreterConsigne(demande, c);
    const format = (parse.mock.calls[0]![0] as { output_config: { format: { schema: unknown } } }).output_config.format.schema;
    const objets: { properties?: object; required?: string[] }[] = [];
    const parcourir = (n: unknown): void => {
      if (Array.isArray(n)) n.forEach(parcourir);
      else if (n && typeof n === 'object') {
        const o = n as { properties?: object; required?: string[] };
        if (o.properties) objets.push(o);
        Object.values(n).forEach(parcourir);
      }
    };
    parcourir(format);
    for (const o of objets) expect(o.required?.sort()).toEqual(Object.keys(o.properties!).sort());
  });
  it('signale un refus de Claude', async () => {
    const { client: c } = client(async () => ({ stop_reason: 'refusal', parsed_output: null }));
    await expect(interpreterConsigne(demande, c)).rejects.toMatchObject({
      statut: 500, message: 'Claude a refusé de traiter cette consigne.',
    });
  });
  it('signale une réponse inexploitable', async () => {
    const { client: c } = client(async () => ({ stop_reason: 'max_tokens', parsed_output: null }));
    await expect(interpreterConsigne(demande, c)).rejects.toMatchObject({
      statut: 500, message: 'Réponse de Claude inexploitable (arrêt : max_tokens).',
    });
  });
  it('signale une connexion impossible comme une erreur passagère', async () => {
    const { client: c } = client(async () => { throw new Anthropic.APIConnectionError({ message: 'réseau coupé' }); });
    await expect(interpreterConsigne(demande, c)).rejects.toMatchObject({ statut: 503 });
  });
});
