import { describe, expect, it } from 'vitest';
import exemple from '../fixtures/analyse-exemple.json';
import {
  accepterPropositions, extraitPassage, indicesEnAttente, motsRecouverts, passageEnTemps, premierMotDuChapitre,
  propositionsEnAttente, proposer, raisonFichierConsignes, refuserPropositions, verifierOperation,
  type Consigne, type Operation, type OperationExpliquee,
} from './consignes';
import type { Analyse, Montage } from './types';

const analyse = exemple as Analyse;
const reglages = { definitionMaxCaracteres: 160 };
const base: Montage = {
  version: 1,
  titre: 'Essai',
  coupes: [
    { id: 'd1', type: 'hesitation', debut: 1.8, fin: 3.0, active: true },
    { id: 'l0', type: 'longueur', debut: 3.0, fin: 3.8, active: false, enAttente: true },
  ],
  chapitres: [{ titre: 'Intro', debut: 0 }, { titre: 'Le SSO', debut: 3.0 }],
  termes: [{ terme: 'SSO', definition: 'Déf.', occurrences: [3.8], statut: 'a-valider', position: 'bas' }],
};

const verifier = (op: Operation, m: Montage = base) => verifierOperation(analyse, m, op, reglages);
const montageDe = (op: Operation, m: Montage = base): Montage => {
  const v = verifier(op, m);
  if (!('montage' in v)) throw new Error(v.probleme);
  return v.montage;
};
const probleme = (op: Operation, m: Montage = base) => {
  const v = verifier(op, m);
  return 'probleme' in v ? v.probleme : null;
};

describe('mots et temps', () => {
  it('convertit un passage en temps : début du premier mot, fin du dernier', () => {
    expect(passageEnTemps(analyse, 1, 2)).toEqual({ debut: 1.25, fin: 1.8 });
    expect(passageEnTemps(analyse, 4, 4)).toEqual({ debut: 3.65, fin: 3.75 });
  });
  it('refuse un mot hors de la transcription ou un passage à l’envers', () => {
    expect(passageEnTemps(analyse, 0, 9)).toBe('Le mot 9 n’existe pas dans la transcription.');
    expect(passageEnTemps(analyse, 2, 1)).toBe('Le passage 2 à 1 est à l’envers.');
  });
  it('donne le premier mot de chaque chapitre', () => {
    expect(premierMotDuChapitre(analyse, base, 0)).toBe(0);
    expect(premierMotDuChapitre(analyse, base, 1)).toBe(3);
    expect(premierMotDuChapitre(analyse, base, 2)).toBeNull();
  });
  it('donne les mots recouverts par une coupe', () => {
    expect(motsRecouverts(analyse, base.coupes[1]!)).toEqual({ premierMot: 3, dernierMot: 4 });
    expect(motsRecouverts(analyse, base.coupes[0]!)).toBeNull();
  });
  it('extrait le texte d’un passage, abrégé au-delà de la longueur maximale', () => {
    expect(extraitPassage(analyse, { premierMot: 0, dernierMot: 2 })).toBe('Bonjour à tous.');
    expect(extraitPassage(analyse, { premierMot: 0, dernierMot: 2 }, 10)).toBe('Bonjour à…');
  });
});

