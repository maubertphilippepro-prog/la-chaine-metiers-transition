import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { extraitPassage, motsRecouverts, premierMotDuChapitre, type ReponseConsigne } from '../../noyau/consignes';
import type { Coupe, Mot } from '../../noyau/types';
import { ErreurInterpretation, type DemandeInterpretation } from './consignes';

// Même présentation que le pipeline (suggestions.py) : « numéro:mot », 30 mots par ligne.
function texteNumerote(mots: Mot[]): string {
  const lignes: string[] = [];
  for (let i = 0; i < mots.length; i += 30) lignes.push(mots.slice(i, i + 30).map(m => `${m.id}:${m.texte}`).join(' '));
  return lignes.join('\n');
}

const etatCoupe = (c: Coupe) => (c.enAttente ? 'longueur en attente' : c.active ? 'appliquée' : 'rétablie');
const liste = (lignes: string[], vide: string) => (lignes.length > 0 ? lignes.join('\n') : vide);

function decrireMontage({ analyse, montage }: DemandeInterpretation): string {
  const coupes = montage.coupes.map(c => {
    const mots = motsRecouverts(analyse, c);
    const ou = mots ? `mots ${mots.premierMot} à ${mots.dernierMot}` : 'aucun mot (blanc entre deux mots)';
    return `- ${c.id} · ${c.type} · ${etatCoupe(c)} · ${ou}`;
  });
  const chapitres = montage.chapitres.map((c, i) => {
    const premier = premierMotDuChapitre(analyse, montage, i);
    return `- ${premier === null ? 'aucun mot' : `mot ${premier}`} · ${c.titre}`;
  });
  const termes = montage.termes.map(t => `- ${t.terme} · ${t.statut} · ${t.position} · ${t.definition}`);
  const elements = montage.elements.map(e => {
    const mots = motsRecouverts(analyse, e);
    const ou = mots ? `mots ${mots.premierMot} à ${mots.dernierMot}` : 'aucun mot';
    const texte = e.nature === 'texte' ? ` · « ${e.texte} » · ${e.position}` : '';
    return `- ${e.id} · ${e.nature} · ${e.statut} · ${ou}${texte}`;
  });
  return `Titre de la vidéo : ${montage.titre}

Coupes (id · type · état · mots recouverts) :
${liste(coupes, '(aucune)')}

Chapitres (premier mot · titre) :
${liste(chapitres, '(aucun)')}

Termes à définir (terme · statut · position de l'encart · définition) :
${liste(termes, '(aucun)')}

Éléments à l'écran (id · nature · statut · mots couverts · texte · position) :
${liste(elements, '(aucun)')}`;
}

