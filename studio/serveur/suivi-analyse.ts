import { message } from './http';

export type NatureTravail = 'analyse' | 'rush';

export interface EtatAnalyse {
  nom: string | null;
  titre: string | null;
  debut: string | null;
  nature: NatureTravail | null;
  enCours: boolean;
  erreur: string | null;
  avertissement: string | null;
}

// Un seul travail lourd à la fois (analyse ou insertion d'un rush) ; la liste des tournages en montre l'avancement.
export class SuiviAnalyse {
  private courant: EtatAnalyse = { nom: null, titre: null, debut: null, nature: null, enCours: false, erreur: null, avertissement: null };
  private promesse: Promise<void> = Promise.resolve();

  etat(): EtatAnalyse {
    return { ...this.courant };
  }

  // Le travail peut rendre un avertissement (succès incomplet).
  lancer(nom: string, titre: string, travail: () => Promise<string | null | void>, nature: NatureTravail = 'analyse'): boolean {
    if (this.courant.enCours) return false;
    const etat: EtatAnalyse = { nom, titre, debut: new Date().toISOString(), nature, enCours: true, erreur: null, avertissement: null };
    this.courant = etat;
    let analyse: Promise<string | null | void>;
    try {
      analyse = travail();
    } catch (e) {
      analyse = Promise.reject(e);
    }
    this.promesse = analyse
      .then(avertissement => {
        etat.avertissement = avertissement ?? null;
      })
      .catch(e => {
        etat.erreur = message(e);
      })
      .finally(() => {
        etat.enCours = false;
      });
    return true;
  }

  // Attend la fin du travail en cours (tests).
  attendre(): Promise<void> {
    return this.promesse;
  }
}
