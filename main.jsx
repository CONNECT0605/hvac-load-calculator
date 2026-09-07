import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import HVACCalculator from "./hvac-load-calculator.jsx";

import "./styles.css";
import "./print.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <HVACCalculator />
  </StrictMode>
);
