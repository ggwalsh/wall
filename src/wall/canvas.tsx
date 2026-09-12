import { useEffect, useRef } from "react";
import {
  interiorNormal,
  isExisting,
  leafSizes,
  lengthIn,
  packWall,
  placementOnWall,
  slideClearance,
  snapToJoints,
  type DoorFixture,
  type Placement,
  type WallSeg,
} from "./plan";
import type { ExhaustSpec, Series } from "./pack";
import { useWall } from "./store";

const SNAP = 6;
const PPI = 2.2;

function snap(n: number) {
  return Math.round(n / SNAP) * SNAP;
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function worldFromEvent(
  e: PointerEvent,
  el: HTMLCanvasElement,
  pan: { x: number; y: number },
  zoom: number,
) {
  const r = el.getBoundingClientRect();
  const px = e.clientX - r.left;
  const py = e.clientY - r.top;
  return {
    x: snap((px - pan.x) / (PPI * zoom)),
    y: snap((py - pan.y) / (PPI * zoom)),
  };
}

export function WallCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pan = useRef({ x: 48, y: 48 });
  const zoom = useRef(1);
  const drag = useRef<null | { kind: "pan" | "wall" | "existing"; x: number; y: number; sx: number; sy: number }>(null);
  const hover = useRef<Placement | null>(null);
  const series = useWall((s) => s.series);
  const walls = useWall((s) => s.walls);
  const tool = useWall((s) => s.tool);
  const selected = useWall((s) => s.selected);
  const doorSpec = useWall((s) => s.doorSpec);
  const exhaustSpec = useWall((s) => s.exhaustSpec);
  const addWall = useWall((s) => s.addWall);
  const removeWall = useWall((s) => s.removeWall);
  const addFixture = useWall((s) => s.addFixture);
  const select = useWall((s) => s.select);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const loop = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(ctx, w, h, walls, selected, series, pan.current, zoom.current, drag.current, hover.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [walls, selected, series]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      const p = worldFromEvent(e, canvas, pan.current, zoom.current);
      if (e.button === 1 || e.shiftKey || tool === null) {
        const hit = hitWall(walls, p.x, p.y);
        if (tool === null) select(hit?.id ?? null);
        drag.current = { kind: "pan", x: e.clientX, y: e.clientY, sx: pan.current.x, sy: pan.current.y };
        return;
      }
      if (tool === "wall" || tool === "existing") {
        const joint = snapToJoints(p.x, p.y, walls);
        drag.current = { kind: tool, x: joint.x, y: joint.y, sx: joint.x, sy: joint.y };
        return;
      }
      const hit = hitWall(walls, p.x, p.y, tool === "door" || tool === "exhaust" ? "tws" : "any");
      if (tool === "erase" && hit) {
        removeWall(hit.id);
        return;
      }
      if (tool === "door" && hit) {
        const place = placementOnWall(hit, projectT(hit, p.x, p.y), "door", doorSpec, exhaustSpec, walls);
        if (place?.valid) {
          addFixture(hit.id, { id: uid(), type: "door", offset: place.offset, size: place.size, ...doorSpec, frame: place.size as DoorFixture["frame"] });
        }
        return;
      }
      if (tool === "exhaust" && hit) {
        const place = placementOnWall(hit, projectT(hit, p.x, p.y), "exhaust", doorSpec, exhaustSpec, walls);
        if (place?.valid) {
          addFixture(hit.id, { id: uid(), type: "exhaust", offset: place.offset, size: place.size, ...exhaustSpec });
        }
        return;
      }
      select(hit?.id ?? null);
    };

    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (d) {
        if (d.kind === "pan") {
          pan.current = { x: d.sx + (e.clientX - d.x), y: d.sy + (e.clientY - d.y) };
        } else {
          const pt = worldFromEvent(e, canvas, pan.current, zoom.current);
          const joint = snapToJoints(pt.x, pt.y, walls);
          const dx = joint.x - d.sx;
          const dy = joint.y - d.sy;
          if (Math.abs(dx) >= Math.abs(dy)) {
            d.x = joint.x;
            d.y = d.sy;
          } else {
            d.x = d.sx;
            d.y = joint.y;
          }
        }
        return;
      }
      if (tool === "door" || tool === "exhaust") {
        const pt = worldFromEvent(e, canvas, pan.current, zoom.current);
        const hit = hitWall(walls, pt.x, pt.y, "tws");
        hover.current = hit
          ? placementOnWall(hit, projectT(hit, pt.x, pt.y), tool, doorSpec, exhaustSpec, walls)
          : null;
      } else {
        hover.current = null;
      }
    };

    const onUp = () => {
      const d = drag.current;
      if (d?.kind === "wall" || d?.kind === "existing") {
        const end = snapToJoints(d.x, d.y, walls);
        const x2 = Math.abs(end.x - d.sx) >= Math.abs(end.y - d.sy) ? end.x : d.sx;
        const y2 = Math.abs(end.x - d.sx) >= Math.abs(end.y - d.sy) ? d.sy : end.y;
        const len = Math.hypot(x2 - d.sx, y2 - d.sy);
        if (len >= 12) {
          addWall({
            id: uid(),
            x1: d.sx,
            y1: d.sy,
            x2,
            y2,
            fixtures: [],
            layer: d.kind === "existing" ? "existing" : "tws",
          });
        }
      }
      drag.current = null;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom.current = Math.min(2.4, Math.max(0.4, zoom.current * (e.deltaY > 0 ? 0.92 : 1.08)));
    };

    const onLeave = () => {
      hover.current = null;
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [tool, walls, doorSpec, exhaustSpec, addWall, addFixture, removeWall, select]);

  return (
    <canvas
      ref={canvasRef}
      className="h-[min(70vh,560px)] w-full touch-none rounded-lg bg-ink"
      aria-label="Containment floor plan"
    />
  );
}