describe('coupes', () => {
  it('coupe un passage désigné par ses mots', () => {
    expect(montageDe({ type: 'couper', premierMot: 1, dernierMot: 2 }).coupes[2]).toEqual({
      id: 'm0', type: 'manuelle', debut: 1.25, fin: 1.8, active: true,
    });
    expect(probleme({ type: 'couper', premierMot: 3, dernierMot: 9 })).toBe('Le mot 9 n’existe pas dans la transcription.');
    expect(probleme({ type: 'couper', premierMot: 2, dernierMot: 1 })).toBe('Le passage 2 à 1 est à l’envers.');
  });
  it('rétablit une coupe, sauf inconnue ou longueur en attente', () => {
    expect(montageDe({ type: 'basculerCoupe', idCoupe: 'd1' }).coupes[0]!.active).toBe(false);
    expect(probleme({ type: 'basculerCoupe', idCoupe: 'x' })).toBe('La coupe x n’existe pas.');
    expect(probleme({ type: 'basculerCoupe', idCoupe: 'l0' })).toBe(
      'La coupe l0 est une longueur en attente : il faut l’accepter ou la refuser.',
    );
  });
  it('décide d’une longueur, pas d’une autre coupe', () => {
    expect(montageDe({ type: 'deciderLongueur', idCoupe: 'l0', accepter: true }).coupes[1]).toMatchObject({
      active: true, enAttente: false,
    });
    expect(probleme({ type: 'deciderLongueur', idCoupe: 'd1', accepter: true })).toBe(
      'La coupe d1 n’est pas une longueur proposée.',
    );
    expect(probleme({ type: 'deciderLongueur', idCoupe: 'x', accepter: false })).toBe('La coupe x n’existe pas.');
  });
});

describe('chapitres', () => {
  it('renomme le chapitre désigné par son premier mot', () => {
    expect(montageDe({ type: 'renommerChapitre', premierMotChapitre: 3, titre: 'SSO' }).chapitres[1]).toEqual({
      titre: 'SSO', debut: 3.0,
    });
    expect(probleme({ type: 'renommerChapitre', premierMotChapitre: 4, titre: 'X' })).toBe(
      'Aucun chapitre ne commence au mot 4.',
    );
    expect(probleme({ type: 'renommerChapitre', premierMotChapitre: 3, titre: '  ' })).toBe('Le titre est vide.');
  });
  it('ajoute un chapitre au début d’un mot', () => {
    expect(montageDe({ type: 'ajouterChapitre', premierMot: 5, titre: 'Fin' }).chapitres.map(c => c.debut)).toEqual([0, 3.0, 3.8]);
    expect(probleme({ type: 'ajouterChapitre', premierMot: 3, titre: 'X' })).toBe('Un chapitre commence déjà au mot 3.');
    expect(probleme({ type: 'ajouterChapitre', premierMot: 0, titre: 'X' })).toBe('Un chapitre commence déjà au mot 0.');
    expect(probleme({ type: 'ajouterChapitre', premierMot: 9, titre: 'X' })).toBe('Le mot 9 n’existe pas dans la transcription.');
    expect(probleme({ type: 'ajouterChapitre', premierMot: 5, titre: '' })).toBe('Le titre est vide.');
  });
  it('déplace le début d’un chapitre entre ses voisins, jamais le premier', () => {
    expect(montageDe({ type: 'deplacerChapitre', premierMotChapitre: 3, nouveauPremierMot: 5 }).chapitres[1]!.debut).toBe(3.8);
    expect(probleme({ type: 'deplacerChapitre', premierMotChapitre: 3, nouveauPremierMot: 0 })).toBe(
      'Le chapitre ne peut pas commencer au mot 0 : ce mot n’est pas entre le début du chapitre précédent et le chapitre suivant.',
    );
    expect(probleme({ type: 'deplacerChapitre', premierMotChapitre: 0, nouveauPremierMot: 1 })).toBe(
      'Le premier chapitre ne peut pas être déplacé.',
    );
    expect(probleme({ type: 'deplacerChapitre', premierMotChapitre: 3, nouveauPremierMot: 9 })).toBe(
      'Le mot 9 n’existe pas dans la transcription.',
    );
  });
  it('fusionne un chapitre avec le précédent, jamais le premier', () => {
    expect(montageDe({ type: 'fusionnerChapitre', premierMotChapitre: 3 }).chapitres).toEqual([{ titre: 'Intro', debut: 0 }]);
    expect(probleme({ type: 'fusionnerChapitre', premierMotChapitre: 0 })).toBe('Le premier chapitre ne peut pas être fusionné.');
  });
  it('désigne encore un chapitre par son premier mot après une fusion', () => {
    const trois = montageDe({ type: 'ajouterChapitre', premierMot: 5, titre: 'Fin' });
    const fusionne = montageDe({ type: 'fusionnerChapitre', premierMotChapitre: 3 }, trois);
    expect(montageDe({ type: 'renommerChapitre', premierMotChapitre: 5, titre: 'Conclusion' }, fusionne).chapitres).toEqual([
      { titre: 'Intro', debut: 0 }, { titre: 'Conclusion', debut: 3.8 },
    ]);
    expect(probleme({ type: 'renommerChapitre', premierMotChapitre: 3, titre: 'X' }, fusionne)).toBe(
      'Aucun chapitre ne commence au mot 3.',
    );
  });
});

