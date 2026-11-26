import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./app.css";
import { App } from "./App";
import { LangProvider } from "./lib/i18n";

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000, retry: 1, refetchOnWindowFocus: true } }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <LangProvider>
        <App />
      </LangProvider>
    </QueryClientProvider>
  </StrictMode>
);
