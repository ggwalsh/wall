import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../shared/theme.css";
import { WallApp } from "./App";

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    <WallApp homeHref="https://geoffwalsh.xyz/tools" />
  </StrictMode>,
);
