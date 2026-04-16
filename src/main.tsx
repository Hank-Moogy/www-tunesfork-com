import { createRoot } from "react-dom/client";
import * as amplitude from '@amplitude/unified';
import App from "./App.tsx";
import "./index.css";

amplitude.initAll('65f72e75c1b338c180eaf8954f63104e', {
  analytics: { autocapture: true },
  sessionReplay: { sampleRate: 1 },
});

createRoot(document.getElementById("root")!).render(<App />);
