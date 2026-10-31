import React from "react";
import { createRoot } from "react-dom/client";
import { WorkspaceRoot } from "./WorkspaceRoot.jsx";
import "./theme.css";
import "./styles.css";
import "./readability.css";
import "./pages.css";
import "./conversation.css";
import "./materials.css";
import "./appearance.css";
import "./layout.css";
import "./resume-design.css";
import "./design-workspace.css";
import "./account.css";
import "./profile-library.css";
import "./sidebar.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <WorkspaceRoot />
  </React.StrictMode>,
);
