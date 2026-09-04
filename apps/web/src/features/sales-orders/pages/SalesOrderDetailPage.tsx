import { useState, useEffect } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PaymentIcon from "@mui/icons-material/Payment";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, useParams } from "react-router-dom";

import { AppHeader, useHasCapability } from "../../auth/index.js";
import { useRecordPayment, useSalesOrder } from "../api/useSalesOrders.js";

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

interface RecordPaymentDialogProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  remainingAmount: number;
}

function RecordPaymentDialog({
  open,
  onClose,
  orderId,
  orderNumber,
  remainingAmount,
}: RecordPaymentDialogProps) {
  const { t } = useTranslation();
  const recordPaymentMutation = useRecordPayment(orderId);

  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank_transfer">("cash");
  const [referenceCode, setReferenceCode] = useState("");
  const [note, setNote] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmount(remainingAmount > 0 ? remainingAmount.toString() : "");
      setPaymentMethod("cash");
      setReferenceCode("");
      setNote("");
      setErrorMsg(null);
    }
  }, [open, remainingAmount]);

  const handlePayFull = () => {
    setAmount(remainingAmount.toString());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const parsedAmount = parseInt(amount, 10);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg(t("orders.errors.invalidPaymentAmount", "Số tiền thanh toán không hợp lệ"));
      return;
    }

    if (parsedAmount > remainingAmount) {
      setErrorMsg(
        t("orders.errors.paymentExceedsRemaining", "Số tiền thanh toán vượt quá số nợ còn lại"),
      );
      return;
    }

    try {
      const idempotencyKey = `pmt_req_${crypto.randomUUID()}`;
      await recordPaymentMutation.mutateAsync({
        amount: parsedAmount,
        paymentMethod,
        referenceCode: referenceCode.trim() || null,
        note: note.trim() || null,
        idempotencyKey,
      });
      onClose();
    } catch (err: unknown) {
      const errCode = err instanceof Error ? err.name || err.message : "";
      const msg =
        errCode === "AMOUNT_EXCEEDS_REMAINING" ||
        (err instanceof Error && err.message === "AMOUNT_EXCEEDS_REMAINING")
          ? t("orders.errors.paymentExceedsRemaining", "Số tiền thanh toán vượt quá số nợ còn lại")
          : errCode === "ORDER_ALREADY_PAID" ||
              (err instanceof Error && err.message === "ORDER_ALREADY_PAID")
            ? t("orders.errors.paymentAlreadyPaid", "Đơn hàng đã được thanh toán đủ")
            : err instanceof Error
              ? err.message
              : t(
                  "orders.errors.paymentFailed",
                  "Không thể ghi nhận thanh toán. Vui lòng thử lại.",
                );
      setErrorMsg(msg);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
      >
        <DialogTitle>
          {t("orders.paymentDialogTitle", "Ghi nhận thanh toán")}
          <Typography variant="body2" color="text.secondary">
            {t("orders.paymentDialogDesc", "Ghi nhận thu tiền cho đơn hàng")} {orderNumber}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            {errorMsg && (
              <Alert severity="error" id="payment-error-alert">
                {errorMsg}
              </Alert>
            )}

            <Box
              sx={{
                p: 2,
                bgcolor: "grey.50",
                borderRadius: 1,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Typography variant="body2" color="text.secondary">
                {t("orders.maxPayable", "Số tiền cần thanh toán tối đa:")}
              </Typography>
              <Typography variant="subtitle1" fontWeight="bold" color="error.main">
                {formatVnd(remainingAmount)}
              </Typography>
            </Box>

            <Box>
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <TextField
                  id="input-payment-amount"
                  label={t("orders.paymentAmount", "Số tiền (đ)")}
                  type="number"
                  fullWidth
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  slotProps={{ htmlInput: { min: 1, max: remainingAmount } }}
                />
                <Button
                  id="btn-pay-full"
                  variant="outlined"
                  sx={{ height: 56, whiteSpace: "nowrap" }}
                  onClick={handlePayFull}
                >
                  {t("orders.payFull", "Trả hết")}
                </Button>
              </Stack>
            </Box>

            <TextField
              select
              id="select-payment-method"
              label={t("orders.paymentMethod", "Phương thức")}
              fullWidth
              required
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as "cash" | "bank_transfer")}
            >
              <MenuItem value="cash">{t("orders.methodCash", "Tiền mặt")}</MenuItem>
              <MenuItem value="bank_transfer">
                {t("orders.methodBankTransfer", "Chuyển khoản")}
              </MenuItem>
            </TextField>

            <TextField
              id="input-reference-code"
              label={t("orders.referenceCode", "Mã tham chiếu / Mã GD")}
              fullWidth
              value={referenceCode}
              onChange={(e) => setReferenceCode(e.target.value)}
              placeholder="VD: MB-123456"
            />

            <TextField
              id="input-payment-note"
              label={t("orders.note", "Ghi chú:")}
              fullWidth
              multiline
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Khách chuyển đợt 1"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={recordPaymentMutation.isPending}>
            {t("common.cancel", "Hủy")}
          </Button>
          <Button
            id="btn-submit-payment"
            type="submit"
            variant="contained"
            color="primary"
            disabled={recordPaymentMutation.isPending}
            startIcon={
              recordPaymentMutation.isPending ? <CircularProgress size={18} /> : <PaymentIcon />
            }
          >
            {t("orders.confirmPayment", "Xác nhận thu tiền")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export function SalesOrderDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();

  const orderQuery = useSalesOrder(id ?? "");
  const order = orderQuery.data;

  const canCreateSales = useHasCapability("sales.create");
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "grey.50" }}>
      <AppHeader />
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack spacing={3}>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Stack direction="row" alignItems="center" spacing={2} flexWrap="wrap">
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
              {order && (
                <Chip
                  id="payment-status-badge"
                  label={
                    order.paymentStatus === "paid"
                      ? t("orders.paymentStatusPaid", "Đã thanh toán")
                      : order.paymentStatus === "partial"
                        ? t("orders.paymentStatusPartial", "Thanh toán một phần")
                        : t("orders.paymentStatusUnpaid", "Chưa thanh toán")
                  }
                  color={
                    order.paymentStatus === "paid"
                      ? "success"
                      : order.paymentStatus === "partial"
                        ? "warning"
                        : "error"
                  }
                  size="small"
                  variant={order.paymentStatus === "unpaid" ? "outlined" : "filled"}
                />
              )}
            </Stack>

            {order && canCreateSales && order.remainingAmount > 0 && (
              <Button
                id="btn-record-payment"
                variant="contained"
                color="primary"
                startIcon={<PaymentIcon />}
                onClick={() => setPaymentDialogOpen(true)}
              >
                {t("orders.recordPayment", "Ghi nhận thanh toán")}
              </Button>
            )}
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
                        <Typography variant="body2" color="text.secondary">
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
                    <Stack spacing={1} sx={{ minWidth: 320 }}>
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
                          {t("orders.totalAmount", "Tổng tiền đơn hàng:")}
                        </Typography>
                        <Typography variant="subtitle1" fontWeight="bold">
                          {formatVnd(order.totalAmount)}
                        </Typography>
                      </Box>
                      <Box display="flex" justifyContent="space-between">
                        <Typography color="success.main" fontWeight="medium">
                          {t("orders.paidAmount", "Đã thanh toán:")}
                        </Typography>
                        <Typography color="success.main" fontWeight="bold">
                          {formatVnd(order.paidAmount)}
                        </Typography>
                      </Box>
                      <Box display="flex" justifyContent="space-between">
                        <Typography
                          color={order.remainingAmount > 0 ? "error.main" : "text.secondary"}
                          fontWeight="medium"
                        >
                          {t("orders.remainingAmount", "Còn nợ:")}
                        </Typography>
                        <Typography
                          color={order.remainingAmount > 0 ? "error.main" : "text.secondary"}
                          fontWeight="bold"
                        >
                          {formatVnd(order.remainingAmount)}
                        </Typography>
                      </Box>
                    </Stack>
                  </Box>
                </CardContent>
              </Card>

              <Card variant="outlined">
                <CardContent>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {t("orders.paymentHistory", "Lịch sử thanh toán")}
                    </Typography>
                    {order.remainingAmount > 0 && canCreateSales && (
                      <Button
                        id="btn-record-payment-card"
                        size="small"
                        variant="outlined"
                        startIcon={<PaymentIcon />}
                        onClick={() => setPaymentDialogOpen(true)}
                      >
                        {t("orders.recordPayment", "Ghi nhận thanh toán")}
                      </Button>
                    )}
                  </Box>

                  {!order.payments || order.payments.length === 0 ? (
                    <Typography color="text.secondary" variant="body2" py={2}>
                      {t("orders.noPayments", "Chưa có giao dịch thanh toán nào")}
                    </Typography>
                  ) : (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell width="5%">#</TableCell>
                            <TableCell width="20%">{t("orders.createdAt", "Thời gian")}</TableCell>
                            <TableCell width="15%">
                              {t("orders.paymentMethod", "Phương thức")}
                            </TableCell>
                            <TableCell width="20%" align="right">
                              {t("orders.paymentAmount", "Số tiền")}
                            </TableCell>
                            <TableCell width="15%">
                              {t("orders.referenceCode", "Mã tham chiếu")}
                            </TableCell>
                            <TableCell width="15%">{t("orders.note", "Ghi chú")}</TableCell>
                            <TableCell width="10%">
                              {t("orders.createdByName", "Người thu")}
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {order.payments.map((pmt, idx) => (
                            <TableRow key={pmt.id}>
                              <TableCell>{idx + 1}</TableCell>
                              <TableCell>{formatDate(pmt.createdAt)}</TableCell>
                              <TableCell>
                                <Chip
                                  size="small"
                                  label={
                                    pmt.paymentMethod === "cash"
                                      ? t("orders.methodCash", "Tiền mặt")
                                      : t("orders.methodBankTransfer", "Chuyển khoản")
                                  }
                                  variant="outlined"
                                />
                              </TableCell>
                              <TableCell
                                align="right"
                                sx={{ fontWeight: "bold", color: "success.main" }}
                              >
                                {formatVnd(pmt.amount)}
                              </TableCell>
                              <TableCell>{pmt.referenceCode ?? "-"}</TableCell>
                              <TableCell>{pmt.note ?? "-"}</TableCell>
                              <TableCell>{pmt.createdByName}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </CardContent>
              </Card>

              <RecordPaymentDialog
                open={paymentDialogOpen}
                onClose={() => setPaymentDialogOpen(false)}
                orderId={order.id}
                orderNumber={order.orderNumber}
                remainingAmount={order.remainingAmount}
              />
            </Stack>
          )}
        </Stack>
      </Container>
    </Box>
  );
}
