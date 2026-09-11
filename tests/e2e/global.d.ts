/** The read-only surface engine/main.ts exposes for the dev console and these tests. */
import type { TierName } from '../../engine/render/quality';
import type { SaveGameV5 } from '../../engine/save/schema';
import type { LegacyFile } from '../../engine/save/legacy';

declare global {
  interface Window {
    qingMao: {
      save: SaveGameV5;
      frameStats(): {
        drawCalls: number;
        triangles: number;
        chunksVisible: number;
        chunksTotal: number;
        fps: number;
        renderScale: number;
        tier: TierName;
      };
      debug: {
        lookStraightUp(): void;
        isExploring(): boolean;
        playerPosition(): { x: number; z: number };
        awaitingBeat(): string | null;
        currentArea(): string;
        objectiveDistance(): number | null;
        lineCount(): number;
        cameraPosition(): { x: number; y: number; z: number };
        areaContents(id: string): { props: string[]; dressing: string[]; enclosed: boolean };
        characterLook(id: string): { length: string; style: string; colour: number[]; meshes: number };
        facingProbe(id: string): { faceZ: number; backZ: number; rotationY: number; forward: { x: number; z: number } };
        sceneStateAfterSkip(): { flagsApplied: number; evidence: number };
      };
      legacy: {
        build(): LegacyFile;
        fallback(): LegacyFile;
        validate(value: unknown): LegacyFile | null;
      };
    };
  }
}
export {};
