import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, useParams } from "react-router-dom";

import { AppHeader } from "../../auth/index.js";
import { useSalesOrder } from "../api/useSalesOrders.js";

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

export function SalesOrderDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();

  const orderQuery = useSalesOrder(id ?? "");
  const order = orderQuery.data;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "grey.50" }}>
      <AppHeader />
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack spacing={3}>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Stack direction="row" alignItems="center" spacing={2}>
              <Button
                component={RouterLink}
                to="/orders"
                startIcon={<ArrowBackIcon />}
                variant="outlined"
                size="small"
              >
                {t("orders.backToList", "Danh sách")}
              </Button>
              {order && (
                <Typography variant="h5" component="h1" fontWeight="bold">
                  {order.orderNumber}
                </Typography>
              )}
              {order && (
                <Chip
                  label={t("orders.statusConfirmed", "Đã xác nhận")}
                  color="success"
                  size="small"
                  variant="outlined"
                />
              )}
            </Stack>
          </Box>

          {orderQuery.isLoading && (
            <Box display="flex" justifyContent="center" py={8}>
              <CircularProgress />
            </Box>
          )}

          {orderQuery.isError && (
            <Alert severity="error">
              {t(
                "orders.errors.loadDetailFailed",
                "Không tìm thấy hoặc không thể tải chi tiết đơn hàng",
              )}
            </Alert>
          )}

          {order && (
            <Stack spacing={3}>
              <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Card variant="outlined" sx={{ height: "100%" }}>
                    <CardContent>
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        {t("orders.customerInfo", "Thông tin khách hàng")}
                      </Typography>
                      <Typography variant="h6" fontWeight="bold">
                        {order.customerName}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t("orders.customerCode", "Mã KH:")} {order.customerCode}
                      </Typography>
                      {order.customerPhone && (
                        <Typography variant="body2" color="text.secondary">
                          {t("orders.phone", "SĐT:")} {order.customerPhone}
                        </Typography>
                      )}
                      {order.customerAddress && (
                        <Typography variant="body2" color="text.secondary">
                          {t("orders.address", "Địa chỉ:")} {order.customerAddress}
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Card variant="outlined" sx={{ height: "100%" }}>
                    <CardContent>
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        {t("orders.warehouseInfo", "Kho xuất hàng & Người tạo")}
                      </Typography>
                      <Typography variant="h6" fontWeight="bold">
                        {order.warehouseName} ({order.warehouseCode})
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t("orders.createdByName", "Người tạo:")} {order.createdByName}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {t("orders.createdAt", "Ngày tạo:")} {formatDate(order.createdAt)}
                      </Typography>
                      {order.note && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          {t("orders.note", "Ghi chú:")} {order.note}
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    {t("orders.itemsList", "Danh sách sản phẩm xuất bán")}
                  </Typography>

                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell width="5%">#</TableCell>
                          <TableCell width="35%">{t("orders.product", "Tên sản phẩm")}</TableCell>
                          <TableCell width="15%">{t("orders.sku", "Mã SKU")}</TableCell>
                          <TableCell width="10%">{t("orders.unit", "Đơn vị")}</TableCell>
                          <TableCell width="10%" align="right">
                            {t("orders.quantity", "Số lượng")}
                          </TableCell>
                          <TableCell width="12%" align="right">
                            {t("orders.unitPrice", "Đơn giá")}
                          </TableCell>
                          <TableCell width="13%" align="right">
                            {t("orders.lineTotal", "Thành tiền")}
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {order.lines.map((line, idx) => (
                          <TableRow key={line.id}>
                            <TableCell>{idx + 1}</TableCell>
                            <TableCell sx={{ fontWeight: "medium" }}>{line.productName}</TableCell>
                            <TableCell>{line.productSku}</TableCell>
                            <TableCell>{line.unitName}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: "bold" }}>
                              {line.quantity}
                            </TableCell>
                            <TableCell align="right">{formatVnd(line.unitPrice)}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: "bold" }}>
                              {formatVnd(line.lineTotal)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>

                  <Divider sx={{ my: 2 }} />

                  <Box display="flex" justifyContent="flex-end">
                    <Stack spacing={1} sx={{ minWidth: 280 }}>
                      <Box display="flex" justifyContent="space-between">
                        <Typography color="text.secondary">
                          {t("orders.totalQuantity", "Tổng số lượng:")}
                        </Typography>
                        <Typography fontWeight="bold">
                          {order.lines.reduce((sum, l) => sum + l.quantity, 0)}
                        </Typography>
                      </Box>
                      <Box display="flex" justifyContent="space-between">
                        <Typography variant="subtitle1" fontWeight="bold">
                          {t("orders.totalAmount", "Tổng tiền thanh toán:")}
                        </Typography>
                        <Typography variant="subtitle1" fontWeight="bold" color="primary.main">
                          {formatVnd(order.totalAmount)}
                        </Typography>
                      </Box>
                    </Stack>
                  </Box>
                </CardContent>
              </Card>
            </Stack>
          )}
        </Stack>
      </Container>
    </Box>
  );
}
