import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initUtmTracking } from "./lib/utm";
import { initializeAnalytics } from "./lib/analytics";

// Capture UTM params from landing URL and attach to all events / user props.
initUtmTracking();
void initializeAnalytics();

createRoot(document.getElementById("root")!).render(<App />);
