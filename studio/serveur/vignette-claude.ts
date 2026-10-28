import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { DESCRIPTIONS_GABARIT, GABARITS, gabaritRetenu, gabaritsCompatibles, LIBELLES_GABARIT, MAX_ELEMENTS, type Gabarit } from '../../noyau/gabarits';
import { MAX_PROPOSITIONS_VIGNETTE, type ConsigneVignette, type PropositionVignette, type Vignette } from '../../noyau/publication';
import type { Qualification } from '../../noyau/qualification';
import { traduireErreurClaude, verifierCleClaude } from './claude';
import { ErreurInterpretation } from './consignes';
import { consigneDeTon } from './redaction';

// Fichiers que Claude peut citer (il n'en voit que les noms) et accroches de repli.
export interface ElementsDisponibles {
  poses: string[];
  logos: string[];
  // Captures proposables : les candidates cochées par l'auteur, sinon toutes celles du dossier.
  captures: string[];
  // Accroches déjà rédigées.
  accroches: string[];
}

// Ce qu'il faut à Claude pour proposer des compositions de vignette d'après une consigne.
export interface DemandeVignette {
  consigne: string;
  titre: string;
  description: string;
  logiciels: string[];
  disponibles: ElementsDisponibles;
  actuelle: Vignette | null;
  // Gabarits pris par les autres vidéos de la publication : à éviter si possible.
  dejaUtilises: Gabarit[];
  precedentes: ConsigneVignette[];
  qualification: Qualification;
  modele: string;
}

export interface ReponseVignette {
  compris: string;
  pasRealisable: string[];
  propositions: PropositionVignette[];
}

export type ProposerVignettes = (d: DemandeVignette) => Promise<ReponseVignette>;

const liste = (titre: string, elements: string[]) =>
  (elements.length > 0 ? `${titre} :\n${elements.map(e => `- ${e}`).join('\n')}` : `${titre} : aucun`);

const decrire = (c: { pose: string; gabarit: Gabarit; accroche: string; logos: string[]; captures: string[] }) =>
  `pose ${c.pose}, gabarit ${c.gabarit}, accroche « ${c.accroche} », logos : ${c.logos.join(', ') || 'aucun'}, captures : ${c.captures.join(', ') || 'aucune'}`;

export function construirePromptVignette(d: DemandeVignette): string {
  const actuelle = d.actuelle ? `Composition actuelle : ${decrire({ ...d.actuelle, pose: d.actuelle.pose.fichier })}` : 'Pas encore de composition.';
  const gabarits = GABARITS.map(g => `- ${g} (${LIBELLES_GABARIT[g]}) : ${DESCRIPTIONS_GABARIT[g]}`
    + (d.dejaUtilises.includes(g) ? ' — déjà pris par une autre vidéo de la publication, à éviter si possible' : '')).join('\n');
  const precedentes = d.precedentes.length > 0
    ? `\nConsignes précédentes pour cette vignette, de la plus ancienne à la plus récente :\n${d.precedentes.map(c => {
      const retenue = c.choisie === null ? 'aucune proposition retenue' : `retenue : ${decrire(c.propositions[c.choisie]!)}`;
      return `- « ${c.texte} » (${retenue})`;
    }).join('\n')}\n`
    : '';
  return `Tu aides l’auteur de la chaîne YouTube « PMT » (astuces et outils numériques expliqués simplement à un public non spécialiste) à composer la vignette d’une vidéo. Il te donne une consigne ; propose 2 ou 3 compositions complètes, il choisira en aperçu.

Titre : ${d.titre}
Description :
${d.description}

${liste('Accroches déjà rédigées', d.disponibles.accroches)}
${liste('Logiciels cités', d.logiciels)}

Tu ne vois pas les images, seulement leurs noms de fichiers : choisis d’après les noms.
${liste('Poses (photos de l’auteur)', d.disponibles.poses)}
${liste('Logos', d.disponibles.logos)}
${liste('Captures', d.disponibles.captures)}

${actuelle}

Gabarits :
${gabarits}
${precedentes}
<consigne>
${d.consigne}
</consigne>

Règles : le fond est toujours celui de la charte de la chaîne ; ${MAX_ELEMENTS} logos et ${MAX_ELEMENTS} captures au plus, pris dans les listes ci-dessus sous leur nom exact ; un gabarit seulement si sa condition est remplie ; l’accroche fait 3 à 5 mots, percutante et lisible en petit.
${consigneDeTon(d.qualification)}

Réponds avec :
- compris : ta reformulation de la consigne, en une phrase.
- pasRealisable : ce que la consigne demande et qu’aucune composition ne peut faire, chaque fois avec la raison (« un fond vert — le fond est toujours celui de la charte ») ; liste vide sinon.
- propositions : 2 ou 3 compositions différentes, chacune avec pose, logos, captures, gabarit, accroche et explication (une phrase qui dit ce qui la distingue).
`;
}

