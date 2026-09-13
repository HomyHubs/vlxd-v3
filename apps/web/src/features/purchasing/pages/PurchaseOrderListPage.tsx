import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Container,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router-dom";

import { AppHeader, useHasCapability } from "../../auth/index.js";
import { usePurchaseOrders } from "../api/usePurchaseOrders.js";

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

export function PurchaseOrderListPage() {
  const { t } = useTranslation();
  const canManage = useHasCapability("purchasing.manage");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const ordersQuery = usePurchaseOrders(page + 1, pageSize);
  const orders = ordersQuery.data?.items ?? [];
  const total = ordersQuery.data?.total ?? 0;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "grey.50" }}>
      <AppHeader />
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack spacing={3}>
          <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap">
            <Stack direction="row" alignItems="center" spacing={1}>
              <Button
                component={RouterLink}
                to="/purchasing"
                startIcon={<ArrowBackIcon />}
                variant="outlined"
                size="small"
              >
                {t("purchasing.backToSuppliers", "Nhà cung cấp")}
              </Button>
              <Typography variant="h5" component="h1" fontWeight="bold">
                {t("purchasing.ordersListTitle", "Quản lý đơn mua hàng")}
              </Typography>
            </Stack>
            {canManage && (
              <Button
                component={RouterLink}
                to="/purchasing/orders/new"
                variant="contained"
                startIcon={<AddIcon />}
                data-testid="new-purchase-order-btn"
              >
                {t("purchasing.createNew", "Tạo đơn mua")}
              </Button>
            )}
          </Box>

          {ordersQuery.isError && (
            <Alert severity="error">
              {t("purchasing.errors.loadFailed", "Không thể tải danh sách đơn mua hàng")}
            </Alert>
          )}

          <Card variant="outlined">
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>{t("purchasing.orderNumber", "Mã đơn")}</TableCell>
                    <TableCell>{t("purchasing.supplier", "Nhà cung cấp")}</TableCell>
                    <TableCell>{t("purchasing.warehouse", "Kho nhập")}</TableCell>
                    <TableCell align="right">{t("purchasing.totalAmount", "Tổng tiền")}</TableCell>
                    <TableCell>{t("purchasing.status", "Trạng thái")}</TableCell>
                    <TableCell>{t("purchasing.createdByName", "Người tạo")}</TableCell>
                    <TableCell>{t("purchasing.createdAt", "Ngày tạo")}</TableCell>
                    <TableCell align="center">{t("purchasing.actions", "Thao tác")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ordersQuery.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 3 }}>
                        <Typography color="text.secondary">
                          {t("purchasing.loading", "Đang tải...")}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : orders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary" gutterBottom>
                          {t("purchasing.emptyOrders", "Chưa có đơn mua hàng nào")}
                        </Typography>
                        {canManage && (
                          <Button
                            component={RouterLink}
                            to="/purchasing/orders/new"
                            variant="outlined"
                            size="small"
                            startIcon={<AddIcon />}
                            sx={{ mt: 1 }}
                            data-testid="create-first-po-btn"
                          >
                            {t("purchasing.createFirst", "Tạo đơn mua đầu tiên")}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    orders.map((order) => (
                      <TableRow key={order.id} hover>
                        <TableCell>
                          <Typography
                            component={RouterLink}
                            to={`/purchasing/orders/${order.id}`}
                            variant="body2"
                            fontWeight="bold"
                            color="primary.main"
                            sx={{ textDecoration: "none" }}
                          >
                            {order.orderNumber}
                          </Typography>
                        </TableCell>
                        <TableCell>{order.supplierName}</TableCell>
                        <TableCell>{order.warehouseName}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: "bold" }}>
                          {formatVnd(order.totalAmount)}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={t("purchasing.statusOrdered", "Đã đặt")}
                            color="info"
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>{order.createdByName}</TableCell>
                        <TableCell>{formatDate(order.createdAt)}</TableCell>
                        <TableCell align="center">
                          <Button
                            component={RouterLink}
                            to={`/purchasing/orders/${order.id}`}
                            size="small"
                            variant="text"
                            startIcon={<VisibilityIcon />}
                          >
                            {t("purchasing.viewDetail", "Chi tiết")}
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
              labelRowsPerPage={t("purchasing.rowsPerPage", "Số dòng:")}
            />
          </Card>
        </Stack>
      </Container>
    </Box>
  );
}
