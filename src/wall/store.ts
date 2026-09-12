import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SAMPLE_WALLS, type WallSeg } from "./plan";
import {
  DEFAULT_DOOR,
  DEFAULT_EXHAUST,
  type DoorSpec,
  type ExhaustSpec,
  type Series,
} from "./pack";

export type Tool = "wall" | "existing" | "door" | "exhaust" | "erase" | null;

type Store = {
  walls: WallSeg[];
  series: Series;
  heightIn: number;
  tool: Tool;
  selected: string | null;
  doorSpec: DoorSpec;
  exhaustSpec: ExhaustSpec;
  past: WallSeg[][];
  future: WallSeg[][];
  setTool: (t: Tool) => void;
  setSeries: (s: Series) => void;
  setHeight: (n: number) => void;
  setDoorSpec: (p: Partial<DoorSpec>) => void;
  setExhaustSpec: (p: Partial<ExhaustSpec>) => void;
  select: (id: string | null) => void;
  addWall: (w: WallSeg) => void;
  removeWall: (id: string) => void;
  addFixture: (wallId: string, f: WallSeg["fixtures"][number]) => void;
  loadSample: () => void;
  clear: () => void;
  undo: () => void;
  redo: () => void;
};

function clone(walls: WallSeg[]): WallSeg[] {
  return structuredClone(walls);
}

export const useWall = create<Store>()(
  persist(
    (set) => ({
      walls: SAMPLE_WALLS,
      series: "core",
      heightIn: 120,
      tool: null,
      selected: null,
      doorSpec: DEFAULT_DOOR,
      exhaustSpec: DEFAULT_EXHAUST,
      past: [],
      future: [],
      setTool: (tool) => set({ tool }),
      setSeries: (series) => set({ series }),
      setHeight: (heightIn) => set({ heightIn }),
      setDoorSpec: (p) => set((s) => ({ doorSpec: { ...s.doorSpec, ...p } })),
      setExhaustSpec: (p) => set((s) => ({ exhaustSpec: { ...s.exhaustSpec, ...p } })),
      select: (selected) => set({ selected }),
      addWall: (w) =>
        set((s) => ({
          past: [...s.past, clone(s.walls)].slice(-50),
          future: [],
          walls: [...s.walls, w],
          selected: w.id,
        })),
      removeWall: (id) =>
        set((s) => ({
          past: [...s.past, clone(s.walls)].slice(-50),
          future: [],
          walls: s.walls.filter((w) => w.id !== id),
          selected: s.selected === id ? null : s.selected,
        })),
      addFixture: (wallId, f) =>
        set((s) => {
          const wall = s.walls.find((w) => w.id === wallId);
          if (!wall) return s;
          const hit = wall.fixtures.some(
            (x) => f.offset < x.offset + x.size && x.offset < f.offset + f.size,
          );
          if (hit) return s;
          return {
            past: [...s.past, clone(s.walls)].slice(-50),
            future: [],
            walls: s.walls.map((w) =>
              w.id === wallId ? { ...w, fixtures: [...w.fixtures, f] } : w,
            ),
          };
        }),
      loadSample: () =>
        set((s) => ({
          past: [...s.past, clone(s.walls)].slice(-50),
          future: [],
          walls: clone(SAMPLE_WALLS),
          selected: null,
        })),
      clear: () =>
        set((s) => ({
          past: [...s.past, clone(s.walls)].slice(-50),
          future: [],
          walls: [],
          selected: null,
        })),
      undo: () =>
        set((s) => {
          if (!s.past.length) return s;
          const walls = s.past[s.past.length - 1];
          return {
            past: s.past.slice(0, -1),
            future: [...s.future, clone(s.walls)],
            walls,
            selected: null,
          };
        }),
      redo: () =>
        set((s) => {
          if (!s.future.length) return s;
          const walls = s.future[s.future.length - 1];
          return {
            future: s.future.slice(0, -1),
            past: [...s.past, clone(s.walls)],
            walls,
            selected: null,
          };
        }),
    }),
    {
      name: "gw-wall",
      version: 4,
      partialize: (s) => ({
        walls: s.walls,
        series: s.series,
        heightIn: s.heightIn,
        doorSpec: s.doorSpec,
        exhaustSpec: s.exhaustSpec,
      }),
      migrate: (persisted) => {
        const p = persisted as {
          walls: { fixtures: Record<string, unknown>[]; layer?: string }[];
          series?: Series;
          heightIn?: number;
          doorSpec?: DoorSpec;
          exhaustSpec?: ExhaustSpec;
        };
        const ids = (p.walls ?? []).map((w) => (w as { id?: string }).id).join(",");
        return {
          walls:
            ids === "n,e,s,w"
              ? clone(SAMPLE_WALLS)
              : (p.walls ?? []).map((w) => ({
                  ...w,
                  layer: w.layer === "existing" ? "existing" : "tws",
                  fixtures: (w.fixtures ?? []).map((f) => {
                    if (f.type === "door" && !("style" in f)) {
                      return { ...f, style: "swing", frame: 36, swing: "in", hand: "left", size: 36 };
                    }
                    if (f.type === "exhaust" && !("panel" in f)) {
                      return { ...f, panel: 24, port: "ex12", size: 24 };
                    }
                    return f;
                  }),
                })),
          series: p.series ?? "core",
          heightIn: p.heightIn ?? 120,
          doorSpec: p.doorSpec ?? DEFAULT_DOOR,
          exhaustSpec: p.exhaustSpec ?? DEFAULT_EXHAUST,
        } as { walls: WallSeg[]; series: Series; heightIn: number; doorSpec: DoorSpec; exhaustSpec: ExhaustSpec };
      },
    },
  ),
);
