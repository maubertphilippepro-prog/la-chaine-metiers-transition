import {
  ajouterChapitre, ajouterTerme, basculerCoupe, changerTitre, couperPassage, deciderLongueur, deplacerLimite,
  fusionnerChapitre, modifierTerme, renommerChapitre, type ChangementTerme,
} from './edition';
import type { Analyse, Coupe, Montage, Mot, PositionEncart, Segment, StatutTerme } from './types';

// Vocabulaire fermé des consignes. Les passages sont désignés par numéros de mots (Mot.id, bornes incluses),
// un chapitre par le numéro de son premier mot, pour rester stable après une fusion ou un ajout.
export type Operation =
  | { type: 'couper'; premierMot: number; dernierMot: number }
  | { type: 'basculerCoupe'; idCoupe: string }
  | { type: 'deciderLongueur'; idCoupe: string; accepter: boolean }
  | { type: 'renommerChapitre'; premierMotChapitre: number; titre: string }
  | { type: 'ajouterChapitre'; premierMot: number; titre: string }
  | { type: 'deplacerChapitre'; premierMotChapitre: number; nouveauPremierMot: number }
  | { type: 'fusionnerChapitre'; premierMotChapitre: number }
  | { type: 'modifierTerme'; terme: string; definition?: string; statut?: StatutTerme; position?: PositionEncart }
  | { type: 'ajouterTerme'; terme: string; definition: string; mots: number[] }
  | { type: 'titreVideo'; titre: string };

export type TypeOperation = Operation['type'];
export type OperationExpliquee = Operation & { explication: string };

export type EtatProposition = 'en-attente' | 'acceptee' | 'refusee' | 'invalide';

export interface Proposition {
  operation: Operation;
  explication: string;
  etat: EtatProposition;
  // Présent quand etat = 'invalide'.
  probleme?: string;
}

export interface Ancrage {
  premierMot: number;
  dernierMot: number;
}

export interface Consigne {
  id: string;
  // ISO 8601
  date: string;
  texte: string;
  ancrage: Ancrage | null;
  reformulation: string;
  nonRealisable: string[];
  propositions: Proposition[];
}

// consignes.json, dans le dossier du tournage.
export interface FichierConsignes {
  version: 1;
  consignes: Consigne[];
}

// Réponse structurée de Claude.
export interface ReponseConsigne {
  reformulation: string;
  operations: OperationExpliquee[];
  nonRealisable: string[];
}

export interface ReglagesConsignes {
  definitionMaxCaracteres: number;
}

export type Verification = { montage: Montage } | { probleme: string };

const TITRE_VIDE = 'Le titre est vide.';
const TITRE_MAX_CARACTERES = 60;
const TITRE_TROP_LONG = `Le titre dépasse ${TITRE_MAX_CARACTERES} caractères.`;
const SANS_EFFET = 'Cette opération ne changerait rien au montage.';
const motInconnu = (id: number) => `Le mot ${id} n’existe pas dans la transcription.`;
const coupeInconnue = (id: string) => `La coupe ${id} n’existe pas.`;
const aucunChapitre = (id: number) => `Aucun chapitre ne commence au mot ${id}.`;

const motDe = (analyse: Analyse, id: number): Mot | undefined => analyse.mots.find(m => m.id === id);

export function passageEnTemps(analyse: Analyse, premierMot: number, dernierMot: number): Segment | string {
  const premier = motDe(analyse, premierMot);
  const dernier = motDe(analyse, dernierMot);
  if (!premier) return motInconnu(premierMot);
  if (!dernier) return motInconnu(dernierMot);
  if (dernierMot < premierMot) return `Le passage ${premierMot} à ${dernierMot} est à l’envers.`;
  return { debut: premier.debut, fin: dernier.fin };
}

// Premier mot qui commence dans le chapitre (comme dans le texte du studio) ; null pour un chapitre sans mot.
export function premierMotDuChapitre(analyse: Analyse, montage: Montage, index: number): number | null {
  const chapitre = montage.chapitres[index];
  if (!chapitre) return null;
  const fin = montage.chapitres[index + 1]?.debut ?? Infinity;
  return analyse.mots.find(m => m.debut >= chapitre.debut && m.debut < fin)?.id ?? null;
}

function indexChapitre(analyse: Analyse, montage: Montage, premierMot: number): number {
  return montage.chapitres.findIndex((_, i) => premierMotDuChapitre(analyse, montage, i) === premierMot);
}