function projectT(w: WallSeg, x: number, y: number) {
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const L = Math.hypot(dx, dy) || 1;
  return ((x - w.x1) * dx + (y - w.y1) * dy) / L;
}

function hitWall(walls: WallSeg[], x: number, y: number, layer: "any" | "tws" = "any") {
  let best: WallSeg | null = null;
  let dmin = 8;
  for (const w of walls) {
    if (layer === "tws" && isExisting(w)) continue;
    const t = Math.max(0, Math.min(lengthIn(w), projectT(w, x, y)));
    const px = w.x1 + ((w.x2 - w.x1) / (lengthIn(w) || 1)) * t;
    const py = w.y1 + ((w.y2 - w.y1) / (lengthIn(w) || 1)) * t;
    const d = Math.hypot(px - x, py - y);
    if (d < dmin) {
      dmin = d;
      best = w;
    }
  }
  return best;
}

function along(w: WallSeg, t: number) {
  const L = lengthIn(w) || 1;
  return {
    x: w.x1 + ((w.x2 - w.x1) / L) * t,
    y: w.y1 + ((w.y2 - w.y1) / L) * t,
  };
}

function seriesStroke(series: Series, exhaust: boolean) {
  if (exhaust) return "#8a1a30";
  if (series === "classic") return "#d2b48c";
  if (series === "clear") return "#8eb9c9";
  return "#afafaf";
}

function drawJointTick(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ux: number,
  uy: number,
  zoom: number,
) {
  const r = 5 * zoom;
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(236,234,234,0.9)";
  ctx.lineWidth = 1.35 * zoom;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(x - uy * r, y + ux * r);
  ctx.lineTo(x + uy * r, y - ux * r);
  ctx.stroke();
}

function drawExisting(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  ux: number,
  uy: number,
  s: number,
  zoom: number,
  ghost: boolean,
) {
  ctx.strokeStyle = ghost ? "rgba(110,100,90,0.45)" : "#6a6158";
  ctx.lineWidth = 10 * zoom;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = ghost ? "rgba(90,82,74,0.5)" : "#4a453f";
  ctx.lineWidth = 4 * zoom;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const len = Math.hypot(x2 - x1, y2 - y1);
  const step = 12 * s;
  ctx.strokeStyle = "rgba(30,28,29,0.55)";
  ctx.lineWidth = 1.5 * zoom;
  for (let d = step / 2; d < len; d += step) {
    const px = x1 + ux * d;
    const py = y1 + uy * d;
    ctx.beginPath();
    ctx.moveTo(px - uy * 5 * zoom, py + ux * 5 * zoom);
    ctx.lineTo(px + uy * 5 * zoom, py - ux * 5 * zoom);
    ctx.stroke();
  }
  ctx.fillStyle = "#c4b8a8";
  ctx.font = `${9 * zoom}px "IBM Plex Mono", monospace`;
  ctx.textAlign = "center";
  ctx.fillText("EXISTING", (x1 + x2) / 2 + uy * 14 * zoom, (y1 + y2) / 2 - ux * 14 * zoom);
}

