import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initializeDesktopAnalytics, trackDesktopEvent } from "./analytics";
import "./styles.css";

void initializeDesktopAnalytics();
if (localStorage.getItem("tf_desktop_first_launch_tracked") !== "1") {
  localStorage.setItem("tf_desktop_first_launch_tracked", "1");
  trackDesktopEvent("Desktop App First Launched");
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
