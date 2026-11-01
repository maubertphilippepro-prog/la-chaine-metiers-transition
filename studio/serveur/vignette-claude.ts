import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { DESCRIPTIONS_GABARIT, GABARITS, gabaritRetenu, gabaritsCompatibles, LIBELLES_GABARIT, MAX_ELEMENTS, type Gabarit } from '../../noyau/gabarits';
import { bornerMise, COTES_POSE, MISE_PAR_DEFAUT, TAILLES_ACCROCHE } from '../../noyau/mise-en-page';
import { MAX_PROPOSITIONS_VIGNETTE, type ElementsVignette, type PropositionVignette } from '../../noyau/publication';
import type { Qualification } from '../../noyau/qualification';
import { traduireErreurClaude, verifierCleClaude } from './claude';
import { ErreurInterpretation } from './consignes';
import type { ImageClaude } from './images';
import { consigneDeTon } from './redaction';

// Ce qu'il faut à Claude pour proposer 3 mises en page des éléments choisis par l'auteur.
export interface DemandeVignette {
  // Pose, accroche, logos (déjà retrouvés dans la banque) et captures imposés par l'auteur.
  elements: ElementsVignette;
  // Noms de logos saisis qui désignent plusieurs fichiers : Claude tranche en voyant la banque.
  ambigus: string[];
  logosBanque: string[];
  consignes: string;
  // Variante de départ retenue par l'auteur, null pour partir de zéro.
  base: PropositionVignette | null;
  titre: string;
  description: string;
  images: { pose: ImageClaude | null; logos: ImageClaude[]; captures: ImageClaude[] };
  // Gabarits pris par les autres vidéos de la publication : à éviter si possible.
  dejaUtilises: Gabarit[];
  qualification: Qualification;
  modele: string;
}

export interface ReponseVignette {
  compris: string;
  pasRealisable: string[];
  // Fichiers choisis par Claude pour les noms de logos ambigus.
  logosAjoutes: string[];
  propositions: PropositionVignette[];
}

export type ProposerVignettes = (d: DemandeVignette) => Promise<ReponseVignette>;

const image = (i: ImageClaude): Anthropic.ImageBlockParam => ({ type: 'image', source: { type: 'base64', media_type: i.media_type, data: i.data } });
const legende = (text: string): Anthropic.TextBlockParam => ({ type: 'text', text });

const decrire = (p: PropositionVignette) => `gabarit ${p.gabarit}, accroche « ${p.accroche} », logos : ${p.logos.join(', ') || 'aucun'}, `
  + `captures : ${p.captures.join(', ') || 'aucune'}, mise : ${JSON.stringify(p.mise ?? MISE_PAR_DEFAUT)}`;