export function construirePrompt(d: DemandeInterpretation): string {
  const passage = d.ancrage
    ? `\nPassage sélectionné par l'auteur, auquel la consigne s'applique : mots ${d.ancrage.premierMot} à ${d.ancrage.dernierMot} (« ${extraitPassage(d.analyse, d.ancrage)} »).\n`
    : '';
  return `Tu aides l'auteur de la chaîne YouTube personnelle « PMT » (astuces et outils numériques expliqués simplement) à monter un tournage face caméra, non scripté, en français. Il te donne une consigne de montage ; tu la traduis en opérations d'un vocabulaire fermé. Rien n'est appliqué sans son accord : il acceptera ou refusera chaque opération.

Voici la transcription. Chaque mot est précédé de son numéro (numéro:mot).

<transcription>
${texteNumerote(d.analyse.mots)}
</transcription>

Voici l'état actuel du montage.

<montage>
${decrireMontage(d)}
</montage>

<consigne>
${d.texte}
</consigne>
${passage}
Opérations possibles. Les passages sont désignés par les numéros de leur premier et de leur dernier mot (inclus) ; un chapitre par le numéro de son premier mot, tel qu'indiqué dans le montage ci-dessus.
- couper : couper le passage premierMot à dernierMot.
- basculerCoupe : rétablir une coupe appliquée, ou réappliquer une coupe rétablie (idCoupe). Pas pour une longueur en attente.
- deciderLongueur : accepter (couper, accepter = true) ou refuser (garder, accepter = false) une longueur en attente (idCoupe).
- renommerChapitre : changer le titre du chapitre qui commence au mot premierMotChapitre.
- ajouterChapitre : commencer un nouveau chapitre au mot premierMot, avec un titre.
- deplacerChapitre : faire commencer le chapitre premierMotChapitre au mot nouveauPremierMot, entre le début du chapitre précédent et le chapitre suivant. Pas le premier chapitre.
- fusionnerChapitre : fusionner le chapitre premierMotChapitre avec le précédent. Pas le premier chapitre.
- modifierTerme : changer la définition, le statut (a-valider, valide, ecarte) ou la position de l'encart (bas, haut) d'un terme existant ; mets à null les champs à ne pas changer.
- ajouterTerme : ajouter un terme à définir, avec sa définition et les numéros de tous les mots où il est prononcé.
- ajouterElement : poser un élément sur la vidéo pendant le passage premierMot à dernierMot. nature : zoom (agrandir une zone de l'écran partagé), miseEnAvant (assombrir l'image autour d'une zone), texte (incruster un texte court : URL, nom d'outil, raccourci clavier, chiffre clé ; donne texte, et position parmi haut-gauche, haut-droite, centre, bas-centre si l'auteur la précise, sinon null ; texte et position à null pour les autres natures), camera (passer la caméra en grand pour un aparté face caméra). Tu ne vois pas l'image : ne donne jamais de zone, l'auteur la tracera lui-même.
- modifierElement : changer le passage (premierMot et dernierMot ensemble), le texte, la position ou le statut (a-valider, valide, ecarte) d'un élément existant (idElement) ; mets à null les champs à ne pas changer. Accepter un élément suggéré : statut = valide.
- supprimerElement : retirer un élément (idElement).
- titreVideo : changer le titre de la vidéo complète.

Une définition fait au plus ${d.definitionMax} caractères, en une ou deux phrases claires pour un public non spécialiste. Un titre de chapitre est court (60 caractères au plus). Un texte incrusté fait au plus ${d.texteMax} caractères. Un seul zoom ou caméra en grand à la fois ; pas de mise en avant pendant un zoom ou la caméra en grand ; deux textes affichés en même temps sont à des positions différentes.

Réponds avec :
- reformulation : ce que tu as compris de la consigne, en une ou deux phrases ; elle sera affichée après « J'ai compris : ».
- operations : les opérations, dans l'ordre où les appliquer, chacune avec une explication d'une phrase pour l'auteur. Chaque opération s'applique au montage laissé par les précédentes.
- nonRealisable : ce que la consigne demande et qu'aucune opération ne permet, chaque fois avec la raison. N'invente pas d'opération et n'approche pas silencieusement : si une partie de la consigne ne peut pas être faite exactement, mets-la ici.
`;
}