// Mots dont le milieu est dans la coupe, comme dans le texte du studio ; null pour un blanc entre deux mots.
export function motsRecouverts(analyse: Analyse, coupe: Coupe): Ancrage | null {
  const mots = analyse.mots.filter(m => {
    const milieu = (m.debut + m.fin) / 2;
    return milieu >= coupe.debut && milieu <= coupe.fin;
  });
  const premier = mots[0];
  const dernier = mots[mots.length - 1];
  return premier && dernier ? { premierMot: premier.id, dernierMot: dernier.id } : null;
}

// Texte d'un passage, abrégé au-delà de `max` caractères.
export function extraitPassage(analyse: Analyse, ancrage: Ancrage, max = Infinity): string {
  const texte = analyse.mots
    .filter(m => m.id >= ancrage.premierMot && m.id <= ancrage.dernierMot)
    .map(m => m.texte)
    .join(' ');
  return texte.length > max ? `${texte.slice(0, max - 1).trimEnd()}…` : texte;
}

function problemeDefinition(definition: string, max: number): string | null {
  if (!definition.trim()) return 'La définition est vide.';
  if (definition.length > max) return `La définition dépasse ${max} caractères.`;
  return null;
}

// Montage modifié, ou la phrase qui explique pourquoi l'opération est impossible.
function appliquer(analyse: Analyse, m: Montage, op: Operation, r: ReglagesConsignes): Montage | string {
  switch (op.type) {
    case 'couper': {
      const p = passageEnTemps(analyse, op.premierMot, op.dernierMot);
      return typeof p === 'string' ? p : couperPassage(m, p.debut, p.fin);
    }
    case 'basculerCoupe': {
      const coupe = m.coupes.find(c => c.id === op.idCoupe);
      if (!coupe) return coupeInconnue(op.idCoupe);
      if (coupe.enAttente) return `La coupe ${op.idCoupe} est une longueur en attente : il faut l’accepter ou la refuser.`;
      return basculerCoupe(m, op.idCoupe);
    }
    case 'deciderLongueur': {
      const coupe = m.coupes.find(c => c.id === op.idCoupe);
      if (!coupe) return coupeInconnue(op.idCoupe);
      if (coupe.type !== 'longueur') return `La coupe ${op.idCoupe} n’est pas une longueur proposée.`;
      return deciderLongueur(m, op.idCoupe, op.accepter);
    }
    case 'renommerChapitre': {
      if (!op.titre.trim()) return TITRE_VIDE;
      if (op.titre.length > TITRE_MAX_CARACTERES) return TITRE_TROP_LONG;
      const i = indexChapitre(analyse, m, op.premierMotChapitre);
      return i < 0 ? aucunChapitre(op.premierMotChapitre) : renommerChapitre(m, i, op.titre);
    }
    case 'ajouterChapitre': {
      if (!op.titre.trim()) return TITRE_VIDE;
      if (op.titre.length > TITRE_MAX_CARACTERES) return TITRE_TROP_LONG;
      const mot = motDe(analyse, op.premierMot);
      if (!mot) return motInconnu(op.premierMot);
      if (indexChapitre(analyse, m, op.premierMot) >= 0) return `Un chapitre commence déjà au mot ${op.premierMot}.`;
      return ajouterChapitre(m, mot.debut, op.titre);
    }
    case 'deplacerChapitre': {
      const i = indexChapitre(analyse, m, op.premierMotChapitre);
      if (i < 0) return aucunChapitre(op.premierMotChapitre);
      if (i === 0) return 'Le premier chapitre ne peut pas être déplacé.';
      const mot = motDe(analyse, op.nouveauPremierMot);
      if (!mot) return motInconnu(op.nouveauPremierMot);
      const precedent = premierMotDuChapitre(analyse, m, i - 1);
      const deplace = precedent !== null && op.nouveauPremierMot > precedent ? deplacerLimite(m, i, mot.debut) : m;
      if (deplace === m) {
        return `Le chapitre ne peut pas commencer au mot ${op.nouveauPremierMot} : ce mot n’est pas entre le début du chapitre précédent et le chapitre suivant.`;
      }
      return deplace;
    }
    case 'fusionnerChapitre': {
      const i = indexChapitre(analyse, m, op.premierMotChapitre);
      if (i < 0) return aucunChapitre(op.premierMotChapitre);
      if (i === 0) return 'Le premier chapitre ne peut pas être fusionné.';
      return fusionnerChapitre(m, i);
    }
    case 'modifierTerme': {
      if (!m.termes.some(t => t.terme === op.terme)) return `Le terme « ${op.terme} » n’existe pas.`;
      const changement: ChangementTerme = {};
      if (op.definition !== undefined) {
        const p = problemeDefinition(op.definition, r.definitionMaxCaracteres);
        if (p) return p;
        changement.definition = op.definition;
      }
      if (op.statut !== undefined) changement.statut = op.statut;
      if (op.position !== undefined) changement.position = op.position;
      return modifierTerme(m, op.terme, changement);
    }
    case 'ajouterTerme': {
      if (!op.terme.trim()) return 'Le terme est vide.';
      if (m.termes.some(t => t.terme.toLowerCase() === op.terme.toLowerCase())) return `Le terme « ${op.terme} » existe déjà.`;
      const p = problemeDefinition(op.definition, r.definitionMaxCaracteres);
      if (p) return p;
      if (op.mots.length === 0) return 'Aucun mot n’indique où le terme est prononcé.';
      const occurrences: number[] = [];
      for (const id of op.mots) {
        const mot = motDe(analyse, id);
        if (!mot) return motInconnu(id);
        occurrences.push(mot.debut);
      }
      return ajouterTerme(m, op.terme, op.definition, occurrences);
    }
    case 'titreVideo':
      return op.titre.trim() ? changerTitre(m, op.titre) : TITRE_VIDE;
  }
}

