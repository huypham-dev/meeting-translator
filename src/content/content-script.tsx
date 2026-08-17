import { createRoot } from "react-dom/client";
import { createLogger } from "@/shared/logger";
import { CaptionOverlay } from "./CaptionOverlay";
import styles from "./styles.css?inline";

const log = createLogger("Content");

const HOST_ID = "meet-live-translator-root";

function mount() {
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement("div");
  host.id = HOST_ID;
  document.documentElement.appendChild(host);

  const shadowRoot = host.attachShadow({ mode: "open" });

  const styleEl = document.createElement("style");
  styleEl.textContent = styles;
  shadowRoot.appendChild(styleEl);

  const mountPoint = document.createElement("div");
  shadowRoot.appendChild(mountPoint);

  createRoot(mountPoint).render(<CaptionOverlay />);

  log.log("Caption overlay mounted");
}

mount();
