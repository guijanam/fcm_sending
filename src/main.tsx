import { createRoot } from "react-dom/client";
import App from "./App";
import { loadApi } from "./firebase";
import "./style.css";
const root = createRoot(document.getElementById("root")!);
root.render(
  <div className="boot" role="status">
    알림 센터를 준비하고 있습니다.
  </div>,
);
void loadApi().then((api) => root.render(<App api={api} />));
