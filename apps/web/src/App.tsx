import { Button, Container, CssBaseline, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Link as RouterLink } from "react-router-dom";

import { AppHeader, LoginPage, ProtectedRoute, useHasCapability } from "./features/auth/index.js";
import { SystemHealthCard } from "./features/health/index.js";
import {
  CreateStockReceiptPage,
  StockReceiptDetailPage,
  StockReceiptListPage,
} from "./features/inventory/index.js";
import {
  CreateSalesOrderPage,
  SalesOrderDetailPage,
  SalesOrderListPage,
} from "./features/sales-orders/index.js";
import { ProductsPage } from "./features/products/index.js";
import { WarehousesPage } from "./features/warehouses/index.js";
import { UsersPage } from "./features/users/index.js";

function DashboardLayout() {
  const { t } = useTranslation();
  const canManageUsers = useHasCapability("users.manage");

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
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} useFlexGap flexWrap="wrap">
            <Button component={RouterLink} to="/products" variant="contained">
              {t("products.open")}
            </Button>
            <Button component={RouterLink} to="/warehouses" variant="outlined">
              {t("warehouses.title")}
            </Button>
            <Button component={RouterLink} to="/inventory/receipts" variant="outlined">
              {t("inventory.listTitle")}
            </Button>
            <Button component={RouterLink} to="/orders" variant="outlined">
              {t("orders.title", "Bán hàng")}
            </Button>
            {canManageUsers && (
              <Button
                component={RouterLink}
                to="/settings/users"
                variant="outlined"
                color="secondary"
                data-testid="nav-settings-users-btn"
              >
                {t("users.navTitle", "Cài đặt nhân viên")}
              </Button>
            )}
          </Stack>
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
            <Route path="/inventory/receipts" element={<StockReceiptListPage />} />
            <Route path="/inventory/receipts/new" element={<CreateStockReceiptPage />} />
            <Route path="/inventory/receipts/:id" element={<StockReceiptDetailPage />} />
            <Route path="/orders" element={<SalesOrderListPage />} />
            <Route path="/orders/new" element={<CreateSalesOrderPage />} />
            <Route path="/orders/:id" element={<SalesOrderDetailPage />} />
            <Route element={<ProtectedRoute requiredCapability="users.manage" />}>
              <Route path="/settings/users" element={<UsersPage />} />
            </Route>
          </Route>
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}
