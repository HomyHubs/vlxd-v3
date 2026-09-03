import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Grid,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router-dom";

import { AppHeader, useHasCapability } from "../../auth/index.js";
import { useCustomers } from "../../customers/index.js";
import { useWarehouses } from "../../warehouses/index.js";
import { useSalesOrders } from "../api/useSalesOrders.js";

function formatVnd(amount: number): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function SalesOrderListPage() {
  const { t } = useTranslation();
  const canCreateSalesOrder = useHasCapability("sales.create");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [customerId, setCustomerId] = useState<string>("");
  const [warehouseId, setWarehouseId] = useState<string>("");

  const customersQuery = useCustomers();
  const warehousesQuery = useWarehouses();
  const ordersQuery = useSalesOrders(
    page + 1,
    pageSize,
    customerId || undefined,
    warehouseId || undefined,
  );

  const customers = customersQuery.data?.items ?? [];
  const warehouses = warehousesQuery.data?.items ?? [];
  const orders = ordersQuery.data?.items ?? [];
  const total = ordersQuery.data?.total ?? 0;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "grey.50" }}>
      <AppHeader />
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack spacing={3}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h5" component="h1" fontWeight="bold">
              {t("orders.listTitle", "Quản lý đơn bán hàng")}
            </Typography>
            {canCreateSalesOrder && (
              <Button
                component={RouterLink}
                to="/orders/new"
                variant="contained"
                startIcon={<AddIcon />}
                id="new-sales-order-btn"
                data-testid="new-sales-order-btn"
              >
                {t("orders.createNew", "Tạo đơn hàng")}
              </Button>
            )}
          </Box>

          <Card variant="outlined">
            <CardContent>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    id="filter-customer"
                    label={t("orders.filterCustomer", "Lọc theo khách hàng")}
                    value={customerId}
                    onChange={(e) => {
                      setCustomerId(e.target.value);
                      setPage(0);
                    }}
                  >
                    <MenuItem value="">
                      <em>{t("common.all", "Tất cả khách hàng")}</em>
                    </MenuItem>
                    {customers.map((c) => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.name} ({c.code})
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    id="filter-warehouse"
                    label={t("orders.filterWarehouse", "Lọc theo kho xuất")}
                    value={warehouseId}
                    onChange={(e) => {
                      setWarehouseId(e.target.value);
                      setPage(0);
                    }}
                  >
                    <MenuItem value="">
                      <em>{t("common.all", "Tất cả kho")}</em>
                    </MenuItem>
                    {warehouses.map((w) => (
                      <MenuItem key={w.id} value={w.id}>
                        {w.name} ({w.code})
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {ordersQuery.isError && (
            <Alert severity="error">
              {t("orders.errors.loadFailed", "Không thể tải danh sách đơn hàng")}
            </Alert>
          )}

          <Card variant="outlined">
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>{t("orders.orderNumber", "Mã đơn")}</TableCell>
                    <TableCell>{t("orders.customer", "Khách hàng")}</TableCell>
                    <TableCell>{t("orders.warehouse", "Kho xuất")}</TableCell>
                    <TableCell align="center">{t("orders.itemCount", "Số SP")}</TableCell>
                    <TableCell align="right">{t("orders.totalAmount", "Tổng tiền")}</TableCell>
                    <TableCell>{t("orders.status", "Trạng thái")}</TableCell>
                    <TableCell>{t("orders.createdByName", "Người tạo")}</TableCell>
                    <TableCell>{t("orders.createdAt", "Ngày tạo")}</TableCell>
                    <TableCell align="center">{t("common.actions", "Thao tác")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ordersQuery.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} align="center" sx={{ py: 3 }}>
                        <Typography color="text.secondary">
                          {t("common.loading", "Đang tải...")}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : orders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary" gutterBottom>
                          {t("orders.emptyList", "Chưa có đơn bán hàng nào")}
                        </Typography>
                        <Button
                          component={RouterLink}
                          to="/orders/new"
                          variant="outlined"
                          size="small"
                          startIcon={<AddIcon />}
                          sx={{ mt: 1 }}
                        >
                          {t("orders.createFirst", "Tạo đơn hàng đầu tiên")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    orders.map((order) => (
                      <TableRow key={order.id} hover>
                        <TableCell>
                          <Typography
                            component={RouterLink}
                            to={`/orders/${order.id}`}
                            variant="body2"
                            fontWeight="bold"
                            color="primary.main"
                            sx={{ textDecoration: "none" }}
                          >
                            {order.orderNumber}
                          </Typography>
                        </TableCell>
                        <TableCell>{order.customerName}</TableCell>
                        <TableCell>{order.warehouseName}</TableCell>
                        <TableCell align="center">{order.itemCount}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: "bold" }}>
                          {formatVnd(order.totalAmount)}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={t("orders.statusConfirmed", "Đã xác nhận")}
                            color="success"
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>{order.createdByName}</TableCell>
                        <TableCell>{formatDate(order.createdAt)}</TableCell>
                        <TableCell align="center">
                          <Button
                            component={RouterLink}
                            to={`/orders/${order.id}`}
                            size="small"
                            variant="text"
                            startIcon={<VisibilityIcon />}
                          >
                            {t("common.viewDetail", "Chi tiết")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={total}
              page={page}
              onPageChange={(_, newPage) => setPage(newPage)}
              rowsPerPage={pageSize}
              onRowsPerPageChange={(e) => {
                setPageSize(parseInt(e.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[5, 10, 20, 50]}
              labelRowsPerPage={t("common.rowsPerPage", "Số dòng:")}
            />
          </Card>
        </Stack>
      </Container>
    </Box>
  );
}