function drawExhaustFlange(
  ctx: CanvasRenderingContext2D,
  wall: WallSeg,
  walls: WallSeg[],
  mx: number,
  my: number,
  ux: number,
  uy: number,
  spec: ExhaustSpec,
  s: number,
  zoom: number,
) {
  const N = interiorNormal(wall, walls, { x: mx / s, y: my / s });
  const ox = -N.nx;
  const oy = -N.ny;
  const collar: Record<string, number> = { ex08: 8, ex10: 10, ex12: 12, ex14: 14 };
  const dia = collar[spec.port];
  const alongW = dia ? Math.min(dia, spec.panel - 2) : spec.port === "exd" ? 14 : 12;
  const depth = 2;
  const hw = (alongW / 2) * s;
  const d = depth * s;
  const gap = 3 * zoom;
  const ix = mx + ox * gap;
  const iy = my + oy * gap;
  const jx = ix + ox * d;
  const jy = iy + oy * d;
  const tx = ux * hw;
  const ty = uy * hw;
  ctx.beginPath();
  ctx.moveTo(ix - tx, iy - ty);
  ctx.lineTo(ix + tx, iy + ty);
  ctx.lineTo(jx + tx, jy + ty);
  ctx.lineTo(jx - tx, jy - ty);
  ctx.closePath();
  ctx.fillStyle = "rgba(138,26,48,0.92)";
  ctx.strokeStyle = "#c43a52";
  ctx.lineWidth = 1.2 * zoom;
  ctx.fill();
  ctx.stroke();
  const tag = dia ? `${dia}"` : spec.port === "exd" ? "DIFF" : "KIT";
  ctx.fillStyle = "#eceaea";
  ctx.font = `${9 * zoom}px "IBM Plex Mono", monospace`;
  ctx.textAlign = "center";
  ctx.fillText(tag, jx + ox * 10 * zoom, jy + oy * 10 * zoom);
}

