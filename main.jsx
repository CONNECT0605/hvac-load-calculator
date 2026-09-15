import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import HVACCalculator from "./hvac-load-calculator.jsx";
import { ErrorBoundary } from "./ui-kit.jsx";

import "./styles.css";
import "./print.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <HVACCalculator />
    </ErrorBoundary>
  </StrictMode>
);
