import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { raisonFichierConsignes, type Ancrage, type FichierConsignes, type ReponseConsigne } from '../../noyau/consignes';
import type { Analyse, Montage } from '../../noyau/types';

// Ce qu'il faut à Claude pour interpréter une consigne.
export interface DemandeInterpretation {
  analyse: Analyse;
  montage: Montage;
  texte: string;
  ancrage: Ancrage | null;
  definitionMax: number;
  texteMax: number;
  modele: string;
}

export type InterpreterConsigne = (d: DemandeInterpretation) => Promise<ReponseConsigne>;

// Échec de l'appel à Claude, avec le statut HTTP renvoyé au studio (503 : réessayer plus tard).
export class ErreurInterpretation extends Error {
  constructor(readonly statut: 500 | 503, message: string) {
    super(message);
  }
}

// Absent : aucune consigne. Illisible ou invalide : erreur, et le fichier n'est pas touché.
export async function lireConsignes(dossier: string): Promise<FichierConsignes> {
  const chemin = path.join(dossier, 'consignes.json');
  if (!existsSync(chemin)) return { version: 1, consignes: [] };
  const libelle = `${path.basename(dossier)}/consignes.json`;
  let valeur: unknown;
  try {
    valeur = JSON.parse(await readFile(chemin, 'utf-8'));
  } catch (e) {
    throw new Error(`${libelle} illisible : ${e instanceof Error ? e.message : String(e)}`);
  }
  const probleme = raisonFichierConsignes(valeur);
  if (probleme) throw new Error(`${libelle} invalide : ${probleme}`);
  return valeur as FichierConsignes;
}
