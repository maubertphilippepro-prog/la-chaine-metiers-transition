import path from 'node:path';
import type { ResultatRendu } from '../../remotion/scripts/rendu';
import type { EtatRendu } from '../commun';

export type TravailRendu = (onProgression: (fichier: string, progression: number) => void) => Promise<ResultatRendu[]>;

// Un seul rendu à la fois ; l'interface interroge l'état régulièrement.
export class SuiviRendu {
  private courant: EtatRendu = { nom: null, enCours: false, fichier: null, progression: 0, resultats: [], erreur: null };
  private promesse: Promise<void> = Promise.resolve();

  etat(): EtatRendu {
    return structuredClone(this.courant);
  }

  lancer(nom: string, travail: TravailRendu): boolean {
    if (this.courant.enCours) return false;
    const etat: EtatRendu = { nom, enCours: true, fichier: null, progression: 0, resultats: [], erreur: null };
    this.courant = etat;
    let rendu: Promise<ResultatRendu[]>;
    try {
      rendu = travail((fichier, progression) => {
        etat.fichier = path.basename(fichier);
        etat.progression = progression;
      });
    } catch (e) {
      rendu = Promise.reject(e);
    }
    this.promesse = rendu
      .then(resultats => {
        etat.resultats = resultats.map(r => ({ ...r, fichier: path.basename(r.fichier) }));
      })
      .catch(e => {
        etat.erreur = e instanceof Error ? e.message : String(e);
      })
      .finally(() => {
        etat.enCours = false;
      });
    return true;
  }

  // Attend la fin du rendu en cours (tests, arrêt du serveur).
  attendre(): Promise<void> {
    return this.promesse;
  }
}
