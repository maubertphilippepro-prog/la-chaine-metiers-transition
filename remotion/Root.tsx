import type { FC } from 'react';
import { Composition, Folder, Still } from 'remotion';
import { enImages } from '../noyau/images';
import { ApercuEncart, ApercuLogo } from './apercus';
import { durees, FPS_HABILLAGE, HAUTEUR, LARGEUR } from './charte';
import { CartonFin } from './composants/CartonFin';
import { Generique } from './composants/Generique';
import { Intertitre } from './composants/Intertitre';

const generique = enImages(durees.generique, FPS_HABILLAGE);
const intertitre = enImages(durees.intertitre, FPS_HABILLAGE);
const cartonFin = enImages(durees.cartonFin, FPS_HABILLAGE);
const encart = enImages(durees.encart, FPS_HABILLAGE);

export const RemotionRoot: FC = () => (
  <Folder name="Habillage">
    <Still id="Logo" component={ApercuLogo} width={600} height={600} />
    <Composition
      id="Generique" component={Generique} durationInFrames={generique} fps={FPS_HABILLAGE} width={LARGEUR} height={HAUTEUR}
      defaultProps={{ titre: 'There : exportez vos documents en Markdown pour l’IA', duree: generique }}
    />
    <Composition
      id="Intertitre" component={Intertitre} durationInFrames={intertitre} fps={FPS_HABILLAGE} width={LARGEUR} height={HAUTEUR}
      defaultProps={{ titre: 'Windows + V : retrouvez tout ce que vous avez copié', numero: 2, duree: intertitre }}
    />
    <Composition
      id="CartonFin" component={CartonFin} durationInFrames={cartonFin} fps={FPS_HABILLAGE} width={LARGEUR} height={HAUTEUR}
      defaultProps={{ duree: cartonFin }}
    />
    <Composition
      id="EncartDefinition" component={ApercuEncart} durationInFrames={encart} fps={FPS_HABILLAGE} width={LARGEUR} height={HAUTEUR}
      defaultProps={{
        terme: 'Markdown',
        definition: 'Format de texte simple qui utilise des symboles (#, *, |…) pour indiquer la mise en forme : titres, gras, tableaux.',
        position: 'bas' as const,
        duree: encart,
      }}
    />
  </Folder>
);
