import { type FC, useMemo, useState } from 'react';
import { decisionsEpisodes, decisionsVideoComplete } from '../../../noyau/decisions';
import type { Ancrage } from '../../../noyau/consignes';
import { useEcoute } from '../ecoute';
import { imageEpisode, imageVideoComplete, positionDansParties } from '../logique/apercu';
import { useConsignes } from '../useConsignes';
import { type EtatEnregistrement, useMontage } from '../useMontage';
import { Apercu, type DemandeLecture, type Vue } from './Apercu';
import { BandeauSuggestions } from './BandeauSuggestions';
import { PanneauConsignes } from './PanneauConsignes';
import { PanneauLongueurs } from './PanneauLongueurs';
import { PanneauRendu } from './PanneauRendu';
import { PanneauTermes } from './PanneauTermes';
import { Texte } from './Texte';

const LIBELLES_ENREGISTREMENT: Record<EtatEnregistrement, string> = {
  'a-jour': 'Enregistré',
  'en-attente': 'Enregistrement…',
  erreur: 'Échec de l’enregistrement : la prochaine modification réessaiera',
};

export const EcranMontage: FC<{ nom: string }> = ({ nom }) => {
  const { detail, montage, erreur, enregistrement, modifier, remplacerDetail } = useMontage(nom);
  const { ecouter, audio } = useEcoute(detail?.sourceUrl ?? null);
  const [vue, setVue] = useState<Vue>('complete');
  const [demande, setDemande] = useState<DemandeLecture | null>(null);
  const consignes = useConsignes(nom, detail?.consignes ?? null);
  const [ancrage, setAncrage] = useState<Ancrage | null>(null);
  const decisions = useMemo(
    () => (detail && montage
      ? {
        episodes: decisionsEpisodes(detail.analyse, montage, detail.reglages, detail.sourceUrl),
        complete: decisionsVideoComplete(detail.analyse, montage, detail.reglages, detail.sourceUrl),
      }
      : null),
    [detail, montage],
  );

  if (erreur) {
    return (
      <div className="page">
        <a href="#/">← Tournages</a>
        <p className="alerte">{erreur}</p>
      </div>
    );
  }
  if (!detail || !montage || !decisions || !consignes.fichier) return <div className="page">Chargement…</div>;

  const lireDansApercu = (t: number) => {
    const fps = detail.analyse.fps;
    if (vue === 'complete') {
      const p = positionDansParties(decisions.complete.parties, t, fps);
      if (p) setDemande({ image: imageVideoComplete(decisions.complete, p), jeton: Date.now() });
      return;
    }
    const p = positionDansParties(decisions.episodes.map(e => e.partie), t, fps);
    const episode = p ? decisions.episodes[p.partie] : undefined;
    if (p && episode) {
      setVue(p.partie);
      setDemande({ image: imageEpisode(episode, p), jeton: Date.now() });
    }
  };

  return (
    <div className="montage">
      <header className="entete">
        <a href="#/">← Tournages</a>
        <input
          value={montage.titre}
          aria-label="Titre de la vidéo complète"
          onChange={e => { const titre = e.target.value; modifier(m => ({ ...m, titre })); }}
        />
        <span className="discret">{LIBELLES_ENREGISTREMENT[enregistrement]}</span>
      </header>
      <main className="texte">
        <Texte analyse={detail.analyse} montage={montage} modifier={modifier} ecouter={ecouter} lireDansApercu={lireDansApercu} consignerPassage={setAncrage} />
      </main>
      <aside className="cote">
        {detail.analyse.erreurSuggestions && (
          <BandeauSuggestions nom={nom} erreur={detail.analyse.erreurSuggestions} onRelance={remplacerDetail} />
        )}
        <Apercu episodes={decisions.episodes} complete={decisions.complete} vue={vue} onVue={setVue} demande={demande} />
        <PanneauConsignes
          nom={nom}
          analyse={detail.analyse}
          montage={montage}
          reglages={detail.reglages}
          enregistrement={enregistrement}
          fichier={consignes.fichier}
          erreurEnregistrement={consignes.erreur}
          ajouter={consignes.ajouter}
          enregistrer={consignes.enregistrer}
          ancrage={ancrage}
          onAncrage={setAncrage}
          modifier={modifier}
          ecouter={ecouter}
          lireDansApercu={lireDansApercu}
        />
        <PanneauRendu
          nom={nom}
          analyse={detail.analyse}
          montage={montage}
          reglages={detail.reglages}
          consignes={consignes.fichier.consignes}
          enregistrement={enregistrement}
        />
        <PanneauLongueurs
          coupes={montage.coupes}
          suggestions={detail.analyse.suggestions?.longueurs ?? []}
          modifier={modifier}
          ecouter={ecouter}
          lireDansApercu={lireDansApercu}
        />
        <PanneauTermes
          termes={montage.termes}
          definitionMax={detail.reglages.definitionMaxCaracteres}
          modifier={modifier}
          ecouter={ecouter}
          lireDansApercu={lireDansApercu}
        />
      </aside>
      {audio}
    </div>
  );
};