function draw(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  walls: WallSeg[],
  selected: string | null,
  series: Series,
  pan: { x: number; y: number },
  zoom: number,
  drag: { kind: string; x: number; y: number; sx: number; sy: number } | null,
  hover: Placement | null,
) {
  ctx.fillStyle = "#0c0b0b";
  ctx.fillRect(0, 0, w, h);
  const s = PPI * zoom;
  ctx.save();
  ctx.translate(pan.x, pan.y);

  ctx.strokeStyle = "rgba(175,175,175,0.08)";
  ctx.lineWidth = 1;
  const step = 12 * s;
  const x0 = -pan.x;
  const y0 = -pan.y;
  for (let x = Math.floor(x0 / step) * step; x < x0 + w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y0 + h);
    ctx.stroke();
  }
  for (let y = Math.floor(y0 / step) * step; y < y0 + h; y += step) {
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + w, y);
    ctx.stroke();
  }

  const drawSeg = (a: WallSeg, ghost = false) => {
    const packed = packWall(a);
    const L = lengthIn(a) || 1;
    const ux = (a.x2 - a.x1) / L;
    const uy = (a.y2 - a.y1) / L;
    const thick = 6 * zoom;
    for (const p of packed) {
      const x1 = (a.x1 + ux * p.offset) * s;
      const y1 = (a.y1 + uy * p.offset) * s;
      const x2 = (a.x1 + ux * (p.offset + p.width)) * s;
      const y2 = (a.y1 + uy * (p.offset + p.width)) * s;
      if (p.kind === "door") {
        drawDoor(ctx, a, p.offset, p.width, p.spec as DoorFixture, walls, s, zoom);
        if (!ghost) {
          drawJointTick(ctx, x1, y1, ux, uy, zoom);
          drawJointTick(ctx, x2, y2, ux, uy, zoom);
        }
        continue;
      }
      if (p.kind === "existing") {
        drawExisting(ctx, x1, y1, x2, y2, ux, uy, s, zoom, ghost);
        continue;
      }
      if (p.kind === "gap") {
        ctx.setLineDash([4 * zoom, 4 * zoom]);
        ctx.strokeStyle = "rgba(175,175,175,0.35)";
        ctx.lineWidth = 2 * zoom;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
        if (!ghost) {
          drawJointTick(ctx, x1, y1, ux, uy, zoom);
          drawJointTick(ctx, x2, y2, ux, uy, zoom);
        }
        continue;
      }
      ctx.strokeStyle = ghost
        ? "rgba(175,175,175,0.4)"
        : a.id === selected
          ? "#e2e2e2"
          : seriesStroke(series, false);
      ctx.lineWidth = series === "clear" ? 3.5 * zoom : thick;
      ctx.lineCap = "butt";
      ctx.setLineDash(series === "classic" ? [5 * zoom, 3 * zoom] : []);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (series === "clear") {
        ctx.strokeStyle = "rgba(180, 210, 220, 0.55)";
        ctx.lineWidth = 1.2 * zoom;
        ctx.beginPath();
        ctx.moveTo(x1 + uy * 3 * zoom, y1 - ux * 3 * zoom);
        ctx.lineTo(x2 + uy * 3 * zoom, y2 - ux * 3 * zoom);
        ctx.stroke();
      }
      ctx.fillStyle = "#eceaea";
      ctx.font = `${10 * zoom}px "IBM Plex Mono", monospace`;
      ctx.textAlign = "center";
      ctx.fillText(`${p.width}"`, (x1 + x2) / 2 - uy * 12 * zoom, (y1 + y2) / 2 + ux * 12 * zoom);
      if (p.kind === "exhaust") {
        drawExhaustFlange(ctx, a, walls, (x1 + x2) / 2, (y1 + y2) / 2, ux, uy, p.spec, s, zoom);
      }
      if (!ghost) {
        drawJointTick(ctx, x1, y1, ux, uy, zoom);
        drawJointTick(ctx, x2, y2, ux, uy, zoom);
      }
    }
    const feet = (L / 12).toFixed(L % 12 === 0 ? 0 : 1);
    ctx.fillStyle = "#8c8888";
    ctx.font = `${10 * zoom}px "IBM Plex Mono", monospace`;
    ctx.textAlign = "center";
    ctx.fillText(`${feet}'`, ((a.x1 + a.x2) / 2) * s + uy * 16 * s * 0.4, ((a.y1 + a.y2) / 2) * s - ux * 16 * s * 0.4);
  };

  for (const wall of walls) drawSeg(wall);
  if (drag?.kind === "wall" || drag?.kind === "existing") {
    drawSeg(
      {
        id: "ghost",
        x1: drag.sx,
        y1: drag.sy,
        x2: drag.x,
        y2: drag.y,
        fixtures: [],
        layer: drag.kind === "existing" ? "existing" : "tws",
      },
      true,
    );
  }
  if (hover) {
    const wall = walls.find((x) => x.id === hover.wallId);
    if (wall) drawGhost(ctx, wall, hover, walls, s, zoom);
  }
  ctx.restore();
}