describe('termes et titre', () => {
  it('modifie un terme existant', () => {
    expect(montageDe({ type: 'modifierTerme', terme: 'SSO', statut: 'valide', definition: 'Nouvelle.' }).termes[0]).toEqual({
      terme: 'SSO', definition: 'Nouvelle.', occurrences: [3.8], statut: 'valide', position: 'bas',
    });
    expect(montageDe({ type: 'modifierTerme', terme: 'SSO', position: 'haut' }).termes[0]!.position).toBe('haut');
    expect(probleme({ type: 'modifierTerme', terme: 'API', statut: 'valide' })).toBe('Le terme « API » n’existe pas.');
    expect(probleme({ type: 'modifierTerme', terme: 'SSO', definition: ' ' })).toBe('La définition est vide.');
    expect(probleme({ type: 'modifierTerme', terme: 'SSO', definition: 'x'.repeat(161) })).toBe(
      'La définition dépasse 160 caractères.',
    );
  });
  it('refuse une opération sans effet', () => {
    expect(probleme({ type: 'modifierTerme', terme: 'SSO', statut: 'a-valider' })).toBe(
      'Cette opération ne changerait rien au montage.',
    );
    expect(probleme({ type: 'titreVideo', titre: 'Essai' })).toBe('Cette opération ne changerait rien au montage.');
  });
  it('ajoute un terme aux mots où il est prononcé', () => {
    expect(montageDe({ type: 'ajouterTerme', terme: 'prompt', definition: 'Consigne.', mots: [5, 1] }).termes[1]).toEqual({
      terme: 'prompt', definition: 'Consigne.', occurrences: [1.25, 3.8], statut: 'a-valider', position: 'bas',
    });
    expect(probleme({ type: 'ajouterTerme', terme: 'sso', definition: 'D.', mots: [5] })).toBe('Le terme « sso » existe déjà.');
    expect(probleme({ type: 'ajouterTerme', terme: ' ', definition: 'D.', mots: [5] })).toBe('Le terme est vide.');
    expect(probleme({ type: 'ajouterTerme', terme: 'IA', definition: '', mots: [5] })).toBe('La définition est vide.');
    expect(probleme({ type: 'ajouterTerme', terme: 'IA', definition: 'D.', mots: [] })).toBe(
      'Aucun mot n’indique où le terme est prononcé.',
    );
    expect(probleme({ type: 'ajouterTerme', terme: 'IA', definition: 'D.', mots: [9] })).toBe(
      'Le mot 9 n’existe pas dans la transcription.',
    );
  });
  it('change le titre de la vidéo', () => {
    expect(montageDe({ type: 'titreVideo', titre: 'Le SSO expliqué' }).titre).toBe('Le SSO expliqué');
    expect(probleme({ type: 'titreVideo', titre: ' ' })).toBe('Le titre est vide.');
  });
  it('ne modifie pas le montage d’origine', () => {
    montageDe({ type: 'couper', premierMot: 1, dernierMot: 2 });
    expect(base.coupes).toHaveLength(2);
  });
});

const OPERATIONS: OperationExpliquee[] = [
  { type: 'couper', premierMot: 1, dernierMot: 2, explication: 'Coupe « à tous ».' },
  { type: 'basculerCoupe', idCoupe: 'm0', explication: 'Rétablit la coupe qui vient d’être faite.' },
  { type: 'renommerChapitre', premierMotChapitre: 4, titre: 'X', explication: 'Renomme un chapitre.' },
];

