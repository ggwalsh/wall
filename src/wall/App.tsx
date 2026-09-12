import { type ReactNode, useEffect } from "react";
import type { OnBrand } from "../shared/brand";
import { WallCanvas } from "./canvas";
import { doorFrameFor, type DoorFrame, type ExhaustPort, type ExhaustPanel } from "./pack";
import { downloadWallPdf } from "./pdf";
import { buildBom, cornersAndEnds, isExisting, lengthIn } from "./plan";
import { useWall, type Tool } from "./store";
import { cn } from "../shared/cn";


const TOOLS: { id: Tool; label: string }[] = [
  { id: "existing", label: "Existing" },
  { id: "wall", label: "Wall" },
  { id: "door", label: "Door" },
  { id: "exhaust", label: "Exhaust" },
  { id: "erase", label: "Erase" },
];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-full px-3 text-xs",
        active ? "bg-amaranth text-fg" : "border border-line text-silver hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

export function WallApp({ onBrand, homeHref = "./" }: { onBrand?: OnBrand; homeHref?: string }) {
  const walls = useWall((s) => s.walls);
  const series = useWall((s) => s.series);
  const heightIn = useWall((s) => s.heightIn);
  const tool = useWall((s) => s.tool);
  const selected = useWall((s) => s.selected);
  const doorSpec = useWall((s) => s.doorSpec);
  const exhaustSpec = useWall((s) => s.exhaustSpec);
  const setTool = useWall((s) => s.setTool);
  const setSeries = useWall((s) => s.setSeries);
  const setHeight = useWall((s) => s.setHeight);
  const setDoorSpec = useWall((s) => s.setDoorSpec);
  const setExhaustSpec = useWall((s) => s.setExhaustSpec);
  const loadSample = useWall((s) => s.loadSample);
  const clear = useWall((s) => s.clear);
  const removeWall = useWall((s) => s.removeWall);
  const setBrand = onBrand ?? (() => {});
  const undo = useWall((s) => s.undo);
  const redo = useWall((s) => s.redo);
  const canUndo = useWall((s) => s.past.length > 0);
  const canRedo = useWall((s) => s.future.length > 0);

  useEffect(() => {
    setBrand("think");
    return () => setBrand("idle");
  }, [setBrand]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selected) removeWall(selected);
      }
      if (e.key === "Escape") setTool(null);
      if (e.key === "b") setTool("existing");
      if (e.key === "d") setTool("door");
      if (e.key === "x") setTool("exhaust");
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, removeWall, setTool, undo, redo]);

  const tall = heightIn > 123;
  const bom = buildBom(walls, series, tall);
  const tws = walls.filter((w) => !isExisting(w));
  const existing = walls.filter(isExisting);
  const run = tws.reduce((n, w) => n + lengthIn(w), 0);
  const existRun = existing.reduce((n, w) => n + lengthIn(w), 0);
  const meta = cornersAndEnds(walls);

  function copyBom() {
    const text = bom.map((l) => `${l.qty}\t${l.sku}\t${l.name}`).join("\n");
    void navigator.clipboard.writeText(text);
    setBrand("done");
    window.setTimeout(() => setBrand("think"), 1600);
  }

  function exportPdf() {
    try {
      downloadWallPdf({ walls, series, heightIn, bom, twsFt: run / 12 });
      setBrand("done");
      window.setTimeout(() => setBrand("think"), 1600);
    } catch (err) {
      console.error(err);
    }
  }

  function pickTool(id: Tool) {
    setTool(tool === id ? null : id);
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
      <p className="font-mono text-xs tracking-widest text-accent uppercase">
        <a href={homeHref} className="hover:text-fg">
          My tools
        </a>
        {" · 01 · Wall"}
        <a href="https://github.com/ggwalsh/wall" className="ml-3 text-silver hover:text-fg" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Wall</h1>
      <p className="mt-4 max-w-2xl text-muted">
        Sketch a containment. The kit fills in from the SHIELD WALL catalogue:
        panels, corners, every door style, exhaust frames and collars.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-2">
        {TOOLS.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => pickTool(t.id)}
            className={cn(
              "min-h-11 rounded-full px-4 text-sm",
              tool === t.id ? "bg-amaranth text-fg" : "border border-line text-silver hover:text-fg",
            )}
          >
            {t.label}
          </button>
        ))}
        <span className="mx-2 hidden h-6 w-px bg-line sm:block" />
        {(["core", "classic", "clear"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSeries(s)}
            className={cn(
              "min-h-11 rounded-full px-4 text-sm capitalize",
              series === s ? "bg-surface text-fg ring-1 ring-silver" : "text-muted hover:text-fg",
            )}
            title={s === "core" ? "Solid insulated" : s === "classic" ? "Dashed polycarbonate" : "Clear double-line"}
          >
            {s}
          </button>
        ))}
      </div>

      {tool === "door" ? (
        <div className="mt-4 space-y-2 rounded-lg border border-line bg-surface p-4">
          <p className="font-mono text-xs tracking-widest text-muted uppercase">Door</p>
          <div className="flex flex-wrap gap-2">
            <Chip active={doorSpec.style === "swing"} onClick={() => setDoorSpec({ style: "swing", frame: 36 })}>
              Universal swing
            </Chip>
            <Chip active={doorSpec.style === "slide"} onClick={() => setDoorSpec({ style: "slide", frame: 48 })}>
              Sliding
            </Chip>
            <Chip active={doorSpec.style === "double"} onClick={() => setDoorSpec({ style: "double", frame: 72 })}>
              Double hinged
            </Chip>
          </div>
          {doorSpec.style === "swing" ? (
            <div className="flex flex-wrap gap-2">
              <Chip active={doorSpec.frame === 36} onClick={() => setDoorSpec({ frame: 36 })}>
                32" leaf / 36" frame
              </Chip>
              <Chip active={doorSpec.frame === 48} onClick={() => setDoorSpec({ frame: 48 })}>
                44" leaf / 48" frame
              </Chip>
              <Chip active={doorSpec.swing === "in"} onClick={() => setDoorSpec({ swing: "in" })}>
                Swing in
              </Chip>
              <Chip active={doorSpec.swing === "out"} onClick={() => setDoorSpec({ swing: "out" })}>
                Swing out
              </Chip>
              <Chip active={doorSpec.hand === "left"} onClick={() => setDoorSpec({ hand: "left" })}>
                Hung left
              </Chip>
              <Chip active={doorSpec.hand === "right"} onClick={() => setDoorSpec({ hand: "right" })}>
                Hung right
              </Chip>
            </div>
          ) : null}
          {doorSpec.style === "slide" ? (
            <div className="flex flex-wrap gap-2">
              <Chip active={doorSpec.frame === 48} onClick={() => setDoorSpec({ frame: 48 })}>
                42" leaf / 48" frame
              </Chip>
              <Chip active={doorSpec.frame === 60} onClick={() => setDoorSpec({ frame: 60 as DoorFrame })}>
                54" leaf / 60" frame
              </Chip>
              <Chip active={doorSpec.hand === "left"} onClick={() => setDoorSpec({ hand: "left" })}>
                Opens left
              </Chip>
              <Chip active={doorSpec.hand === "right"} onClick={() => setDoorSpec({ hand: "right" })}>
                Opens right
              </Chip>
            </div>
          ) : null}
          {doorSpec.style === "double" ? (
            <div className="flex flex-wrap gap-2">
              <Chip active={doorSpec.swing === "in"} onClick={() => setDoorSpec({ swing: "in" })}>
                Swing in
              </Chip>
              <Chip active={doorSpec.swing === "out"} onClick={() => setDoorSpec({ swing: "out" })}>
                Swing out
              </Chip>
            </div>
          ) : null}
          {doorSpec.style === "slide" ? (
            <p className="text-xs text-muted">
              {doorSpec.frame === 60
                ? "54\" slider needs 4' of panel on the open side (can be mixed widths) before a corner."
                : "42\" slider needs 3' of panel on the open side (can be mixed widths) before a corner."}{" "}
              Hover to see the bay. It won't place if the run is too short.
            </p>
          ) : (
            <p className="text-xs text-muted">
              Places a {doorFrameFor(doorSpec)}" frame. Hover for a ghost, then click a wall.
            </p>
          )}
        </div>
      ) : null}

      {tool === "exhaust" ? (
        <div className="mt-4 space-y-2 rounded-lg border border-line bg-surface p-4">
          <p className="font-mono text-xs tracking-widest text-muted uppercase">Exhaust</p>
          <div className="flex flex-wrap gap-2">
            {([18, 24] as ExhaustPanel[]).map((n) => (
              <Chip key={n} active={exhaustSpec.panel === n} onClick={() => setExhaustSpec({ panel: n })}>
                {n}" panel
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["ex08", '8" collar'],
                ["ex10", '10" collar'],
                ["ex12", '12" collar'],
                ["ex14", '14" collar'],
                ["exd", "Diffuser + filter"],
                ["exk", "Security kit"],
              ] as [ExhaustPort, string][]
            ).map(([id, label]) => (
              <Chip key={id} active={exhaustSpec.port === id} onClick={() => setExhaustSpec({ port: id })}>
                {label}
              </Chip>
            ))}
          </div>
          <p className="text-xs text-muted">
            Port frame is on the {exhaustSpec.panel}" panel. Collar / plate is a separate line in the kit.
            Hover the run to preview.
          </p>
        </div>
      ) : null}

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="overflow-hidden rounded-lg border border-line">
          <WallCanvas />
          <p className="border-t border-line px-4 py-2 font-mono text-xs text-muted">
            Pick Existing to sketch the building, then Wall for TWS against it. Door and Exhaust
            ghost on TWS only. Core is solid, Classic dashed, Clear is a double line.
          </p>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-lg border border-line bg-surface p-4">
            <p className="font-mono text-xs tracking-widest text-accent uppercase">Run</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{(run / 12).toFixed(1)} ft TWS</p>
            <p className="mt-1 text-xs text-muted">
              {tws.length} walls · {meta.corners} corners · {meta.tees} tees · {meta.ends} seals
              {existRun ? ` · ${(existRun / 12).toFixed(1)} ft existing` : ""}
            </p>
            <label className="mt-4 flex flex-col gap-1 text-xs text-muted">
              Ceiling height (in)
              <input
                className="min-h-11 rounded-sm border border-line bg-ink px-3 text-sm text-fg tabular-nums"
                value={heightIn}
                onChange={(e) => setHeight(Number(e.target.value) || 120)}
              />
            </label>
            {tall ? (
              <p className="mt-2 text-xs text-accent">Over 10'3" — 3' extensions added to the kit.</p>
            ) : null}
          </div>

          <div className="flex-1 rounded-lg border border-line bg-surface p-4">
            <div className="flex items-center justify-between">
              <p className="font-mono text-xs tracking-widest text-accent uppercase">Kit</p>
              <div className="flex gap-3">
                <button type="button" onClick={copyBom} className="text-xs text-silver hover:text-fg">
                  Copy
                </button>
                <button type="button" onClick={exportPdf} className="text-xs text-silver hover:text-fg">
                  PDF
                </button>
              </div>
            </div>
            <ul className="mt-3 max-h-80 space-y-2 overflow-auto">
              {bom.map((line) => (
                <li key={line.sku} className="flex items-baseline justify-between gap-3 text-sm">
                  <span>
                    <span className="font-mono text-xs text-muted">{line.sku}</span>
                    <span className="mt-0.5 block text-fg">{line.name}</span>
                  </span>
                  <span className="tabular-nums text-silver">{line.qty}</span>
                </li>
              ))}
              {bom.length === 0 ? <li className="text-sm text-muted">Draw a wall.</li> : null}
            </ul>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              className="min-h-11 flex-1 rounded-full border border-line text-sm text-silver hover:text-fg disabled:opacity-30"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              className="min-h-11 flex-1 rounded-full border border-line text-sm text-silver hover:text-fg disabled:opacity-30"
            >
              Redo
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={loadSample} className="min-h-11 flex-1 rounded-full border border-line text-sm text-silver hover:text-fg">
              Sample room
            </button>
            <button type="button" onClick={clear} className="min-h-11 flex-1 rounded-full border border-line text-sm text-muted hover:text-accent">
              Reset plan
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}
