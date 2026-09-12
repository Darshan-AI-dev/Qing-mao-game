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
        toast(text: string): void;
        visitArea(areaId: string): boolean;
        jumpToBeat(beatId: string): boolean;
        walkToObjective(): boolean;
        folkHere(): { id: string; name: string; distance: number; next: string | null }[];
        walkToFolk(): string | null;
        speakToNearest(): string | null;
        spawnClearance(areaId: string): { x: number; z: number; lane: boolean; reachable: boolean };
        currentBeatFacts(): { id: string; title: string; objective: string; designNote: string } | null;
        cameraBasis(): { right: { x: number; y: number; z: number }; forward: { x: number; y: number; z: number } };
        fightView(): {
          name: string; phase: number; phases: number; defence: string; hint: string;
          vitality: number; vitalityMax: number; state: string; openNow: boolean;
        } | null;
        tryStrike(abilityId: string): { landed: boolean; reason: string; damage: number } | null;
        forageSummary(): { area: string; nodes: number; items: string[] }[];
        forageState(): { ready: number; nearest: number | null; carrying: Record<string, number> };
        walkToGather(): boolean;
        guLoadout(): { rank: number; capacity: number; carried: string[]; stored: string[] };
        refine(recipeId: string): { kind: string; gu?: string; stones?: number; days?: number; reason?: string };
        giveGu(id: string): boolean;
        areaIds(): string[];
        setCameraDistance(distance: number): void;
        setInspectionDistance(distance: number | null): void;
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