// Pas de champ facultatif dans le schéma : chacun double la grammaire de la sortie structurée, que l'API refuse
// au-delà d'une taille. Un champ sans valeur arrive à null et est retiré avant d'être rendu.
const explication = z.string();
const positionTexte = z.enum(['haut-gauche', 'haut-droite', 'centre', 'bas-centre']);
const SchemaOperation = z.discriminatedUnion('type', [
  z.object({ type: z.literal('couper'), premierMot: z.number().int(), dernierMot: z.number().int(), explication }),
  z.object({ type: z.literal('basculerCoupe'), idCoupe: z.string(), explication }),
  z.object({ type: z.literal('deciderLongueur'), idCoupe: z.string(), accepter: z.boolean(), explication }),
  z.object({ type: z.literal('renommerChapitre'), premierMotChapitre: z.number().int(), titre: z.string(), explication }),
  z.object({ type: z.literal('ajouterChapitre'), premierMot: z.number().int(), titre: z.string(), explication }),
  z.object({
    type: z.literal('deplacerChapitre'), premierMotChapitre: z.number().int(), nouveauPremierMot: z.number().int(), explication,
  }),
  z.object({ type: z.literal('fusionnerChapitre'), premierMotChapitre: z.number().int(), explication }),
  z.object({
    type: z.literal('modifierTerme'),
    terme: z.string(),
    definition: z.string().nullable(),
    statut: z.enum(['a-valider', 'valide', 'ecarte']).nullable(),
    position: z.enum(['bas', 'haut']).nullable(),
    explication,
  }),
  z.object({ type: z.literal('ajouterTerme'), terme: z.string(), definition: z.string(), mots: z.array(z.number().int()), explication }),
  z.object({
    type: z.literal('ajouterElement'),
    nature: z.enum(['zoom', 'miseEnAvant', 'texte', 'camera']),
    premierMot: z.number().int(),
    dernierMot: z.number().int(),
    texte: z.string().nullable(),
    position: positionTexte.nullable(),
    explication,
  }),
  z.object({
    type: z.literal('modifierElement'),
    idElement: z.string(),
    premierMot: z.number().int().nullable(),
    dernierMot: z.number().int().nullable(),
    texte: z.string().nullable(),
    position: positionTexte.nullable(),
    statut: z.enum(['a-valider', 'valide', 'ecarte']).nullable(),
    explication,
  }),
  z.object({ type: z.literal('supprimerElement'), idElement: z.string(), explication }),
  z.object({ type: z.literal('titreVideo'), titre: z.string(), explication }),
]);
const SchemaReponse = z.object({
  reformulation: z.string(),
  operations: z.array(SchemaOperation),
  nonRealisable: z.array(z.string()),
});

// Sortie structurée, effort moyen et repli serveur en cas de refus, comme le pipeline.
export async function interpreterConsigne(d: DemandeInterpretation, client?: Anthropic): Promise<ReponseConsigne> {
  if (!client && !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new ErreurInterpretation(500, 'Clé API Claude absente : définissez la variable d’environnement ANTHROPIC_API_KEY.');
  }
  let reponse;
  try {
    reponse = await (client ?? new Anthropic()).messages.parse(
      {
        model: d.modele,
        max_tokens: 16000,
        output_config: { effort: 'medium', format: zodOutputFormat(SchemaReponse) },
        messages: [{ role: 'user', content: construirePrompt(d) }],
        fallbacks: 'default',
      },
      { headers: { 'anthropic-beta': 'server-side-fallback-2026-07-01' } },
    );
  } catch (e) {
    if (e instanceof Anthropic.APIConnectionError) {
      throw new ErreurInterpretation(503, `Connexion à l’API Claude impossible : ${e.message}`);
    }
    if (e instanceof Anthropic.RateLimitError) {
      throw new ErreurInterpretation(503, 'Limite de requêtes de l’API Claude atteinte, réessayez plus tard.');
    }
    if (e instanceof Anthropic.APIError) {
      const statut = e.status !== undefined && e.status >= 500 ? 503 : 500;
      throw new ErreurInterpretation(statut, `Erreur de l’API Claude (${e.status ?? 'sans statut'}) : ${e.message}`);
    }
    if (e instanceof Anthropic.AnthropicError) throw new ErreurInterpretation(500, `Réponse de Claude inexploitable : ${e.message}`);
    throw e;
  }
  if (reponse.stop_reason === 'refusal') throw new ErreurInterpretation(500, 'Claude a refusé de traiter cette consigne.');
  if (!reponse.parsed_output) {
    throw new ErreurInterpretation(500, `Réponse de Claude inexploitable (arrêt : ${reponse.stop_reason}).`);
  }
  const { operations, ...reste } = reponse.parsed_output;
  return { ...reste, operations: operations.map(sansNuls) as ReponseConsigne['operations'] };
}

function sansNuls(o: object): object {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null));
}
