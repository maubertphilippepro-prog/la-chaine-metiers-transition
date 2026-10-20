import type { ElementEcran, Montage, PositionTexte, StatutElement, Terme, Zone } from './types';

// Opérations du studio : chacune renvoie un nouveau montage sans modifier l'original.
// Une opération impossible renvoie le même objet, ce qui évite un enregistrement inutile.

// Rétablit un passage coupé ou le recoupe ; une coupe manuelle rétablie disparaît.
export function basculerCoupe(m: Montage, id: string): Montage {
  const coupe = m.coupes.find(c => c.id === id);
  if (!coupe || coupe.enAttente) return m;
  if (coupe.type === 'manuelle' && coupe.active) return { ...m, coupes: m.coupes.filter(c => c.id !== id) };
  return { ...m, coupes: m.coupes.map(c => (c.id === id ? { ...c, active: !c.active } : c)) };
}

export function couperPassage(m: Montage, debut: number, fin: number): Montage {
  if (!(fin > debut)) return m;
  const numeros = m.coupes
    .filter(c => c.type === 'manuelle')
    .map(c => Number(c.id.slice(1)))
    .filter(n => Number.isInteger(n));
  const id = `m${numeros.length > 0 ? Math.max(...numeros) + 1 : 0}`;
  return { ...m, coupes: [...m.coupes, { id, type: 'manuelle', debut, fin, active: true }] };
}

export function deciderLongueur(m: Montage, id: string, accepter: boolean): Montage {
  if (!m.coupes.some(c => c.id === id && c.type === 'longueur')) return m;
  return { ...m, coupes: m.coupes.map(c => (c.id === id ? { ...c, active: accepter, enAttente: false } : c)) };
}

export type ChangementTerme = Partial<Pick<Terme, 'definition' | 'statut' | 'position'>>;

export function modifierTerme(m: Montage, terme: string, changement: ChangementTerme): Montage {
  if (!m.termes.some(t => t.terme === terme)) return m;
  return { ...m, termes: m.termes.map(t => (t.terme === terme ? { ...t, ...changement } : t)) };
}

// Terme ajouté par une consigne : à valider, encart en bas ; ignoré s'il existe déjà (sans tenir compte de la casse).
export function ajouterTerme(m: Montage, terme: string, definition: string, occurrences: number[]): Montage {
  if (m.termes.some(t => t.terme.toLowerCase() === terme.toLowerCase())) return m;
  const triees = [...new Set(occurrences)].sort((a, b) => a - b);
  return { ...m, termes: [...m.termes, { terme, definition, occurrences: triees, statut: 'a-valider', position: 'bas' }] };
}

// Les chapitres sont triés par début et le premier commence à 0.
export function renommerChapitre(m: Montage, index: number, titre: string): Montage {
  if (!m.chapitres[index]) return m;
  return { ...m, chapitres: m.chapitres.map((c, i) => (i === index ? { ...c, titre } : c)) };
}

// Le premier chapitre reste à 0 ; une autre limite ne peut pas atteindre ses voisines.
export function deplacerLimite(m: Montage, index: number, debut: number): Montage {
  const precedent = m.chapitres[index - 1];
  const suivant = m.chapitres[index + 1];
  if (!precedent || !m.chapitres[index]) return m;
  if (debut <= precedent.debut || (suivant && debut >= suivant.debut)) return m;
  return { ...m, chapitres: m.chapitres.map((c, i) => (i === index ? { ...c, debut } : c)) };
}

// Le chapitre rejoint le précédent.
export function fusionnerChapitre(m: Montage, index: number): Montage {
  if (index <= 0 || index >= m.chapitres.length) return m;
  return { ...m, chapitres: m.chapitres.filter((_, i) => i !== index) };
}

export function ajouterChapitre(m: Montage, debut: number, titre: string): Montage {
  if (debut <= 0 || m.chapitres.some(c => c.debut === debut)) return m;
  return { ...m, chapitres: [...m.chapitres, { titre, debut }].sort((a, b) => a.debut - b.debut) };
}

export function changerTitre(m: Montage, titre: string): Montage {
  return titre === m.titre ? m : { ...m, titre };
}

type SansId<T> = T extends unknown ? Omit<T, 'id'> : never;
export type NouvelElement = SansId<ElementEcran>;

export type ChangementElement = Partial<{
  debut: number;
  fin: number;
  statut: StatutElement;
  texte: string;
  position: PositionTexte;
  zone: Zone;
}>;

// Les champs qui ne concernent pas la nature de l'élément sont ignorés. Les clés sont toujours
// rangées dans le même ordre, pour que la comparaison « sans effet » des consignes reste fiable.
function changer(e: ElementEcran, c: ChangementElement): ElementEcran {
  const commun = { id: e.id, debut: c.debut ?? e.debut, fin: c.fin ?? e.fin, statut: c.statut ?? e.statut };
  switch (e.nature) {
    case 'texte':
      return { ...commun, nature: e.nature, texte: c.texte ?? e.texte, position: c.position ?? e.position };
    case 'zoom':
    case 'miseEnAvant':
      return { ...commun, nature: e.nature, zone: c.zone ?? e.zone };
    case 'camera':
      return { ...commun, nature: e.nature };
  }
}

// Élément créé dans le studio (directement ou par une consigne) : e0, e1…
export function prochainIdElement(m: Montage): string {
  const numeros = m.elements
    .map(e => /^e(\d+)$/.exec(e.id)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
  return `e${numeros.length > 0 ? Math.max(...numeros) + 1 : 0}`;
}

export function ajouterElement(m: Montage, e: NouvelElement): Montage {
  return { ...m, elements: [...m.elements, changer({ id: prochainIdElement(m), ...e }, {})] };
}

export function modifierElement(m: Montage, id: string, c: ChangementElement): Montage {
  if (!m.elements.some(e => e.id === id)) return m;
  return { ...m, elements: m.elements.map(e => (e.id === id ? changer(e, c) : e)) };
}

export function supprimerElement(m: Montage, id: string): Montage {
  if (!m.elements.some(e => e.id === id)) return m;
  return { ...m, elements: m.elements.filter(e => e.id !== id) };
}
