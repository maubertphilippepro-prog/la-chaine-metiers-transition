import { type FC, useMemo, useState } from 'react';
import { decisionsEpisodes, decisionsVideoComplete } from '../../../noyau/decisions';
import { passageEnTemps, tracerZoneProposition, type Ancrage, type Operation } from '../../../noyau/consignes';
import { ajouterElement, modifierElement, prochainIdElement, type NouvelElement } from '../../../noyau/edition';
import { problemeDe } from '../../../noyau/elements';
import type { ElementEcran, Montage, NatureElement, Zone } from '../../../noyau/types';
import { useEcoute } from '../ecoute';
import { imageEpisode, imageVideoComplete, positionDansParties } from '../logique/apercu';
import { useConsignes } from '../useConsignes';
import { type EtatEnregistrement, useMontage } from '../useMontage';
import { Apercu, type DemandeLecture, type Vue } from './Apercu';
import { BandeauSuggestions } from './BandeauSuggestions';
import { PanneauConsignes } from './PanneauConsignes';
import { PanneauElements } from './PanneauElements';
import { PanneauLongueurs } from './PanneauLongueurs';
import { PanneauRendu } from './PanneauRendu';
import { PanneauTermes } from './PanneauTermes';
import { Texte, type SaisieTexte } from './Texte';
import type { Dessin } from './TraceurZone';
import { Attente } from './Attente';

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
  const [selection, setSelection] = useState<Ancrage | null>(null);
  const [dessin, setDessin] = useState<Dessin | null>(null);
  // Pendant le retracé d'une zone, l'aperçu montre l'image sans cet élément.
  const montageApercu = useMemo(() => {
    const cible = dessin?.cible;
    return montage && cible?.genre === 'element'
      ? { ...montage, elements: montage.elements.filter(e => e.id !== cible.id) }
      : montage;
  }, [montage, dessin]);
  const decisions = useMemo(
    () => (detail && montageApercu
      ? {
        episodes: decisionsEpisodes(detail.analyse, montageApercu, detail.reglages, detail.sourceUrl),
        complete: decisionsVideoComplete(detail.analyse, montageApercu, detail.reglages, detail.sourceUrl),
      }
      : null),
    [detail, montageApercu],
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

  const lireDansApercu = (t: number, pause = false) => {
    const fps = detail.analyse.fps;
    const jeton = Date.now();
    if (vue === 'complete') {
      const p = positionDansParties(decisions.complete.parties, t, fps);
      if (p) setDemande({ image: imageVideoComplete(decisions.complete, p), jeton, pause });
      else if (pause) setDemande({ jeton, pause });
      return;
    }
    const p = positionDansParties(decisions.episodes.map(e => e.partie), t, fps);
    const episode = p ? decisions.episodes[p.partie] : undefined;
    if (p && episode) {
      setVue(p.partie);
      setDemande({ image: imageEpisode(episode, p), jeton, pause });
    } else if (pause) {
      setDemande({ jeton, pause });
    }
  };

  // Une création ou une retouche d'élément n'est enregistrée que si l'élément touché respecte les règles.
  const retoucher = (id: string, f: (m: Montage) => Montage): string | null => {
    const suivant = f(montage);
    if (suivant === montage) return null;
    const probleme = problemeDe(detail.analyse, suivant, id, detail.reglages);
    if (probleme) return probleme;
    modifier(() => suivant);
    return null;
  };
  const creer = (e: NouvelElement) => retoucher(prochainIdElement(montage), m => ajouterElement(m, e));

  const tracer = (d: Dessin) => {
    setDessin(d);
    lireDansApercu(d.debut, true);
  };

  const creerElement = (nature: NatureElement, a: Ancrage, saisie?: SaisieTexte): string | null => {
    const p = passageEnTemps(detail.analyse, a.premierMot, a.dernierMot);
    if (typeof p === 'string') return p;
    const commun = { debut: p.debut, fin: p.fin, statut: 'valide' as const };
    switch (nature) {
      case 'camera':
        return creer({ ...commun, nature });
      case 'texte':
        return saisie ? creer({ ...commun, nature, ...saisie }) : null;
      case 'zoom':
      case 'miseEnAvant':
        tracer({ nature, debut: p.debut, cible: { genre: 'nouveau', fin: p.fin } });
        return null;
    }
  };

  const tracerElement = (e: ElementEcran) => {
    if (e.nature === 'zoom' || e.nature === 'miseEnAvant') tracer({ nature: e.nature, debut: e.debut, cible: { genre: 'element', id: e.id } });
  };

  const tracerProposition = (idConsigne: string, indice: number, op: Operation) => {
    if (op.type !== 'ajouterElement' || (op.nature !== 'zoom' && op.nature !== 'miseEnAvant')) return;
    const p = passageEnTemps(detail.analyse, op.premierMot, op.dernierMot);
    if (typeof p !== 'string') tracer({ nature: op.nature, debut: p.debut, cible: { genre: 'proposition', idConsigne, indice } });
  };

  const fichierConsignes = consignes.fichier;
  const validerDessin = (d: Dessin, zone: Zone): string | null => {
    const cible = d.cible;
    switch (cible.genre) {
      case 'nouveau':
        return creer({ debut: d.debut, fin: cible.fin, statut: 'valide', nature: d.nature, zone });
      case 'element':
        return retoucher(cible.id, m => modifierElement(m, cible.id, { zone }));
      case 'proposition':
        consignes.enregistrer({
          ...fichierConsignes,
          consignes: fichierConsignes.consignes.map(c => (c.id === cible.idConsigne ? tracerZoneProposition(c, cible.indice, zone) : c)),
        });
        return null;
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
        {enregistrement === 'en-attente'
          ? <Attente libelle={LIBELLES_ENREGISTREMENT[enregistrement]} />
          : <span className="discret">{LIBELLES_ENREGISTREMENT[enregistrement]}</span>}
        {detail.statut === 'rendu' && <a href={`#/${encodeURIComponent(nom)}/publication`}>Publication →</a>}
      </header>
      <main className="texte">
        <Texte analyse={detail.analyse} montage={montage} modifier={modifier} ecouter={ecouter} lireDansApercu={lireDansApercu} consignerPassage={setAncrage}
          texteMax={detail.reglages.elements.texteMaxCaracteres}
          surSelection={setSelection}
          creerElement={creerElement}
        />
      </main>
      <aside className="cote">
        {detail.analyse.erreurSuggestions && (
          <BandeauSuggestions nom={nom} erreur={detail.analyse.erreurSuggestions} onRelance={remplacerDetail} />
        )}
        <Apercu episodes={decisions.episodes} complete={decisions.complete} vue={vue} onVue={setVue} demande={demande}
          dessin={dessin}
          largeurMin={detail.reglages.elements.zoomLargeurMin}
          validerDessin={zone => (dessin ? validerDessin(dessin, zone) : null)}
          onFinDessin={() => setDessin(null)}
        />
        <PanneauElements
          analyse={detail.analyse}
          montage={montage}
          reglages={detail.reglages}
          selection={selection}
          retoucher={retoucher}
          tracer={tracerElement}
          ecouter={ecouter}
          lireDansApercu={lireDansApercu}
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
          tracerProposition={tracerProposition}
        />
        <PanneauRendu
          nom={nom}
          analyse={detail.analyse}
          montage={montage}
          reglages={detail.reglages}
          consignes={consignes.fichier.consignes}
          enregistrement={enregistrement}
        />
      </aside>
      {audio}
    </div>
  );
};
