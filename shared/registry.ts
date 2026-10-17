import { callbreakEngine } from './callbreak.ts';
import { dhumbalEngine } from './dhumbal.ts';
import type { BaseState, Engine } from './engine.ts';
import type { GameType } from './games.ts';
import { kittiEngine } from './kitti.ts';
import { marriageEngine } from './marriage.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyEngine = Engine<BaseState, any, any>;

export const ENGINES: Record<GameType, AnyEngine> = {
  callbreak: callbreakEngine as unknown as AnyEngine,
  marriage: marriageEngine as unknown as AnyEngine,
  dhumbal: dhumbalEngine as unknown as AnyEngine,
  kitti: kittiEngine as unknown as AnyEngine,
};
