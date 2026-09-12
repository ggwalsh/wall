import {
  doorFrameFor,
  doorLabel,
  doorSku,
  exhaustPanelSku,
  packLength,
  PORT_SKU,
  skuForPanel,
  type DoorSpec,
  type ExhaustSpec,
  type PanelWidth,
  type Series,
} from "./pack";

export type DoorFixture = DoorSpec & {
  id: string;
  type: "door";
  offset: number;
  size: number;
};

export type ExhaustFixture = ExhaustSpec & {
  id: string;
  type: "exhaust";
  offset: number;
  size: number;
};

export type Fixture = DoorFixture | ExhaustFixture;

export type WallSeg = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  fixtures: Fixture[];
  layer?: "tws" | "existing";
};

export function isExisting(w: WallSeg) {
  return w.layer === "existing";
}

export function lengthIn(w: WallSeg) {
  return Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
}

export function isH(w: WallSeg) {
  return Math.abs(w.y2 - w.y1) < Math.abs(w.x2 - w.x1);
}

function key(x: number, y: number) {
  return `${Math.round(x)},${Math.round(y)}`;
}

export type Packed =
  | { offset: number; width: PanelWidth; kind: "panel" }
  | { offset: number; width: number; kind: "door"; spec: DoorSpec }
  | { offset: number; width: number; kind: "exhaust"; spec: ExhaustSpec }
  | { offset: number; width: number; kind: "gap" }
  | { offset: number; width: number; kind: "existing" };

export function packWall(w: WallSeg): Packed[] {
  const L = lengthIn(w);
  if (isExisting(w)) return [{ offset: 0, width: L, kind: "existing" }];
  const fixtures = [...w.fixtures].sort((a, b) => a.offset - b.offset);
  const spans: { start: number; end: number; fix?: Fixture }[] = [];
  let cursor = 0;
  for (const f of fixtures) {
    const start = Math.max(0, Math.min(Math.max(0, L - f.size), f.offset));
    if (start > cursor) spans.push({ start: cursor, end: start });
    spans.push({ start, end: start + f.size, fix: f });
    cursor = start + f.size;
  }
  if (cursor < L) spans.push({ start: cursor, end: L });

  const out: Packed[] = [];
  for (const s of spans) {
    if (s.fix?.type === "door") {
      out.push({ offset: s.start, width: s.fix.size, kind: "door", spec: s.fix });
      continue;
    }
    if (s.fix?.type === "exhaust") {
      out.push({ offset: s.start, width: s.fix.size, kind: "exhaust", spec: s.fix });
      continue;
    }
    let o = s.start;
    const span = s.end - s.start;
    const panels = packLength(span);
    let used = 0;
    for (const p of panels) {
      out.push({ offset: o, width: p, kind: "panel" });
      o += p;
      used += p;
    }
    if (span - used > 0.5) out.push({ offset: o, width: span - used, kind: "gap" });
  }
  return out;
}

export function snapFixtureOffset(wall: WallSeg, size: number, t: number): number | null {
  const L = lengthIn(wall);
  if (L + 0.01 < size) return null;
  const packed = packWall(wall);
  let best: number | null = null;
  let bestDist = 1e9;
  for (const p of packed) {
    if (p.kind === "panel" && p.width === size) {
      const mid = p.offset + p.width / 2;
      const d = Math.abs(mid - t);
      if (d < bestDist) {
        bestDist = d;
        best = p.offset;
      }
    }
  }
  if (best !== null && bestDist <= size * 0.75 + 3) return best;
  const snapped = Math.round((t - size / 2) / 6) * 6;
  return Math.max(0, Math.min(L - size, snapped));
}

export function snapToJoints(x: number, y: number, walls: WallSeg[], inches = 8) {
  let best = { x, y };
  let dmin = inches;
  for (const w of walls) {
    for (const p of [
      [w.x1, w.y1],
      [w.x2, w.y2],
    ] as const) {
      const d = Math.hypot(p[0] - x, p[1] - y);
      if (d <= dmin) {
        dmin = d;
        best = { x: p[0], y: p[1] };
      }
    }
  }
  return best;
}

function pointInPlan(x: number, y: number, walls: WallSeg[]) {
  let n = 0;
  for (const w of walls) {
    const x1 = w.x1;
    const y1 = w.y1;
    const x2 = w.x2;
    const y2 = w.y2;
    const crosses = y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1 || 1e-9) + x1;
    if (crosses) n += 1;
  }
  return n % 2 === 1;
}

