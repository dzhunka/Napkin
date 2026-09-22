import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { Widget } from "./app";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Widget />
  </StrictMode>,
);