const consigneDe = (operations: OperationExpliquee[]): Consigne => ({
  id: 'c1',
  date: '2026-10-19T10:00:00.000Z',
  texte: 'Coupe « à tous »',
  ancrage: null,
  reformulation: 'Couper « à tous ».',
  nonRealisable: [],
  propositions: proposer(analyse, base, operations, reglages),
});

describe('propositions', () => {
  it('vérifie les opérations en chaîne, chacune après les précédentes', () => {
    expect(proposer(analyse, base, OPERATIONS, reglages)).toEqual([
      { operation: { type: 'couper', premierMot: 1, dernierMot: 2 }, explication: 'Coupe « à tous ».', etat: 'en-attente' },
      { operation: { type: 'basculerCoupe', idCoupe: 'm0' }, explication: 'Rétablit la coupe qui vient d’être faite.', etat: 'en-attente' },
      {
        operation: { type: 'renommerChapitre', premierMotChapitre: 4, titre: 'X' },
        explication: 'Renomme un chapitre.',
        etat: 'invalide',
        probleme: 'Aucun chapitre ne commence au mot 4.',
      },
    ]);
  });
  it('n’enchaîne pas sur une opération invalide', () => {
    const p = proposer(analyse, base, [
      { type: 'ajouterChapitre', premierMot: 9, titre: 'X', explication: 'a' },
      { type: 'ajouterChapitre', premierMot: 5, titre: 'Fin', explication: 'b' },
    ], reglages);
    expect(p.map(x => x.etat)).toEqual(['invalide', 'en-attente']);
  });
  it('liste les propositions en attente', () => {
    const c = consigneDe(OPERATIONS);
    expect(indicesEnAttente(c)).toEqual([0, 1]);
    expect(propositionsEnAttente([c, c])).toBe(4);
  });
});

describe('acceptation et refus', () => {
  it('accepte en revérifiant sur le montage du moment', () => {
    const c = consigneDe(OPERATIONS);
    const seule = accepterPropositions(analyse, base, c, [1], reglages);
    expect(seule.montage).toBe(base);
    expect(seule.consigne.propositions[1]).toMatchObject({ etat: 'invalide', probleme: 'La coupe m0 n’existe pas.' });

    const r = accepterPropositions(analyse, base, c, [0], reglages);
    expect(r.montage.coupes.map(x => x.id)).toEqual(['d1', 'l0', 'm0']);
    expect(r.consigne.propositions.map(p => p.etat)).toEqual(['acceptee', 'en-attente', 'invalide']);
    expect(c.propositions[0]!.etat).toBe('en-attente');
  });
  it('accepte tout dans l’ordre', () => {
    const c = consigneDe(OPERATIONS);
    const r = accepterPropositions(analyse, base, c, indicesEnAttente(c), reglages);
    expect(r.montage.coupes.map(x => x.id)).toEqual(['d1', 'l0']);
    expect(r.consigne.propositions.map(p => p.etat)).toEqual(['acceptee', 'acceptee', 'invalide']);
  });
  it('refuse seulement les propositions en attente', () => {
    const c = consigneDe(OPERATIONS);
    expect(refuserPropositions(c, [0, 2]).propositions.map(p => p.etat)).toEqual(['refusee', 'en-attente', 'invalide']);
  });
});

