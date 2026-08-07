import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import initBoardCore from "./wasm/board-core/board_core";

async function bootstrap() {
  await initBoardCore();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

bootstrap().catch((error) => {
  console.error("Could not initialize the board WebAssembly core.", error);
});
