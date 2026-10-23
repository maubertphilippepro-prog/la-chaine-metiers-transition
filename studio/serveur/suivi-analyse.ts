import { message } from './http';

export interface EtatAnalyse {
  nom: string | null;
  titre: string | null;
  debut: string | null;
  enCours: boolean;
  erreur: string | null;
}

// Une seule analyse à la fois ; la liste des tournages en montre l'avancement.
export class SuiviAnalyse {
  private courant: EtatAnalyse = { nom: null, titre: null, debut: null, enCours: false, erreur: null };
  private promesse: Promise<void> = Promise.resolve();

  etat(): EtatAnalyse {
    return { ...this.courant };
  }

  lancer(nom: string, titre: string, travail: () => Promise<void>): boolean {
    if (this.courant.enCours) return false;
    const etat: EtatAnalyse = { nom, titre, debut: new Date().toISOString(), enCours: true, erreur: null };
    this.courant = etat;
    let analyse: Promise<void>;
    try {
      analyse = travail();
    } catch (e) {
      analyse = Promise.reject(e);
    }
    this.promesse = analyse
      .catch(e => {
        etat.erreur = message(e);
      })
      .finally(() => {
        etat.enCours = false;
      });
    return true;
  }

  // Attend la fin de l'analyse en cours (tests).
  attendre(): Promise<void> {
    return this.promesse;
  }
}
