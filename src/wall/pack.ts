export const PANEL_WIDTHS = [48, 36, 24, 18, 12] as const;
export type PanelWidth = (typeof PANEL_WIDTHS)[number];
export type Series = "core" | "classic" | "clear";

export type DoorStyle = "swing" | "slide" | "double";
export type DoorFrame = 36 | 48 | 60 | 72;
export type SwingDir = "in" | "out";
export type Hand = "left" | "right";
export type ExhaustPanel = 18 | 24;
export type ExhaustPort = "ex08" | "ex10" | "ex12" | "ex14" | "exd" | "exk";

export type DoorSpec = {
  style: DoorStyle;
  frame: DoorFrame;
  swing: SwingDir;
  hand: Hand;
};

export type ExhaustSpec = {
  panel: ExhaustPanel;
  port: ExhaustPort;
};

const PANEL_SKU: Record<Series, Record<PanelWidth, string>> = {
  core: { 12: "SW-CORE-P12", 18: "SW-CORE-P18", 24: "SW-CORE-P24", 36: "SW-CORE-P36", 48: "SW-CORE-P48" },
  classic: { 12: "SW-P12W", 18: "SW-P18W", 24: "SW-P24W", 36: "SW-P36W", 48: "SW-P48W" },
  clear: { 12: "SW-P12C", 18: "SW-P18C", 24: "SW-P24C", 36: "SW-P36C", 48: "SW-P48C" },
};

const DOOR_SKU: Record<Series, Record<string, { sku: string; x3: string; name: string }>> = {
  core: {
    swing36: { sku: "SW-CORE-D32", x3: "SW-CORE-D32-X3", name: '32" swing in 36" frame' },
    swing48: { sku: "SW-CORE-D44", x3: "SW-CORE-D44-X3", name: '44" swing in 48" frame' },
    slide48: { sku: "SW-CORE-DS42", x3: "SW-CORE-DS42-X3", name: '42" sliding in 48" frame' },
    slide60: { sku: "SW-CORE-DS54", x3: "SW-CORE-DS54-X3", name: '54" sliding in 60" frame' },
    double72: { sku: "SW-CORE-DD68", x3: "SW-CORE-DD68-X3", name: '68" double-hinged in 72" frame' },
  },
  classic: {
    swing36: { sku: "SW-D32W", x3: "SW-D32W-X3", name: '32" swing in 36" frame' },
    swing48: { sku: "SW-D44W", x3: "SW-D44W-X3", name: '44" swing in 48" frame' },
    slide48: { sku: "SW-DS42W", x3: "SW-DS42W-X3", name: '42" sliding in 48" frame' },
    slide60: { sku: "SW-DS54W", x3: "SW-DS54W-X3", name: '54" sliding in 60" frame' },
    double72: { sku: "SW-DD68W", x3: "SW-DD68W-X3", name: '68" double-hinged in 72" frame' },
  },
  clear: {
    swing36: { sku: "SW-D32C", x3: "SW-D32C-X3", name: '32" swing in 36" frame' },
    swing48: { sku: "SW-D44C", x3: "SW-D44C-X3", name: '44" swing in 48" frame' },
    slide48: { sku: "SW-DS42C", x3: "SW-DS42C-X3", name: '42" sliding in 48" frame' },
    slide60: { sku: "SW-DS54C", x3: "SW-DS54C-X3", name: '54" sliding in 60" frame' },
    double72: { sku: "SW-DD68C", x3: "SW-DD68C-X3", name: '68" double-hinged in 72" frame' },
  },
};

const EP_SKU: Record<Series, Record<ExhaustPanel, string>> = {
  core: { 18: "SW-CORE-EP18", 24: "SW-CORE-EP24" },
  classic: { 18: "SW-EP18W", 24: "SW-EP24W" },
  clear: { 18: "SW-EP18C", 24: "SW-EP24C" },
};

export const PORT_SKU: Record<ExhaustPort, { sku: string; name: string }> = {
  ex08: { sku: "SW-EX08", name: '8" exhaust collar' },
  ex10: { sku: "SW-EX10", name: '10" exhaust collar' },
  ex12: { sku: "SW-EX12", name: '12" exhaust collar' },
  ex14: { sku: "SW-EX14", name: '14" exhaust collar' },
  exd: { sku: "SW-EXD", name: "Exhaust/intake diffuser + 2\" filter" },
  exk: { sku: "SW-EXK", name: "Exhaust kit, security plate & knob" },
};

export function doorKey(spec: DoorSpec) {
  if (spec.style === "double") return "double72";
  if (spec.style === "slide") return spec.frame === 60 ? "slide60" : "slide48";
  return spec.frame === 48 ? "swing48" : "swing36";
}

export function doorFrameFor(spec: DoorSpec): DoorFrame {
  if (spec.style === "double") return 72;
  if (spec.style === "slide") return spec.frame === 60 ? 60 : 48;
  return spec.frame === 48 ? 48 : 36;
}

export function doorSku(series: Series, spec: DoorSpec) {
  return DOOR_SKU[series][doorKey(spec)];
}

export function exhaustPanelSku(series: Series, panel: ExhaustPanel) {
  return EP_SKU[series][panel];
}

export function skuForPanel(series: Series, w: PanelWidth) {
  return PANEL_SKU[series][w];
}

export function doorLabel(spec: DoorSpec) {
  const base = doorSku("core", spec).name;
  if (spec.style === "swing") return `${base}, ${spec.swing}, hung ${spec.hand}`;
  if (spec.style === "slide") return `${base}, opens ${spec.hand}`;
  return `${base}, swing ${spec.swing}`;
}

export function packLength(inches: number): PanelWidth[] {
  const target = Math.max(0, Math.round(inches));
  if (target < 12) return [];
  const coins = PANEL_WIDTHS;
  const inf = 1e9;
  const dp = Array.from({ length: target + 1 }, () => inf);
  const choice = Array.from({ length: target + 1 }, () => 0);
  dp[0] = 0;
  for (let x = 0; x <= target; x++) {
    if (dp[x] === inf) continue;
    for (const c of coins) {
      const n = x + c;
      if (n <= target && dp[x] + 1 < dp[n]) {
        dp[n] = dp[x] + 1;
        choice[n] = c;
      }
    }
  }
  let best = 0;
  for (let x = target; x >= 0; x--) {
    if (dp[x] < inf) {
      best = x;
      break;
    }
  }
  const out: PanelWidth[] = [];
  let x = best;
  while (x > 0 && choice[x]) {
    out.push(choice[x] as PanelWidth);
    x -= choice[x];
  }
  return out.sort((a, b) => b - a);
}

export const DEFAULT_DOOR: DoorSpec = { style: "swing", frame: 36, swing: "in", hand: "left" };
export const DEFAULT_EXHAUST: ExhaustSpec = { panel: 24, port: "ex12" };
