import React from "react";
import { createRoot } from "react-dom/client";
import { AppleWorkspace as App } from "./AppleWorkspace.jsx";
import "./styles.css";
import "./apple-workspace.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