// Vérifie une opération sur le montage donné : montage modifié, ou problème à afficher.
export function verifierOperation(analyse: Analyse, montage: Montage, operation: Operation, reglages: ReglagesConsignes): Verification {
  const resultat = appliquer(analyse, montage, operation, reglages);
  if (typeof resultat === 'string') return { probleme: resultat };
  if (JSON.stringify(resultat) === JSON.stringify(montage)) return { probleme: SANS_EFFET };
  return { montage: resultat };
}

// À la réception : chaque opération est vérifiée sur le montage laissé par les précédentes valides.
export function proposer(
  analyse: Analyse, montage: Montage, operations: OperationExpliquee[], reglages: ReglagesConsignes,
): Proposition[] {
  let courant = montage;
  return operations.map(({ explication, ...reste }): Proposition => {
    const operation = reste as Operation;
    const v = verifierOperation(analyse, courant, operation, reglages);
    if ('probleme' in v) return { operation, explication, etat: 'invalide', probleme: v.probleme };
    courant = v.montage;
    return { operation, explication, etat: 'en-attente' };
  });
}

// Applique les propositions désignées, dans l'ordre, en revérifiant chacune sur le montage du moment.
export function accepterPropositions(
  analyse: Analyse, montage: Montage, consigne: Consigne, indices: number[], reglages: ReglagesConsignes,
): { montage: Montage; consigne: Consigne } {
  let courant = montage;
  const propositions = [...consigne.propositions];
  for (const i of indices) {
    const p = propositions[i];
    if (!p || p.etat !== 'en-attente') continue;
    const v = verifierOperation(analyse, courant, p.operation, reglages);
    if ('probleme' in v) {
      propositions[i] = { ...p, etat: 'invalide', probleme: v.probleme };
    } else {
      courant = v.montage;
      propositions[i] = { ...p, etat: 'acceptee' };
    }
  }
  return { montage: courant, consigne: { ...consigne, propositions } };
}

export function refuserPropositions(consigne: Consigne, indices: number[]): Consigne {
  return {
    ...consigne,
    propositions: consigne.propositions.map((p, i): Proposition => (indices.includes(i) && p.etat === 'en-attente' ? { ...p, etat: 'refusee' } : p)),
  };
}

export function indicesEnAttente(consigne: Consigne): number[] {
  return consigne.propositions.flatMap((p, i) => (p.etat === 'en-attente' ? [i] : []));
}

export function propositionsEnAttente(consignes: Consigne[]): number {
  return consignes.reduce((total, c) => total + indicesEnAttente(c).length, 0);
}

type GenreChamp = 'entier' | 'texte' | 'booleen' | 'entiers' | readonly string[];
interface ChampOperation { genre: GenreChamp; facultatif?: true }