function drawDoor(
  ctx: CanvasRenderingContext2D,
  wall: WallSeg,
  offset: number,
  size: number,
  spec: DoorFixture,
  walls: WallSeg[],
  s: number,
  zoom: number,
) {
  const N = interiorNormal(wall, walls);
  const L = lengthIn(wall) || 1;
  const ux = (wall.x2 - wall.x1) / L;
  const uy = (wall.y2 - wall.y1) / L;
  const p0 = along(wall, offset);
  const p1 = along(wall, offset + size);
  const swing = spec.swing === "in" ? N : { nx: -N.nx, ny: -N.ny };
  const leftDir = { x: N.ny, y: -N.nx };
  const hingeAtStart = (p0.x - p1.x) * leftDir.x + (p0.y - p1.y) * leftDir.y > 0
    ? spec.hand === "left"
    : spec.hand !== "left";

  ctx.strokeStyle = "#b32440";
  ctx.lineWidth = 2 * zoom;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(p0.x * s, p0.y * s);
  ctx.lineTo(p1.x * s, p1.y * s);
  ctx.stroke();

  if (spec.style === "slide") {
    const bay = slideClearance(spec);
    const leftJamb =
      (p0.x - p1.x) * leftDir.x + (p0.y - p1.y) * leftDir.y > 0 ? p0 : p1;
    const jamb = spec.hand === "left" ? leftJamb : leftJamb === p0 ? p1 : p0;
    const other = jamb.x === p0.x && jamb.y === p0.y ? p1 : p0;
    const dx = jamb.x - other.x;
    const dy = jamb.y - other.y;
    const mag = Math.hypot(dx, dy) || 1;
    const pocket = { x: jamb.x + (dx / mag) * bay, y: jamb.y + (dy / mag) * bay };
    ctx.setLineDash([5 * zoom, 4 * zoom]);
    ctx.strokeStyle = "#c43a52";
    ctx.lineWidth = 5 * zoom;
    ctx.beginPath();
    ctx.moveTo(jamb.x * s + swing.nx * 4, jamb.y * s + swing.ny * 4);
    ctx.lineTo(pocket.x * s + swing.nx * 4, pocket.y * s + swing.ny * 4);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#eceaea";
    ctx.font = `${10 * zoom}px "IBM Plex Mono", monospace`;
    ctx.textAlign = "center";
    const mid = { x: (jamb.x + pocket.x) / 2, y: (jamb.y + pocket.y) / 2 };
    ctx.fillText(`${bay / 12}' SLIDE`, mid.x * s, mid.y * s - 8 * zoom);
    ctx.fillText("SLIDE", ((p0.x + p1.x) / 2) * s, ((p0.y + p1.y) / 2) * s - 10 * zoom);
    return;
  }

  const leaves = spec.style === "double" ? [24, 44] : leafSizes(spec);
  if (spec.style === "double") {
    const leftIsStart = hingeAtStart;
    const secondaryHinge = leftIsStart ? p0 : p1;
    const primaryHinge = leftIsStart ? p1 : p0;
    const secDir = leftIsStart ? 1 : -1;
    const priDir = leftIsStart ? -1 : 1;
    strokeLeaf(ctx, secondaryHinge, 24, ux * secDir, uy * secDir, swing, s, zoom);
    strokeLeaf(ctx, primaryHinge, 44, ux * priDir, uy * priDir, swing, s, zoom);
    ctx.fillStyle = "#eceaea";
    ctx.font = `${10 * zoom}px "IBM Plex Mono", monospace`;
    ctx.textAlign = "center";
    ctx.fillText("DBL", ((p0.x + p1.x) / 2) * s, ((p0.y + p1.y) / 2) * s);
    return;
  }

  const leaf = leaves[0];
  const hinge = hingeAtStart ? p0 : p1;
  const closedDir = hingeAtStart ? 1 : -1;
  strokeLeaf(ctx, hinge, leaf, ux * closedDir, uy * closedDir, swing, s, zoom);
  ctx.fillStyle = "#eceaea";
  ctx.font = `${10 * zoom}px "IBM Plex Mono", monospace`;
  ctx.textAlign = "center";
  ctx.fillText("DOOR", ((p0.x + p1.x) / 2) * s, ((p0.y + p1.y) / 2) * s);
}