export function interiorNormal(w: WallSeg, walls: WallSeg[], at?: { x: number; y: number }) {
  const L = lengthIn(w) || 1;
  const ux = (w.x2 - w.x1) / L;
  const uy = (w.y2 - w.y1) / L;
  const left = { nx: -uy, ny: ux };
  const right = { nx: uy, ny: -ux };
  const mx = at?.x ?? (w.x1 + w.x2) / 2;
  const my = at?.y ?? (w.y1 + w.y2) / 2;
  const probe = 12;
  const leftPt = { x: mx + left.nx * probe, y: my + left.ny * probe };
  const rightPt = { x: mx + right.nx * probe, y: my + right.ny * probe };

  const tws = walls.filter((x) => !isExisting(x));
  const pick = (set: WallSeg[]) => {
    const l = pointInPlan(leftPt.x, leftPt.y, set);
    const r = pointInPlan(rightPt.x, rightPt.y, set);
    if (l !== r) return l ? left : right;
    return null;
  };

  const fromTws = pick(tws.length ? tws : walls);
  if (fromTws) return fromTws;
  const fromAll = pick(walls);
  if (fromAll) return fromAll;

  const c = centroid(tws.length ? tws : walls);
  const toward = { x: c.x - mx, y: c.y - my };
  if (left.nx * toward.x + left.ny * toward.y >= 0) return left;
  return right;
}

function centroid(walls: WallSeg[]) {
  let x = 0;
  let y = 0;
  let wsum = 0;
  for (const w of walls) {
    const len = lengthIn(w);
    x += ((w.x1 + w.x2) / 2) * len;
    y += ((w.y1 + w.y2) / 2) * len;
    wsum += len;
  }
  return { x: x / (wsum || 1), y: y / (wsum || 1) };
}

export function leafSizes(spec: DoorSpec): number[] {
  if (spec.style === "double") return [24, 44];
  if (spec.style === "slide") return [spec.frame === 60 ? 54 : 42];
  return [spec.frame === 48 ? 44 : 32];
}

export function slideClearance(spec: DoorSpec) {
  if (spec.style !== "slide") return 0;
  return spec.frame === 60 ? 48 : 36;
}

export function slideSide(wall: WallSeg, spec: DoorSpec, walls: WallSeg[]): "start" | "end" {
  const N = interiorNormal(wall, walls);
  const leftDir = { x: N.ny, y: -N.nx };
  const towardStart = { x: wall.x1 - wall.x2, y: wall.y1 - wall.y2 };
  const startIsLeft = towardStart.x * leftDir.x + towardStart.y * leftDir.y > 0;
  return spec.hand === "left" === startIsLeft ? "start" : "end";
}

export type Placement = {
  wallId: string;
  offset: number;
  size: number;
  kind: "door" | "exhaust";
  valid: boolean;
  reason?: string;
  door?: DoorSpec;
  exhaust?: ExhaustSpec;
  pocket?: { start: number; end: number };
};

function overlaps(wall: WallSeg, start: number, end: number, doorsOnly = false) {
  return wall.fixtures.some((f) => {
    if (doorsOnly && f.type !== "door") return false;
    return start < f.offset + f.size && f.offset < end;
  });
}

export function placementOnWall(
  wall: WallSeg,
  t: number,
  kind: "door" | "exhaust",
  doorSpec: DoorSpec,
  exhaustSpec: ExhaustSpec,
  walls: WallSeg[],
): Placement | null {
  if (isExisting(wall)) return null;
  if (kind === "exhaust") {
    const size = exhaustSpec.panel;
    const offset = snapFixtureOffset(wall, size, t);
    if (offset === null) return { wallId: wall.id, offset: 0, size, kind, valid: false, reason: "Wall too short", exhaust: exhaustSpec };
    const valid = !overlaps(wall, offset, offset + size);
    return {
      wallId: wall.id,
      offset,
      size,
      kind,
      valid,
      reason: valid ? undefined : "Overlaps another opening",
      exhaust: exhaustSpec,
    };
  }

  const size = doorFrameFor(doorSpec);
  const L = lengthIn(wall);
  const clearance = slideClearance(doorSpec);
  const side = clearance ? slideSide(wall, doorSpec, walls) : "end";
  if (L + 0.01 < size + clearance) {
    return {
      wallId: wall.id,
      offset: 0,
      size,
      kind,
      valid: false,
      door: doorSpec,
      reason: clearance
        ? `Needs ${clearance / 12}' of panel beside a ${size}" slider`
        : "Wall too short",
    };
  }

  let offset = snapFixtureOffset(wall, size, t);
  if (offset === null) return null;
  if (clearance) {
    if (side === "start" && offset < clearance) offset = Math.round(clearance / 6) * 6;
    if (side === "end" && offset + size + clearance > L) {
      offset = Math.round((L - size - clearance) / 6) * 6;
    }
    offset = Math.max(0, Math.min(L - size, offset));
  }

  const pocket =
    clearance === 0
      ? undefined
      : side === "start"
        ? { start: offset - clearance, end: offset }
        : { start: offset + size, end: offset + size + clearance };

  const room = side === "start" ? offset : L - (offset + size);
  let valid = !overlaps(wall, offset, offset + size);
  let reason = valid ? undefined : "Overlaps another opening";
  if (clearance) {
    if (room + 0.01 < clearance) {
      valid = false;
      reason = `Needs ${clearance / 12}' of panel to slide into`;
    } else if (pocket && overlaps(wall, pocket.start, pocket.end, true)) {
      valid = false;
      reason = "Slide bay hits another door";
    }
  }

  return { wallId: wall.id, offset, size, kind, valid, reason, door: doorSpec, pocket };
}

export type BomLine = { sku: string; name: string; qty: number };

