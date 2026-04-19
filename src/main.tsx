import { createRoot } from "react-dom/client";
import * as amplitude from '@amplitude/unified';
import App from "./App.tsx";
import "./index.css";
import { initUtmTracking } from "./lib/utm";

amplitude.initAll('65f72e75c1b338c180eaf8954f63104e', {
  analytics: { autocapture: true },
  sessionReplay: { sampleRate: 1 },
});

// Capture UTM params from landing URL and attach to all events / user props.
initUtmTracking();

createRoot(document.getElementById("root")!).render(<App />);
