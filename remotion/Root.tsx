import type { FC } from 'react';
import { Folder, Still } from 'remotion';
import { ApercuLogo } from './apercus';

export const RemotionRoot: FC = () => (
  <Folder name="Habillage">
    <Still id="Logo" component={ApercuLogo} width={600} height={600} />
  </Folder>
);
