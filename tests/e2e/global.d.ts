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
      debug: { lookStraightUp(): void };
      legacy: {
        build(): LegacyFile;
        fallback(): LegacyFile;
        validate(value: unknown): LegacyFile | null;
      };
    };
  }
}
export {};
