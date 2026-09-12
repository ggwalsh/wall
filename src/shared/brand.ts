export type BrandState = "idle" | "think" | "build" | "done";
export type OnBrand = (state: BrandState) => void;
