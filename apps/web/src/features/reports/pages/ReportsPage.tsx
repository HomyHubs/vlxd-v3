import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  type SelectChangeEvent,
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
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import MoneyOffIcon from "@mui/icons-material/MoneyOff";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router-dom";
import type { SalesSummaryPeriod } from "@vlxd/shared";

import { AppHeader } from "../../auth/index.js";
import { useSalesSummary } from "../api/useReports.js";

function formatVnd(amount: number): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);
}

export function ReportsPage() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<SalesSummaryPeriod>("month");

  const reportsQuery = useSalesSummary(period);

  const handlePeriodChange = (event: SelectChangeEvent<SalesSummaryPeriod>) => {
    setPeriod(event.target.value);
  };

  const summary = reportsQuery.data?.summary;
  const topProducts = reportsQuery.data?.topProducts ?? [];
  const chartData = reportsQuery.data?.chartData ?? [];

  return (
    <>
      <AppHeader />
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack spacing={3}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", sm: "center" }}
            spacing={2}
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              <Button
                component={RouterLink}
                to="/"
                startIcon={<ArrowBackIcon />}
                size="small"
                data-testid="reports-back-btn"
              >
                {t("reports.backToDashboard", "Bảng điều khiển")}
              </Button>
              <Typography variant="h5" component="h1" fontWeight={700}>
                {t("reports.title", "Báo cáo bán hàng")}
              </Typography>
            </Stack>

            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel id="reports-period-label">
                {t("reports.periodLabel", "Kỳ báo cáo")}
              </InputLabel>
              <Select
                labelId="reports-period-label"
                id="reports-period-select"
                value={period}
                label={t("reports.periodLabel", "Kỳ báo cáo")}
                onChange={handlePeriodChange}
                data-testid="reports-period-select"
              >
                <MenuItem value="day">{t("reports.periodDay", "Hôm nay")}</MenuItem>
                <MenuItem value="week">{t("reports.periodWeek", "Tuần này")}</MenuItem>
                <MenuItem value="month">{t("reports.periodMonth", "Tháng này")}</MenuItem>
                <MenuItem value="all">{t("reports.periodAll", "Toàn thời gian")}</MenuItem>
              </Select>
            </FormControl>
          </Stack>

          {reportsQuery.isError && (
            <Alert severity="error" data-testid="reports-error-alert">
              {t("reports.loadError", "Không thể tải dữ liệu báo cáo.")}
            </Alert>
          )}

          {reportsQuery.isLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              {/* Financial KPI Cards */}
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card sx={{ height: "100%", bgcolor: "primary.50" }} variant="outlined">
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography color="text.secondary" variant="body2" fontWeight={600}>
                          {t("reports.kpiTotalRevenue", "Tổng doanh thu")}
                        </Typography>
                        <TrendingUpIcon color="primary" />
                      </Stack>
                      <Typography
                        variant="h5"
                        fontWeight={700}
                        color="primary.dark"
                        sx={{ mt: 1 }}
                        data-testid="kpi-total-revenue"
                      >
                        {formatVnd(summary?.totalRevenue ?? 0)}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card sx={{ height: "100%", bgcolor: "success.50" }} variant="outlined">
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography color="text.secondary" variant="body2" fontWeight={600}>
                          {t("reports.kpiTotalPaid", "Đã thu tiền")}
                        </Typography>
                        <AccountBalanceWalletIcon color="success" />
                      </Stack>
                      <Typography
                        variant="h5"
                        fontWeight={700}
                        color="success.dark"
                        sx={{ mt: 1 }}
                        data-testid="kpi-total-paid"
                      >
                        {formatVnd(summary?.totalPaid ?? 0)}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card sx={{ height: "100%", bgcolor: "warning.50" }} variant="outlined">
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography color="text.secondary" variant="body2" fontWeight={600}>
                          {t("reports.kpiTotalDebt", "Công nợ còn lại")}
                        </Typography>
                        <MoneyOffIcon color="warning" />
                      </Stack>
                      <Typography
                        variant="h5"
                        fontWeight={700}
                        color="warning.dark"
                        sx={{ mt: 1 }}
                        data-testid="kpi-total-debt"
                      >
                        {formatVnd(summary?.totalDebt ?? 0)}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                  <Card sx={{ height: "100%", bgcolor: "grey.50" }} variant="outlined">
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography color="text.secondary" variant="body2" fontWeight={600}>
                          {t("reports.kpiOrderCount", "Tổng số đơn")}
                        </Typography>
                        <ReceiptLongIcon color="action" />
                      </Stack>
                      <Typography
                        variant="h5"
                        fontWeight={700}
                        color="text.primary"
                        sx={{ mt: 1 }}
                        data-testid="kpi-order-count"
                      >
                        {summary?.orderCount ?? 0}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {summary?.paidOrderCount ?? 0} {t("reports.ordersPaid", "đã thu đủ")} •{" "}
                        {summary?.partialOrderCount ?? 0} {t("reports.ordersPartial", "thu 1 phần")}{" "}
                        • {summary?.unpaidOrderCount ?? 0} {t("reports.ordersUnpaid", "chưa thu")}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              {/* Top 5 Products Table */}
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" fontWeight={700} gutterBottom>
                    {t("reports.topProductsTitle", "Top 5 sản phẩm bán chạy nhất")}
                  </Typography>
                  <TableContainer>
                    <Table size="small" data-testid="top-products-table">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>STT</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>
                            {t("products.sku", "Mã SKU")}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>
                            {t("products.name", "Tên sản phẩm")}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>
                            {t("products.unit", "Đơn vị")}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            {t("reports.quantitySold", "Số lượng bán")}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            {t("reports.productRevenue", "Doanh thu")}
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {topProducts.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={6}
                              align="center"
                              sx={{ py: 3, color: "text.secondary" }}
                            >
                              {t(
                                "reports.noProductsSold",
                                "Chưa có sản phẩm nào được bán trong kỳ này.",
                              )}
                            </TableCell>
                          </TableRow>
                        ) : (
                          topProducts.map((p, idx) => (
                            <TableRow key={p.productId}>
                              <TableCell>{idx + 1}</TableCell>
                              <TableCell>{p.productSku}</TableCell>
                              <TableCell sx={{ fontWeight: 500 }}>{p.productName}</TableCell>
                              <TableCell>{p.unitName}</TableCell>
                              <TableCell align="right">
                                {p.quantitySold.toLocaleString("vi-VN")}
                              </TableCell>
                              <TableCell align="right" sx={{ fontWeight: 600 }}>
                                {formatVnd(p.totalSales)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>

              {/* Daily Timeline Table */}
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" fontWeight={700} gutterBottom>
                    {t("reports.dailyTimelineTitle", "Doanh số theo thời gian")}
                  </Typography>
                  <TableContainer>
                    <Table size="small" data-testid="daily-timeline-table">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700 }}>
                            {t("reports.date", "Ngày")}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            {t("reports.orderCountCol", "Số đơn")}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>
                            {t("reports.revenueCol", "Doanh thu")}
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {chartData.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={3}
                              align="center"
                              sx={{ py: 3, color: "text.secondary" }}
                            >
                              {t("reports.noTimelineData", "Không có dữ liệu phát sinh trong kỳ.")}
                            </TableCell>
                          </TableRow>
                        ) : (
                          chartData.map((row) => (
                            <TableRow key={row.date}>
                              <TableCell>{row.date}</TableCell>
                              <TableCell align="right">{row.orderCount}</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 600 }}>
                                {formatVnd(row.revenue)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>
            </>
          )}
        </Stack>
      </Container>
    </>
  );
}
