import { type FC, useCallback, useEffect, useState } from 'react';
import type { StatutEpisode } from '../../../noyau/types';
import type { ResumeTournage } from '../../commun';
import { api } from '../api';
import { etatTournage, LIBELLES_ETAPE, titreParDefaut } from '../logique/nouveau-tournage';
import { Attente } from './Attente';
import { NouveauTournage } from './NouveauTournage';

export const LIBELLES_STATUT: Record<StatutEpisode, string> = {
  analyse: 'Analysé',
  'en-validation': 'En validation',
  valide: 'Validé',
  rendu: 'Rendu',
  erreur: 'Erreur',
};

const RAFRAICHISSEMENT_MS = 3000;

export const ListeTournages: FC = () => {
  const [tournages, setTournages] = useState<ResumeTournage[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState(false);
  // Titre saisi pour « Analyser », par tournage.
  const [titres, setTitres] = useState<Record<string, string>>({});
  const [lancement, setLancement] = useState(false);

  const charger = useCallback(() => {
    api.tournages().then(setTournages, (e: Error) => setErreur(e.message));
  }, []);
  useEffect(charger, [charger]);

  const analyseEnCours = tournages?.some(t => t.analyseEnCours) ?? false;
  useEffect(() => {
    if (!analyseEnCours) return;
    const minuterie = setInterval(charger, RAFRAICHISSEMENT_MS);
    return () => clearInterval(minuterie);
  }, [analyseEnCours, charger]);

  async function analyser(nom: string, titre: string) {
    setErreur(null);
    setLancement(true);
    try {
      await api.analyser(nom, titre);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setLancement(false);
      charger();
    }
  }

  const bloque = analyseEnCours || lancement;

  return (
    <div className="page">
      <h1>Tournages</h1>
      <div className="actions">
        <button className="principal" onClick={() => setNouveau(true)} disabled={nouveau}>Nouveau tournage</button>
      </div>
      {nouveau && <NouveauTournage onFermer={() => setNouveau(false)} onChangement={charger} />}
      {erreur && <p className="alerte">{erreur}</p>}
      {tournages?.length === 0 && <p>Aucun tournage dans donnees/tournages/.</p>}
      {tournages && tournages.length > 0 && (
        <table className="liste">
          <thead>
            <tr><th>Tournage</th><th>Statut</th><th>Message</th></tr>
          </thead>
          <tbody>
            {tournages.map(t => {
              const etat = etatTournage(t);
              const titre = titres[t.nom] ?? titreParDefaut(t);
              return (
                <tr key={t.nom}>
                  <td>
                    {t.analyseFaite ? <a href={`#/${encodeURIComponent(t.nom)}`}>{t.titre}</a> : t.titre}
                    <div className="discret">{t.nom}</div>
                  </td>
                  <td>
                    {etat === 'en-cours' && <Attente libelle={LIBELLES_ETAPE[t.etapeAnalyse]} />}
                    {(etat === 'analyse' || etat === 'erreur') && t.statut && (
                      <span className={`statut statut-${t.statut}`}>{LIBELLES_STATUT[t.statut]}</span>
                    )}
                    {etat === 'analyse' && !t.statut && <span className="discret">Non analysé</span>}
                    {etat === 'a-analyser' && <span className="discret">Non analysé</span>}
                    {etat === 'video-manquante' && <span className="discret">Vidéo manquante</span>}
                  </td>
                  <td className="discret">
                    {etat !== 'en-cours' && (t.message ?? '')}
                    {etat === 'erreur' && (
                      <div className="actions">
                        <button onClick={() => void analyser(t.nom, titreParDefaut(t))} disabled={bloque}>Relancer l’analyse</button>
                      </div>
                    )}
                    {etat === 'a-analyser' && (
                      <div className="actions">
                        <input
                          value={titre}
                          onChange={e => setTitres({ ...titres, [t.nom]: e.target.value })}
                          aria-label={`Titre de ${t.nom}`}
                          size={30}
                        />
                        <button onClick={() => void analyser(t.nom, titre.trim())} disabled={bloque || !titre.trim()}>Analyser</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};
