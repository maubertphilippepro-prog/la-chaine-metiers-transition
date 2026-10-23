import { type FC, useRef, useState } from 'react';
import type { StatutEpisode } from '../../../noyau/types';
import { EXTENSIONS_VIDEO, type ResumeTournage } from '../../commun';
import { api } from '../api';
import { etatTournage, LIBELLES_ETAPE, peutRemplacerVideo, peutSupprimer, raisonFichierVideo, titreParDefaut } from '../logique/nouveau-tournage';
import { Attente } from './Attente';

export const LIBELLES_STATUT: Record<StatutEpisode, string> = {
  analyse: 'Analysé',
  'en-validation': 'En validation',
  valide: 'Validé',
  rendu: 'Rendu',
  erreur: 'Erreur',
};

interface Props {
  t: ResumeTournage;
  // Une analyse tourne ou se lance : les actions qui en lanceraient une autre attendent.
  bloque: boolean;
  onAnalyser: (nom: string, titre: string) => Promise<void>;
  // Recharge la liste après une suppression ou un remplacement.
  onChangement: () => void;
}

export const LigneTournage: FC<Props> = ({ t, bloque, onAnalyser, onChangement }) => {
  const [titre, setTitre] = useState(() => titreParDefaut(t));
  const [confirmation, setConfirmation] = useState(false);
  const [progression, setProgression] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const choix = useRef<HTMLInputElement>(null);
  const enCours = useRef(false);
  const etat = etatTournage(t);
  const occupe = progression !== null;

  async function supprimer() {
    if (enCours.current) return;
    enCours.current = true;
    setErreur(null);
    try {
      await api.supprimerTournage(t.nom);
      onChangement();
    } catch (e) {
      setErreur((e as Error).message);
      setConfirmation(false);
    } finally {
      enCours.current = false;
    }
  }

  async function remplacer(fichiers: File[]) {
    const f = fichiers[0];
    if (!f || enCours.current || occupe || bloque || !peutRemplacerVideo(t)) return;
    const raison = raisonFichierVideo(f.name);
    if (raison) {
      setErreur(raison);
      return;
    }
    enCours.current = true;
    setErreur(null);
    setProgression(0);
    try {
      await api.retirerVideo(t.nom);
      await api.deposerVideo(t.nom, f, setProgression);
      setProgression(null);
      await onAnalyser(t.nom, titreParDefaut(t));
    } catch (e) {
      setErreur((e as Error).message);
      setProgression(null);
      onChangement();
    } finally {
      enCours.current = false;
    }
  }

  return (
    <tr
      onDragOver={e => { if (peutRemplacerVideo(t)) e.preventDefault(); }}
      onDrop={e => { e.preventDefault(); void remplacer([...e.dataTransfer.files]); }}
    >
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
        {progression !== null && (
          <p><progress value={progression} max={1} /> Envoi de la vidéo : {Math.round(progression * 100)} %</p>
        )}
        {erreur && <p className="alerte">{erreur}</p>}
        <div className="actions">
          {etat === 'erreur' && (
            <>
              <button onClick={() => void onAnalyser(t.nom, titreParDefaut(t))} disabled={bloque || occupe}>Relancer l’analyse</button>
              <button onClick={() => choix.current?.click()} disabled={bloque || occupe}>Remplacer la vidéo</button>
              <input
                ref={choix}
                type="file"
                accept={EXTENSIONS_VIDEO.join(',')}
                hidden
                onChange={e => { void remplacer([...(e.target.files ?? [])]); e.target.value = ''; }}
              />
            </>
          )}
          {etat === 'a-analyser' && (
            <>
              <input value={titre} onChange={e => setTitre(e.target.value)} aria-label={`Titre de ${t.nom}`} size={30} />
              <button onClick={() => void onAnalyser(t.nom, titre.trim())} disabled={bloque || !titre.trim()}>Analyser</button>
            </>
          )}
          {!confirmation && (
            <button onClick={() => setConfirmation(true)} disabled={!peutSupprimer(t) || occupe}>Supprimer</button>
          )}
          {confirmation && (
            <>
              <span>Supprimer « {t.titre} » ?</span>
              <button className="principal" onClick={() => void supprimer()} disabled={occupe || !peutSupprimer(t)}>Oui, supprimer</button>
              <button onClick={() => setConfirmation(false)}>Annuler</button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
};
