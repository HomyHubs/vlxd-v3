import { Button, Container, CssBaseline, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Link as RouterLink } from "react-router-dom";

import { AppHeader, LoginPage, ProtectedRoute } from "./features/auth/index.js";
import { SystemHealthCard } from "./features/health/index.js";
import { ProductsPage } from "./features/products/index.js";
import { WarehousesPage } from "./features/warehouses/index.js";

function DashboardLayout() {
  const { t } = useTranslation();

  return (
    <>
      <AppHeader />
      <Container maxWidth="md">
        <Stack component="main" spacing={4} sx={{ py: 6 }}>
          <Stack spacing={0.5}>
            <Typography color="primary" fontWeight={700} variant="overline">
              {t("app.slice")}
            </Typography>
            <Typography component="p" color="text.secondary" variant="h6">
              {t("app.name")}
            </Typography>
          </Stack>
          <SystemHealthCard />
          <Button component={RouterLink} to="/products" variant="contained">
            {t("products.open")}
          </Button>
        </Stack>
      </Container>
    </>
  );
}

export function App() {
  return (
    <>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<DashboardLayout />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/warehouses" element={<WarehousesPage />} />
          </Route>
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}
