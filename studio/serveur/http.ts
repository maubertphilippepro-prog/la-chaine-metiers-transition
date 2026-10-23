import { randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

export class ErreurHttp extends Error {
  constructor(readonly statut: number, message: string, readonly problemes?: string[]) {
    super(message);
  }
}

const TAILLE_MAX = 50_000_000;

export const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function repondre(res: ServerResponse, statut: number, corps: unknown): void {
  res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(corps));
}

export function repondreErreur(res: ServerResponse, e: unknown): void {
  if (e instanceof ErreurHttp) repondre(res, e.statut, { erreur: e.message, ...(e.problemes ? { problemes: e.problemes } : {}) });
  else repondre(res, 500, { erreur: message(e) });
}

// Corps brut de la requête (image déposée), limité comme un corps JSON.
export async function lireOctets(req: IncomingMessage): Promise<Buffer> {
  const morceaux: Buffer[] = [];
  let taille = 0;
  for await (const morceau of req as AsyncIterable<Buffer>) {
    taille += morceau.length;
    if (taille > TAILLE_MAX) throw new ErreurHttp(413, 'Requête trop volumineuse.');
    morceaux.push(morceau);
  }
  return Buffer.concat(morceaux);
}

export async function lireCorps(req: IncomingMessage): Promise<unknown> {
  const octets = await lireOctets(req);
  try {
    return JSON.parse(octets.toString('utf-8'));
  } catch {
    throw new ErreurHttp(400, 'JSON invalide.');
  }
}

export async function ecrireJson(chemin: string, valeur: unknown): Promise<void> {
  const temporaire = `${chemin}.${randomUUID()}.tmp`;
  await writeFile(temporaire, JSON.stringify(valeur, null, 2), 'utf-8');
  await rename(temporaire, chemin);
}

// Dossier du tournage nommé dans l'URL ; 404 s'il n'existe pas ou sortirait de la racine.
export function dossierTournage(racine: string, nomEncode: string): string {
  let nom: string;
  try {
    nom = decodeURIComponent(nomEncode);
  } catch {
    throw new ErreurHttp(404, 'Tournage introuvable.');
  }
  const dossier = path.join(racine, nom);
  if (nom.startsWith('.') || /[\\/]/.test(nom) || !statSync(dossier, { throwIfNoEntry: false })?.isDirectory()) {
    throw new ErreurHttp(404, `Tournage introuvable : ${nom}`);
  }
  return dossier;
}
