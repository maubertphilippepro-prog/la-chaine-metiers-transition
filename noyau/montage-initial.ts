import type { Analyse, Chapitre, Coupe, ElementEcran, Montage, Terme } from './types';

function coupesLongueur(analyse: Analyse): Coupe[] {
  return (analyse.suggestions?.longueurs ?? []).map(l => ({
    id: l.id, type: 'longueur' as const, debut: l.debut, fin: l.fin, active: false, enAttente: true,
  }));
}

function chapitresSuggeres(analyse: Analyse, titre: string): Chapitre[] {
  const s = analyse.suggestions;
  return s && s.chapitres.length > 0
    ? [...s.chapitres].sort((a, b) => a.debut - b.debut).map((c, i) => ({ titre: c.titre, debut: i === 0 ? 0 : c.debut }))
    : [{ titre, debut: 0 }];
}

function termesSuggeres(analyse: Analyse): Terme[] {
  return (analyse.suggestions?.termes ?? []).map(t => ({
    terme: t.terme,
    definition: t.definition,
    occurrences: [...t.occurrences],
    statut: t.origine === 'glossaire' ? 'valide' : 'a-valider',
    position: 'bas',
  }));
}

// Chaque suggestion devient un élément à valider : texte en haut à gauche, zone à tracer.
function elementsSuggeres(analyse: Analyse): ElementEcran[] {
  return (analyse.suggestions?.elements ?? []).map((s): ElementEcran => {
    const commun = { id: s.id, debut: s.debut, fin: s.fin, statut: 'a-valider' as const };
    return s.nature === 'texte'
      ? { ...commun, nature: 'texte', texte: s.texte ?? '', position: 'haut-gauche' }
      : { ...commun, nature: s.nature, zone: null };
  });
}

export function montageInitial(analyse: Analyse, titre: string): Montage {
  const coupes: Coupe[] = [
    ...analyse.detections.map(d => ({ id: d.id, type: d.type, debut: d.debut, fin: d.fin, active: !d.paroles })),
    ...coupesLongueur(analyse),
  ];
  return {
    version: 1,
    titre,
    coupes,
    chapitres: chapitresSuggeres(analyse, titre),
    termes: termesSuggeres(analyse),
    elements: elementsSuggeres(analyse),
  };
}

// Après une relance des suggestions : ajoute ce qui manque sans toucher aux décisions déjà prises.
// Les chapitres proposés ne remplacent qu'un montage resté à un seul chapitre.
export function integrerSuggestions(montage: Montage, analyse: Analyse): Montage {
  const ids = new Set(montage.coupes.map(c => c.id));
  const connus = new Set(montage.termes.map(t => t.terme.toLowerCase()));
  const seul = montage.chapitres.length === 1 ? montage.chapitres[0] : undefined;
  const idsElements = new Set(montage.elements.map(e => e.id));
  return {
    ...montage,
    coupes: [...montage.coupes, ...coupesLongueur(analyse).filter(c => !ids.has(c.id))],
    chapitres: seul ? chapitresSuggeres(analyse, seul.titre) : montage.chapitres,
    termes: [...montage.termes, ...termesSuggeres(analyse).filter(t => !connus.has(t.terme.toLowerCase()))],
    elements: [...montage.elements, ...elementsSuggeres(analyse).filter(e => !idsElements.has(e.id))],
  };
}