const STATUTS_TERME: readonly string[] = ['a-valider', 'valide', 'ecarte'];
const POSITIONS_ENCART: readonly string[] = ['bas', 'haut'];

// Champs de chaque opération ; la table reste exhaustive sur TypeOperation à la compilation.
const CHAMPS_OPERATION: Record<TypeOperation, Record<string, ChampOperation>> = {
  couper: { premierMot: { genre: 'entier' }, dernierMot: { genre: 'entier' } },
  basculerCoupe: { idCoupe: { genre: 'texte' } },
  deciderLongueur: { idCoupe: { genre: 'texte' }, accepter: { genre: 'booleen' } },
  renommerChapitre: { premierMotChapitre: { genre: 'entier' }, titre: { genre: 'texte' } },
  ajouterChapitre: { premierMot: { genre: 'entier' }, titre: { genre: 'texte' } },
  deplacerChapitre: { premierMotChapitre: { genre: 'entier' }, nouveauPremierMot: { genre: 'entier' } },
  fusionnerChapitre: { premierMotChapitre: { genre: 'entier' } },
  modifierTerme: {
    terme: { genre: 'texte' },
    definition: { genre: 'texte', facultatif: true },
    statut: { genre: STATUTS_TERME, facultatif: true },
    position: { genre: POSITIONS_ENCART, facultatif: true },
  },
  ajouterTerme: { terme: { genre: 'texte' }, definition: { genre: 'texte' }, mots: { genre: 'entiers' } },
  titreVideo: { titre: { genre: 'texte' } },
};
const ETATS: EtatProposition[] = ['en-attente', 'acceptee', 'refusee', 'invalide'];

const estEntier = (v: unknown): boolean => typeof v === 'number' && Number.isInteger(v);

function valeurConforme(v: unknown, genre: GenreChamp): boolean {
  if (typeof genre !== 'string') return typeof v === 'string' && genre.includes(v);
  switch (genre) {
    case 'entier': return estEntier(v);
    case 'texte': return typeof v === 'string';
    case 'booleen': return typeof v === 'boolean';
    case 'entiers': return Array.isArray(v) && v.every(estEntier);
  }
}

function estObjet(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Contrôle de forme de consignes.json (lecture et enregistrement depuis le studio).
export function raisonFichierConsignes(v: unknown): string | null {
  if (!estObjet(v)) return 'objet attendu';
  if (v.version !== 1) return 'version 1 attendue';
  if (!Array.isArray(v.consignes)) return 'consignes doit être une liste';
  for (const c of v.consignes) {
    if (!estObjet(c) || typeof c.id !== 'string' || typeof c.texte !== 'string' || !Array.isArray(c.propositions)) {
      return 'chaque consigne doit avoir un id, un texte et des propositions';
    }
    if (typeof c.date !== 'string' || typeof c.reformulation !== 'string') return `date ou reformulation invalide dans la consigne ${c.id}`;
    if (!Array.isArray(c.nonRealisable) || !c.nonRealisable.every(n => typeof n === 'string')) {
      return `non réalisable invalide dans la consigne ${c.id}`;
    }
    if (c.ancrage !== null && !(estObjet(c.ancrage) && estEntier(c.ancrage.premierMot) && estEntier(c.ancrage.dernierMot))) {
      return `ancrage invalide dans la consigne ${c.id}`;
    }
    for (const p of c.propositions) {
      const operation = estObjet(p) && estObjet(p.operation) ? p.operation : undefined;
      const type = operation?.type;
      if (!operation || typeof type !== 'string' || !Object.hasOwn(CHAMPS_OPERATION, type)) return `opération inconnue dans la consigne ${c.id}`;
      const proposition = p as Record<string, unknown>;
      if (!ETATS.includes(proposition.etat as EtatProposition)) return `état de proposition inconnu dans la consigne ${c.id}`;
      if (typeof proposition.explication !== 'string') return `explication manquante dans la consigne ${c.id}`;
      if (proposition.probleme !== undefined && typeof proposition.probleme !== 'string') return `problème invalide dans la consigne ${c.id}`;
      for (const [nom, champ] of Object.entries(CHAMPS_OPERATION[type as TypeOperation])) {
        const v = operation[nom];
        if (v === undefined && champ.facultatif) continue;
        if (!valeurConforme(v, champ.genre)) return `champ ${nom} invalide dans la consigne ${c.id}`;
      }
    }
  }
  return null;
}
