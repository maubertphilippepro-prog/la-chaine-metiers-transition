import { existsSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { ErreurHttp } from './http';

// Range le dossier du tournage parmi les tournages supprimés (suffixe -2, -3… si le nom y est pris) : rien n'est effacé.
export async function deplacerVersSupprimes(dossier: string, racineSupprimes: string): Promise<string> {
  await mkdir(racineSupprimes, { recursive: true });
  const base = path.basename(dossier);
  for (let n = 1; ; n++) {
    const nom = n === 1 ? base : `${base}-${n}`;
    const cible = path.join(racineSupprimes, nom);
    if (existsSync(cible)) continue;
    try {
      await rename(dossier, cible);
      return nom;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') {
        throw new ErreurHttp(409, 'Dossier du tournage ouvert dans un autre programme (explorateur, lecteur vidéo…) : fermez-le puis réessayez.');
      }
      throw e;
    }
  }
}
