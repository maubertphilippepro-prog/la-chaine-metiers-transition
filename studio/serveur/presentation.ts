import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fichierPresentation, lirePresentation, PRESENTATION_VIDE } from '../../noyau/presentation';
import type { DetailPresentation } from '../commun';
import { ErreurInterpretation } from './consignes';
import { ecrireJson, ErreurHttp, message } from './http';
import type { VideoMail } from './mail';
import type { RedigerPresentation } from './presentation-claude';

export interface OutilsPresentation {
  rediger: RedigerPresentation;
}

// Texte de présentation pour la page SharePoint « Chaîne M&T », dans publication/<cible>/sharepoint/presentation.json.
export function creerPresentation(o: OutilsPresentation) {
  const enCours = new Set<string>();
  const fichier = (v: VideoMail) => path.join(v.dossierTournage, ...fichierPresentation(v.cible).split('/'));

  async function detail(v: VideoMail): Promise<DetailPresentation> {
    const f = fichier(v);
    const redigee = existsSync(f);
    return {
      presentation: redigee ? lirePresentation(JSON.parse(await readFile(f, 'utf-8'))) : PRESENTATION_VIDE,
      dureeSecondes: v.disponible.dureeSecondes,
      redigee,
    };
  }

  async function enregistrer(v: VideoMail, corps: Record<string, unknown>): Promise<DetailPresentation> {
    await mkdir(path.dirname(fichier(v)), { recursive: true });
    await ecrireJson(fichier(v), lirePresentation(corps.presentation));
    return detail(v);
  }

  async function rediger(v: VideoMail): Promise<DetailPresentation> {
    const cle = `${v.dossierTournage}|${v.cible}`;
    if (enCours.has(cle)) throw new ErreurHttp(409, 'Une rédaction est déjà en cours pour cette présentation.');
    enCours.add(cle);
    try {
      const p = await o.rediger({
        titreVideo: v.video.titre || v.disponible.titre,
        description: v.video.description,
        texte: v.texte,
        chapitres: v.chapitres,
        modele: v.modele,
      });
      await mkdir(path.dirname(fichier(v)), { recursive: true });
      await ecrireJson(fichier(v), p);
    } catch (e) {
      if (e instanceof ErreurHttp) throw e;
      if (e instanceof ErreurInterpretation) throw new ErreurHttp(e.statut, e.message);
      throw new ErreurHttp(500, `Rédaction impossible : ${message(e)}`);
    } finally {
      enCours.delete(cle);
    }
    return detail(v);
  }

  return { detail, enregistrer, rediger };
}