function drawGhost(
  ctx: CanvasRenderingContext2D,
  wall: WallSeg,
  hover: Placement,
  walls: WallSeg[],
  s: number,
  zoom: number,
) {
  ctx.save();
  ctx.globalAlpha = hover.valid ? 0.55 : 0.72;
  const L = lengthIn(wall) || 1;
  const ux = (wall.x2 - wall.x1) / L;
  const uy = (wall.y2 - wall.y1) / L;
  const a = along(wall, hover.offset);
  const b = along(wall, hover.offset + hover.size);
  const color = hover.valid ? "#afafaf" : "#b32440";

  if (hover.kind === "door" && hover.door) {
    drawDoor(
      ctx,
      wall,
      hover.offset,
      hover.size,
      { id: "ghost", type: "door", offset: hover.offset, size: hover.size, ...hover.door },
      walls,
      s,
      zoom,
    );
  } else if (hover.kind === "exhaust" && hover.exhaust) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 6 * zoom;
    ctx.beginPath();
    ctx.moveTo(a.x * s, a.y * s);
    ctx.lineTo(b.x * s, b.y * s);
    ctx.stroke();
    drawExhaustFlange(
      ctx,
      wall,
      walls,
      ((a.x + b.x) / 2) * s,
      ((a.y + b.y) / 2) * s,
      ux,
      uy,
      hover.exhaust,
      s,
      zoom,
    );
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = 7 * zoom;
    ctx.beginPath();
    ctx.moveTo(a.x * s, a.y * s);
    ctx.lineTo(b.x * s, b.y * s);
    ctx.stroke();
  }

  if (hover.pocket) {
    const p0 = along(wall, Math.max(0, hover.pocket.start));
    const p1 = along(wall, Math.min(L, hover.pocket.end));
    ctx.setLineDash([6 * zoom, 4 * zoom]);
    ctx.strokeStyle = hover.valid ? "rgba(175,175,175,0.9)" : "#b32440";
    ctx.lineWidth = 8 * zoom;
    ctx.beginPath();
    ctx.moveTo(p0.x * s + uy * 5, p0.y * s - ux * 5);
    ctx.lineTo(p1.x * s + uy * 5, p1.y * s - ux * 5);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const label = hover.valid ? "click to place" : (hover.reason ?? "can't place");
  ctx.globalAlpha = 1;
  ctx.fillStyle = hover.valid ? "#eceaea" : "#ff6b7f";
  ctx.font = `${11 * zoom}px "IBM Plex Mono", monospace`;
  ctx.textAlign = "center";
  ctx.fillText(label, ((a.x + b.x) / 2) * s, ((a.y + b.y) / 2) * s + 18 * zoom);
  ctx.restore();
}

function strokeLeaf(
  ctx: CanvasRenderingContext2D,
  hinge: { x: number; y: number },
  leaf: number,
  cux: number,
  cuy: number,
  swing: { nx: number; ny: number },
  s: number,
  zoom: number,
) {
  const closed = { x: hinge.x + cux * leaf, y: hinge.y + cuy * leaf };
  const open = { x: hinge.x + swing.nx * leaf, y: hinge.y + swing.ny * leaf };
  ctx.strokeStyle = "#e8e6e6";
  ctx.lineWidth = 1.6 * zoom;
  ctx.beginPath();
  ctx.moveTo(hinge.x * s, hinge.y * s);
  ctx.lineTo(open.x * s, open.y * s);
  ctx.stroke();
  const a0 = Math.atan2(closed.y - hinge.y, closed.x - hinge.x);
  const a1 = Math.atan2(open.y - hinge.y, open.x - hinge.x);
  const cross = cux * swing.ny - cuy * swing.nx;
  ctx.strokeStyle = "rgba(179,36,64,0.85)";
  ctx.lineWidth = 1.2 * zoom;
  ctx.beginPath();
  ctx.arc(hinge.x * s, hinge.y * s, leaf * s, a0, a1, cross < 0);
  ctx.stroke();
}

export function fitPlanView(walls: WallSeg[], w: number, h: number, pad = 56) {
  if (!walls.length) return { pan: { x: pad, y: pad }, zoom: 1 };
  let minx = Infinity;
  let miny = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;
  for (const wall of walls) {
    minx = Math.min(minx, wall.x1, wall.x2);
    miny = Math.min(miny, wall.y1, wall.y2);
    maxx = Math.max(maxx, wall.x1, wall.x2);
    maxy = Math.max(maxy, wall.y1, wall.y2);
  }
  const bw = Math.max(12, maxx - minx);
  const bh = Math.max(12, maxy - miny);
  const zoom = Math.min((w - pad * 2) / (bw * PPI), (h - pad * 2) / (bh * PPI), 2.2);
  return {
    pan: {
      x: pad - minx * PPI * zoom + (w - pad * 2 - bw * PPI * zoom) / 2,
      y: pad - miny * PPI * zoom + (h - pad * 2 - bh * PPI * zoom) / 2,
    },
    zoom,
  };
}

export function renderWallPlan(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  walls: WallSeg[],
  series: Series,
) {
  const view = fitPlanView(walls, w, h);
  draw(ctx, w, h, walls, null, series, view.pan, view.zoom, null, null);
}