const SchemaVignette = z.object({
  compris: z.string(),
  pasRealisable: z.array(z.string()),
  propositions: z.array(z.object({
    pose: z.string(),
    logos: z.array(z.string()),
    captures: z.array(z.string()),
    gabarit: z.enum(GABARITS),
    accroche: z.string(),
    explication: z.string(),
  })),
}) satisfies z.ZodType<ReponseVignette>;

const cle = (p: PropositionVignette) => [p.pose, p.gabarit, p.accroche, p.logos.join(','), p.captures.join(',')].join('|');

// Fichiers connus seulement, sans doublon, MAX_ELEMENTS au plus.
const connus = (fichiers: string[], disponibles: string[]) =>
  [...new Set(fichiers.map(f => f.trim()))].filter(f => disponibles.includes(f)).slice(0, MAX_ELEMENTS);

// Propositions ramenées à ce que la banque et le tournage permettent ; une proposition sans pose ni accroche possible
// est écartée, celles devenues identiques sont fusionnées.
export function nettoyerPropositionsVignette(
  propositions: PropositionVignette[], d: ElementsDisponibles, actuelle: Vignette | null, dejaUtilises: Gabarit[],
): PropositionVignette[] {
  const poseActuelle = actuelle && d.poses.includes(actuelle.pose.fichier) ? actuelle.pose.fichier : undefined;
  const resultat: PropositionVignette[] = [];
  for (const p of propositions) {
    const pose = d.poses.includes(p.pose.trim()) ? p.pose.trim() : (poseActuelle ?? d.poses[0]);
    const accroche = p.accroche.trim() || actuelle?.accroche.trim() || d.accroches[0]?.trim() || '';
    if (!pose || !accroche) continue;
    const logos = connus(p.logos, d.logos);
    const captures = connus(p.captures, d.captures);
    const gabarit = gabaritRetenu(p.gabarit, gabaritsCompatibles({ logos: logos.length, captures: captures.length }, dejaUtilises));
    const propre = { pose, logos, captures, gabarit, accroche, explication: p.explication.trim() };
    if (!resultat.some(r => cle(r) === cle(propre))) resultat.push(propre);
  }
  return resultat.slice(0, MAX_PROPOSITIONS_VIGNETTE);
}

// Même appel que la rédaction : sortie structurée, effort moyen, repli serveur. L'appelant nettoie les propositions.
export async function proposerVignettes(d: DemandeVignette, client?: Anthropic): Promise<ReponseVignette> {
  verifierCleClaude(client);
  let reponse;
  try {
    reponse = await (client ?? new Anthropic()).messages.parse(
      {
        model: d.modele,
        max_tokens: 8000,
        output_config: { effort: 'medium', format: zodOutputFormat(SchemaVignette) },
        messages: [{ role: 'user', content: construirePromptVignette(d) }],
        fallbacks: 'default',
      },
      { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } },
    );
  } catch (e) {
    throw traduireErreurClaude(e);
  }
  if (reponse.stop_reason === 'refusal') throw new ErreurInterpretation(500, 'Claude a refusé de proposer une vignette pour cette consigne.');
  if (!reponse.parsed_output) throw new ErreurInterpretation(500, `Réponse de Claude inexploitable (arrêt : ${reponse.stop_reason}).`);
  return reponse.parsed_output;
}
