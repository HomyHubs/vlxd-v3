import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Divider,
  Grid,
  IconButton,
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
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SaveIcon from "@mui/icons-material/Save";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, useNavigate } from "react-router-dom";

import { AppHeader } from "../../auth/index.js";
import { useCustomers } from "../../customers/index.js";
import { useProducts } from "../../products/api/useProducts.js";
import { useWarehouses } from "../../warehouses/index.js";
import { useCreateSalesOrder } from "../api/useSalesOrders.js";

interface OrderLineItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

function formatVnd(amount: number): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);
}

export function CreateSalesOrderPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const customersQuery = useCustomers();
  const warehousesQuery = useWarehouses();
  const productsQuery = useProducts(1, 100, "");
  const createMutation = useCreateSalesOrder();

  const [customerId, setCustomerId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<OrderLineItem[]>([
    { productId: "", quantity: 1, unitPrice: 0 },
  ]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const customers = customersQuery.data?.items ?? [];
  const warehouses = warehousesQuery.data?.items ?? [];
  const products = productsQuery.data?.items ?? [];

  // Default to retail customer (KH-LE) and first warehouse if available
  useEffect(() => {
    if (!customerId && customers.length > 0) {
      const retail = customers.find((c) => c.code === "KH-LE");
      setCustomerId(retail ? retail.id : customers[0]!.id);
    }
  }, [customers, customerId]);

  useEffect(() => {
    if (!warehouseId && warehouses.length > 0) {
      setWarehouseId(warehouses[0]!.id);
    }
  }, [warehouses, warehouseId]);

  const handleAddLine = () => {
    setLines([...lines, { productId: "", quantity: 1, unitPrice: 0 }]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, idx) => idx !== index));
  };

  const handleLineChange = (
    index: number,
    field: "productId" | "quantity" | "unitPrice",
    value: string | number,
  ) => {
    setLines(
      lines.map((line, idx) => {
        if (idx !== index) return line;
        return {
          ...line,
          [field]: value,
        };
      }),
    );
  };

  const totalAmount = lines.reduce((sum, line) => {
    return sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
  }, 0);

  const totalQuantity = lines.reduce((sum, line) => {
    return sum + (Number(line.quantity) || 0);
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!customerId) {
      setErrorMessage(t("orders.errors.selectCustomer", "Vui lòng chọn khách hàng"));
      return;
    }

    if (!warehouseId) {
      setErrorMessage(t("orders.errors.selectWarehouse", "Vui lòng chọn kho xuất hàng"));
      return;
    }

    const invalidLines = lines.some((l) => !l.productId || l.quantity <= 0 || l.unitPrice < 0);
    if (invalidLines) {
      setErrorMessage(
        t("orders.errors.invalidLines", "Vui lòng chọn sản phẩm, số lượng và đơn giá hợp lệ"),
      );
      return;
    }

    try {
      const result = await createMutation.mutateAsync({
        customerId,
        warehouseId,
        note: note.trim() || undefined,
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
        })),
      });

      void navigate(`/orders/${result.id}`);
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === "INSUFFICIENT_STOCK" || err.message.includes("INSUFFICIENT_STOCK")) {
          setErrorMessage(
            err.message.includes("không đủ tồn kho")
              ? err.message
              : t(
                  "orders.errors.insufficientStock",
                  "Tồn kho không đủ để xuất bán sản phẩm đã chọn",
                ),
          );
        } else if (err.name === "CUSTOMER_NOT_FOUND") {
          setErrorMessage(t("orders.errors.customerNotFound", "Khách hàng không tồn tại"));
        } else if (err.name === "WAREHOUSE_NOT_FOUND") {
          setErrorMessage(t("orders.errors.warehouseNotFound", "Kho xuất không tồn tại"));
        } else if (err.name === "PRODUCT_NOT_FOUND") {
          setErrorMessage(
            t("orders.errors.productNotFound", "Một hoặc nhiều sản phẩm không tồn tại"),
          );
        } else {
          setErrorMessage(err.message || t("orders.errors.createFailed", "Không thể tạo đơn hàng"));
        }
      } else {
        setErrorMessage(t("orders.errors.createFailed", "Không thể tạo đơn hàng"));
      }
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "grey.50" }}>
      <AppHeader />
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack spacing={3}>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Stack direction="row" alignItems="center" spacing={1}>
              <Button
                component={RouterLink}
                to="/orders"
                startIcon={<ArrowBackIcon />}
                variant="outlined"
                size="small"
              >
                {t("orders.backToList", "Danh sách")}
              </Button>
              <Typography variant="h5" component="h1" fontWeight="bold">
                {t("orders.createTitle", "Tạo đơn bán hàng")}
              </Typography>
            </Stack>
          </Box>

          {errorMessage && (
            <Alert severity="error" onClose={() => setErrorMessage(null)}>
              {errorMessage}
            </Alert>
          )}

          <Box
            component="form"
            onSubmit={(e) => {
              void handleSubmit(e);
            }}
            noValidate
          >
            <Stack spacing={3}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    {t("orders.infoSection", "Thông tin chung")}
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        select
                        fullWidth
                        id="order-customer-select"
                        label={t("orders.customer", "Khách hàng")}
                        value={customerId}
                        onChange={(e) => setCustomerId(e.target.value)}
                        required
                        disabled={customersQuery.isLoading}
                      >
                        {customers.map((c) => (
                          <MenuItem key={c.id} value={c.id}>
                            {c.name} ({c.code}){c.phone ? ` - ${c.phone}` : ""}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        select
                        fullWidth
                        id="order-warehouse-select"
                        label={t("orders.warehouse", "Kho xuất hàng")}
                        value={warehouseId}
                        onChange={(e) => setWarehouseId(e.target.value)}
                        required
                        disabled={warehousesQuery.isLoading}
                      >
                        {warehouses.map((w) => (
                          <MenuItem key={w.id} value={w.id}>
                            {w.name} ({w.code})
                          </MenuItem>
                        ))}
                      </TextField>
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        fullWidth
                        id="order-note-input"
                        label={t("orders.note", "Ghi chú đơn hàng")}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        multiline
                        rows={2}
                      />
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>

              <Card variant="outlined">
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {t("orders.itemsSection", "Chi tiết sản phẩm bán")}
                    </Typography>
                    <Button
                      startIcon={<AddIcon />}
                      onClick={handleAddLine}
                      variant="outlined"
                      size="small"
                      id="add-order-line-btn"
                    >
                      {t("orders.addLine", "Thêm sản phẩm")}
                    </Button>
                  </Box>

                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell width="40%">{t("orders.product", "Sản phẩm")}</TableCell>
                          <TableCell width="20%">{t("orders.quantity", "Số lượng")}</TableCell>
                          <TableCell width="20%">{t("orders.unitPrice", "Đơn giá (đ)")}</TableCell>
                          <TableCell width="15%">{t("orders.lineTotal", "Thành tiền")}</TableCell>
                          <TableCell width="5%" align="center"></TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {lines.map((line, idx) => {
                          const lineTotal =
                            (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
                          return (
                            <TableRow key={idx}>
                              <TableCell>
                                <TextField
                                  select
                                  fullWidth
                                  size="small"
                                  id={`line-product-${idx}`}
                                  value={line.productId}
                                  onChange={(e) =>
                                    handleLineChange(idx, "productId", e.target.value)
                                  }
                                  required
                                >
                                  {products.map((p) => (
                                    <MenuItem key={p.id} value={p.id}>
                                      {p.name} ({p.sku})
                                    </MenuItem>
                                  ))}
                                </TextField>
                              </TableCell>
                              <TableCell>
                                <TextField
                                  fullWidth
                                  size="small"
                                  type="number"
                                  id={`line-quantity-${idx}`}
                                  inputProps={{ min: 1, step: 1 }}
                                  value={line.quantity}
                                  onChange={(e) =>
                                    handleLineChange(
                                      idx,
                                      "quantity",
                                      Math.max(1, parseInt(e.target.value, 10) || 1),
                                    )
                                  }
                                  required
                                />
                              </TableCell>
                              <TableCell>
                                <TextField
                                  fullWidth
                                  size="small"
                                  type="number"
                                  id={`line-unit-price-${idx}`}
                                  inputProps={{ min: 0, step: 1000 }}
                                  value={line.unitPrice}
                                  onChange={(e) =>
                                    handleLineChange(
                                      idx,
                                      "unitPrice",
                                      Math.max(0, parseInt(e.target.value, 10) || 0),
                                    )
                                  }
                                  required
                                />
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" fontWeight="medium">
                                  {formatVnd(lineTotal)}
                                </Typography>
                              </TableCell>
                              <TableCell align="center">
                                <IconButton
                                  size="small"
                                  color="error"
                                  disabled={lines.length <= 1}
                                  onClick={() => handleRemoveLine(idx)}
                                  aria-label={t("common.delete", "Xóa")}
                                >
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          );
                        })}
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
                        <Typography fontWeight="bold">{totalQuantity}</Typography>
                      </Box>
                      <Box display="flex" justifyContent="space-between">
                        <Typography variant="subtitle1" fontWeight="bold">
                          {t("orders.totalAmount", "Tổng tiền thanh toán:")}
                        </Typography>
                        <Typography variant="subtitle1" fontWeight="bold" color="primary.main">
                          {formatVnd(totalAmount)}
                        </Typography>
                      </Box>
                    </Stack>
                  </Box>
                </CardContent>
              </Card>

              <Box display="flex" justifyContent="flex-end" gap={2}>
                <Button component={RouterLink} to="/orders" variant="outlined">
                  {t("common.cancel", "Hủy")}
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  startIcon={<SaveIcon />}
                  disabled={createMutation.isPending}
                  id="submit-order-btn"
                >
                  {createMutation.isPending
                    ? t("common.saving", "Đang xử lý...")
                    : t("orders.confirmCreate", "Xác nhận tạo đơn")}
                </Button>
              </Box>
            </Stack>
          </Box>
        </Stack>
      </Container>
    </Box>
  );
}
