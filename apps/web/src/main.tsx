import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./i18n";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element was not found");
}

const queryClient = new QueryClient();
const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#166534",
    },
    background: {
      default: "#f4f7f5",
    },
  },
  shape: {
    borderRadius: 14,
  },
});

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
