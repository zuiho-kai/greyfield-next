import { createApp } from "vue";
import App from "./App.vue";
import "./styles.css";

const bodyWindowClasses = ["settings-window", "controls-window", "chat-window"] as const;
type BodyWindowClass = (typeof bodyWindowClasses)[number];

function resolveBodyWindowClass(windowRole: string | null): BodyWindowClass | null {
  if (windowRole === "settings" || windowRole === null) {
    return "settings-window";
  }
  if (windowRole === "controls") {
    return "controls-window";
  }
  if (windowRole === "chat") {
    return "chat-window";
  }
  if (windowRole === "pet") {
    return null;
  }
  console.warn(`Unknown Greyfield renderer window role "${windowRole}"; using Settings window layout.`);
  return "settings-window";
}

const windowRole = new URLSearchParams(window.location.search).get("window");
document.body.classList.remove(...bodyWindowClasses);
const bodyWindowClass = resolveBodyWindowClass(windowRole);
if (bodyWindowClass) {
  document.body.classList.add(bodyWindowClass);
}

createApp(App).mount("#app");