export function cornersAndEnds(walls: WallSeg[]) {
  const nodes = new Map<string, { x: number; y: number; tws: string[]; exist: number }>();
  const add = (w: WallSeg, x: number, y: number, dir: string) => {
    const k = key(x, y);
    const n = nodes.get(k) ?? { x, y, tws: [], exist: 0 };
    if (isExisting(w)) n.exist += 1;
    else n.tws.push(dir);
    nodes.set(k, n);
  };
  for (const w of walls) {
    const h = isH(w);
    add(w, w.x1, w.y1, h ? "h" : "v");
    add(w, w.x2, w.y2, h ? "h" : "v");
  }
  let corners = 0;
  let tees = 0;
  let ends = 0;
  for (const n of nodes.values()) {
    if (n.tws.length === 1) ends += 1;
    else if (n.tws.length === 2) {
      if (n.tws[0] !== n.tws[1]) corners += 1;
    } else if (n.tws.length >= 3) tees += 1;
  }
  return { corners, tees, ends };
}

export function buildBom(walls: WallSeg[], series: Series, tall: boolean): BomLine[] {
  const qty = new Map<string, { name: string; qty: number }>();
  const add = (sku: string, name: string, n = 1) => {
    const cur = qty.get(sku);
    if (cur) cur.qty += n;
    else qty.set(sku, { name, qty: n });
  };

  let panelCount = 0;
  for (const w of walls) {
    if (isExisting(w)) continue;
    for (const p of packWall(w)) {
      if (p.kind === "gap" || p.kind === "existing") continue;
      if (p.kind === "door") {
        const d = doorSku(series, p.spec);
        add(d.sku, doorLabel(p.spec));
        if (tall) add(d.x3, `${d.name} 3' extension`);
        panelCount += p.spec.style === "slide" ? 2 : 1;
      } else if (p.kind === "exhaust") {
        const ep = exhaustPanelSku(series, p.spec.panel);
        add(ep, `${p.spec.panel}" panel with exhaust port frame`);
        const port = PORT_SKU[p.spec.port];
        add(port.sku, port.name);
        if (tall) add(`${ep}-X3`, `${p.spec.panel}" exhaust 3' extension`);
        panelCount += 1;
      } else {
        add(skuForPanel(series, p.width), `${p.width}" ${series} panel`);
        if (tall) add(`${skuForPanel(series, p.width)}-X3`, `${p.width}" 3' extension`);
        panelCount += 1;
      }
    }
  }

  const { corners, tees, ends } = cornersAndEnds(walls);
  if (corners) {
    add("SW-CFI", "Fixed 90° inside corner", corners);
    if (tall) add("SW-CFI-X3", "Corner 3' extension", corners);
  }
  if (tees) {
    add("SW-TI", "T-connection inward", tees);
    if (tall) add("SW-TI-X3", "T-connection 3' extension", tees);
  }
  if (ends) add("SW-WSA", "Wall seal extension kit", ends);
  if (panelCount) {
    const carts = Math.max(1, Math.ceil(panelCount / (series === "core" ? 9 : 8)));
    add(
      series === "core" ? "SW-CART" : "SW-CARTLD",
      series === "core" ? "Heavy-duty transport cart" : "Light-duty transport cart",
      carts,
    );
  }

  return [...qty.entries()].map(([sku, v]) => ({ sku, name: v.name, qty: v.qty }));
}

export const SAMPLE_WALLS: WallSeg[] = [
  { id: "ex-n", x1: 0, y1: 0, x2: 384, y2: 0, fixtures: [], layer: "existing" },
  { id: "ex-e", x1: 384, y1: 0, x2: 384, y2: 288, fixtures: [], layer: "existing" },
  { id: "ex-w", x1: 0, y1: 0, x2: 0, y2: 288, fixtures: [], layer: "existing" },
  { id: "ex-s", x1: 384, y1: 288, x2: 240, y2: 288, fixtures: [], layer: "existing" },
  {
    id: "tws-e",
    x1: 240,
    y1: 0,
    x2: 240,
    y2: 180,
    fixtures: [{ id: "exh", type: "exhaust", offset: 60, size: 24, panel: 24, port: "ex12" }],
    layer: "tws",
  },
  {
    id: "tws-s",
    x1: 240,
    y1: 180,
    x2: 0,
    y2: 180,
    fixtures: [
      {
        id: "airlock",
        type: "door",
        offset: 96,
        size: 36,
        style: "swing",
        frame: 36,
        swing: "in",
        hand: "left",
      },
    ],
    layer: "tws",
  },
  { id: "ar-w", x1: 72, y1: 180, x2: 72, y2: 252, fixtures: [], layer: "tws" },
  {
    id: "ar-s",
    x1: 72,
    y1: 252,
    x2: 168,
    y2: 252,
    fixtures: [
      {
        id: "entry",
        type: "door",
        offset: 30,
        size: 36,
        style: "swing",
        frame: 36,
        swing: "out",
        hand: "right",
      },
    ],
    layer: "tws",
  },
  { id: "ar-e", x1: 168, y1: 252, x2: 168, y2: 180, fixtures: [], layer: "tws" },
];