describe('forme de consignes.json', () => {
  it('accepte un fichier valide', () => {
    expect(raisonFichierConsignes({ version: 1, consignes: [consigneDe(OPERATIONS)] })).toBeNull();
    expect(raisonFichierConsignes({ version: 1, consignes: [] })).toBeNull();
  });
  it('explique ce qui ne va pas', () => {
    expect(raisonFichierConsignes([])).toBe('objet attendu');
    expect(raisonFichierConsignes({ version: 2, consignes: [] })).toBe('version 1 attendue');
    expect(raisonFichierConsignes({ version: 1 })).toBe('consignes doit être une liste');
    expect(raisonFichierConsignes({ version: 1, consignes: [{ id: 'c1' }] })).toBe('chaque consigne doit avoir un id, un texte et des propositions');
    const c = consigneDe(OPERATIONS);
    const autre = { ...c, propositions: [{ ...c.propositions[0]!, operation: { type: 'supprimer' } }] };
    expect(raisonFichierConsignes({ version: 1, consignes: [autre] })).toBe('opération inconnue dans la consigne c1');
    const etat = { ...c, propositions: [{ ...c.propositions[0]!, etat: 'peut-etre' }] };
    expect(raisonFichierConsignes({ version: 1, consignes: [etat] })).toBe('état de proposition inconnu dans la consigne c1');
  });
  it('contrôle la forme complète des consignes, propositions et opérations', () => {
    const c = consigneDe(OPERATIONS);
    const raison = (consigne: unknown) => raisonFichierConsignes({ version: 1, consignes: [consigne] });
    const { nonRealisable: _n, ...sansNonRealisable } = c;
    expect(raison(sansNonRealisable)).toBe('non réalisable invalide dans la consigne c1');
    expect(raison({ ...c, date: 3 })).toBe('date ou reformulation invalide dans la consigne c1');
    expect(raison({ ...c, ancrage: { premierMot: 1 } })).toBe('ancrage invalide dans la consigne c1');
    expect(raison({ ...c, ancrage: { premierMot: 1, dernierMot: 2 } })).toBeNull();
    const { explication: _e, ...sansExplication } = c.propositions[0]!;
    expect(raison({ ...c, propositions: [sansExplication] })).toBe('explication manquante dans la consigne c1');
    expect(raison({ ...c, propositions: [{ ...c.propositions[0]!, probleme: 4 }] })).toBe('problème invalide dans la consigne c1');
    const avecOperation = (operation: unknown) => raison({ ...c, propositions: [{ ...c.propositions[0]!, operation }] });
    expect(avecOperation({ type: 'couper', premierMot: 1 })).toBe('champ dernierMot invalide dans la consigne c1');
    expect(avecOperation({ type: 'couper', premierMot: '1', dernierMot: 2 })).toBe('champ premierMot invalide dans la consigne c1');
    expect(avecOperation({ type: 'titreVideo' })).toBe('champ titre invalide dans la consigne c1');
    expect(avecOperation({ type: 'ajouterTerme', terme: 'a', definition: 'b', mots: [1, 'x'] })).toBe('champ mots invalide dans la consigne c1');
    expect(avecOperation({ type: 'deciderLongueur', idCoupe: 'l0', accepter: 'oui' })).toBe('champ accepter invalide dans la consigne c1');
    expect(avecOperation({ type: 'modifierTerme', terme: 'SSO', statut: 'peut-etre' })).toBe('champ statut invalide dans la consigne c1');
    expect(avecOperation({ type: 'modifierTerme', terme: 'SSO', position: 'milieu' })).toBe('champ position invalide dans la consigne c1');
    expect(avecOperation({ type: 'modifierTerme', terme: 'SSO', statut: 'valide', position: 'haut', definition: 'x' })).toBeNull();
    expect(avecOperation({ type: 'modifierTerme', terme: 'SSO' })).toBeNull();
  });
});

describe('longueur des titres de chapitre', () => {
  const long = 'x'.repeat(61);
  it('refuse un titre de plus de 60 caractères', () => {
    const msg = 'Le titre dépasse 60 caractères.';
    expect(probleme({ type: 'renommerChapitre', premierMotChapitre: 3, titre: long })).toBe(msg);
    expect(probleme({ type: 'ajouterChapitre', premierMot: 5, titre: long })).toBe(msg);
  });
  it('accepte un titre de 60 caractères', () => {
    expect(probleme({ type: 'renommerChapitre', premierMotChapitre: 3, titre: 'x'.repeat(60) })).toBeNull();
    expect(probleme({ type: 'ajouterChapitre', premierMot: 5, titre: 'x'.repeat(60) })).toBeNull();
  });
});
