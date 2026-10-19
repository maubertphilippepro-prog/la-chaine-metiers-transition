import { type FC, useEffect, useState } from 'react';
import type { StatutEpisode } from '../../../noyau/types';
import type { ResumeTournage } from '../../commun';
import { api } from '../api';

export const LIBELLES_STATUT: Record<StatutEpisode, string> = {
  analyse: 'Analysé',
  'en-validation': 'En validation',
  valide: 'Validé',
  rendu: 'Rendu',
  erreur: 'Erreur',
};

export const ListeTournages: FC = () => {
  const [tournages, setTournages] = useState<ResumeTournage[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    api.tournages().then(setTournages, (e: Error) => setErreur(e.message));
  }, []);

  return (
    <div className="page">
      <h1>Tournages</h1>
      {erreur && <p className="alerte">{erreur}</p>}
      {tournages?.length === 0 && <p>Aucun tournage dans donnees/tournages/.</p>}
      {tournages && tournages.length > 0 && (
        <table className="liste">
          <thead>
            <tr><th>Tournage</th><th>Statut</th><th>Message</th></tr>
          </thead>
          <tbody>
            {tournages.map(t => (
              <tr key={t.nom}>
                <td>
                  {t.analyseFaite ? <a href={`#/${encodeURIComponent(t.nom)}`}>{t.titre}</a> : t.titre}
                  <div className="discret">{t.nom}</div>
                </td>
                <td>
                  {t.statut
                    ? <span className={`statut statut-${t.statut}`}>{LIBELLES_STATUT[t.statut]}</span>
                    : <span className="discret">Non analysé</span>}
                </td>
                <td className="discret">{t.message ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};