// Consignes, éléments imposés et images légendées une à une, pour que Claude sache à quel fichier chaque image correspond.
export function construireMessageVignette(d: DemandeVignette): Anthropic.ContentBlockParam[] {
  const e = d.elements;
  const gabarits = GABARITS.map(g => `- ${g} (${LIBELLES_GABARIT[g]}) : ${DESCRIPTIONS_GABARIT[g]}`
    + (d.dejaUtilises.includes(g) ? ' — déjà pris par une autre vidéo de la publication, à éviter si possible' : '')).join('\n');
  const ambigus = d.ambigus.length > 0
    ? `\nNoms de logos à trancher : ${d.ambigus.join(', ')}. Logos de la banque : ${d.logosBanque.join(', ')}. Choisis le fichier voulu pour chacun (logosAjoutes), ${MAX_ELEMENTS} logos au total au plus.\n`
    : '';
  const base = d.base ? `\nVariante de départ retenue par l’auteur : ${decrire(d.base)}. Reste proche d’elle, en appliquant les éléments et consignes ci-dessous.\n` : '';
  const blocs: Anthropic.ContentBlockParam[] = [legende(`Tu composes la vignette d’une vidéo de la chaîne YouTube « PMT » (astuces et outils numériques expliqués simplement à un public non spécialiste). L’auteur a choisi les éléments ; tu proposes exactement 3 variantes de mise en page.

Titre : ${d.titre}
Description :
${d.description}

Éléments imposés (ne les change pas) :
- pose : ${e.pose}
- accroche de l’auteur : « ${e.accroche} »
- logos : ${e.logos.join(', ') || 'aucun'}
- captures, dans l’ordre : ${e.captures.join(', ') || 'aucune'}
${ambigus}${base}
Gabarits :
${gabarits}

Mise en page de chaque variante :
- cotePose : gauche ou droite ;
- tailleAccroche : petite, normale ou grande ;
- recadrages : un par capture, dans l’ordre, zone gardée en % de l’image (x, y, largeur, hauteur, 10 % au moins), ou null pour l’image entière — sers-t’en pour montrer ce qui compte dans la capture ;
- logoVedette : un des logos à mettre en avant, ou null.

Voici les images.`)];
  if (d.images.pose) blocs.push(legende(`Pose ${e.pose} (détourée) :`), image(d.images.pose));
  for (const i of d.images.logos) blocs.push(legende(`Logo ${i.nom} :`), image(i));
  for (const i of d.images.captures) blocs.push(legende(`Capture ${i.nom} :`), image(i));
  blocs.push(legende(`<consignes>
${d.consignes || '(aucune)'}
</consignes>

Règles : le fond est toujours celui de la charte ; un gabarit seulement si sa condition est remplie ; une des 3 variantes garde l’accroche de l’auteur mot pour mot, les autres la reformulent en 3 à 5 mots, percutants et lisibles en petit.
${consigneDeTon(d.qualification)}

Réponds avec :
- compris : ta reformulation des consignes, en une phrase.
- pasRealisable : ce que les consignes demandent et qu’aucune variante ne peut faire, avec la raison ; liste vide sinon.
- logosAjoutes : les fichiers choisis pour les noms à trancher ; liste vide sinon.
- propositions : exactement 3 variantes (pose, logos, captures, gabarit, accroche, mise, explication d’une phrase).`));
  return blocs;
}

const SchemaRecadrage = z.object({ x: z.number(), y: z.number(), largeur: z.number(), hauteur: z.number() });
const SchemaVignette = z.object({
  compris: z.string(),
  pasRealisable: z.array(z.string()),
  logosAjoutes: z.array(z.string()),
  propositions: z.array(z.object({
    pose: z.string(), logos: z.array(z.string()), captures: z.array(z.string()), gabarit: z.enum(GABARITS), accroche: z.string(), explication: z.string(),
    mise: z.object({
      cotePose: z.enum(COTES_POSE), tailleAccroche: z.enum(TAILLES_ACCROCHE),
      recadrages: z.array(SchemaRecadrage.nullable()), logoVedette: z.string().nullable(),
    }),
  })),
}) satisfies z.ZodType<ReponseVignette>;

const cle = (p: PropositionVignette) => [p.gabarit, p.accroche, JSON.stringify(p.mise)].join('|');

// Éléments de l'auteur rétablis (Claude ne choisit que la mise en page et l'accroche), mise bornée, gabarit possible,
// doublons fusionnés.
export function nettoyerPropositionsVignette(propositions: PropositionVignette[], e: ElementsVignette, dejaUtilises: Gabarit[]): PropositionVignette[] {
  const compatibles = gabaritsCompatibles({ logos: e.logos.length, captures: e.captures.length }, dejaUtilises);
  const resultat: PropositionVignette[] = [];
  for (const p of propositions) {
    const propre: PropositionVignette = {
      pose: e.pose, logos: e.logos, captures: e.captures,
      gabarit: gabaritRetenu(p.gabarit, compatibles),
      accroche: p.accroche.trim() || e.accroche.trim(),
      explication: p.explication.trim(),
      mise: bornerMise(p.mise, e.logos, e.captures.length),
    };
    if (propre.accroche && !resultat.some(r => cle(r) === cle(propre))) resultat.push(propre);
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
        messages: [{ role: 'user', content: construireMessageVignette(d) }],
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
