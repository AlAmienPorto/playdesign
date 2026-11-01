import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App";
import { TokenGate } from "./components/TokenGate";
import { getOfficeToken, officeApiEnabled } from "./lib/officeApi";
import { ThemeProvider } from "./lib/theme";
import { StoreProvider } from "./lib/store";

/**
 * StoreProvider sengaja baru dipasang setelah token ada: store mengambil data
 * sekali saat mount, jadi kalau dipasang sebelum login ia memakai data mock dan
 * tidak pernah memuat ulang setelah token ditempel.
 */
function AuthGate() {
  const [ready, setReady] = useState(() => !officeApiEnabled || Boolean(getOfficeToken()));

  useEffect(() => {
    const onCleared = () => setReady(false);
    window.addEventListener("pd-auth-cleared", onCleared);
    return () => window.removeEventListener("pd-auth-cleared", onCleared);
  }, []);

  if (!ready) return <TokenGate onReady={() => setReady(true)} />;

  return (
    <StoreProvider>
      <App />
    </StoreProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthGate />
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
