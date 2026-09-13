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

import { AppHeader, getCurrentSessionKey } from "../../auth/index.js";
import { useProducts } from "../../products/api/useProducts.js";
import { useWarehouses } from "../../warehouses/index.js";
import { useCreatePurchaseOrder, useSuppliers } from "../api/usePurchaseOrders.js";

interface PurchaseLineItem {
  productId: string;
  quantity: number;
  unitCost: number;
}

function formatVnd(amount: number): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);
}

export function CreatePurchaseOrderPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const suppliersQuery = useSuppliers();
  const warehousesQuery = useWarehouses();
  const productsQuery = useProducts(1, 100, "");
  const createMutation = useCreatePurchaseOrder();

  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<PurchaseLineItem[]>([
    { productId: "", quantity: 1, unitCost: 0 },
  ]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const suppliers = suppliersQuery.data?.items ?? [];
  const warehouses = warehousesQuery.data?.items ?? [];
  const products = productsQuery.data?.items ?? [];

  useEffect(() => {
    if (!supplierId && suppliers.length > 0) {
      setSupplierId(suppliers[0]!.id);
    }
  }, [suppliers, supplierId]);

  useEffect(() => {
    if (!warehouseId && warehouses.length > 0) {
      setWarehouseId(warehouses[0]!.id);
    }
  }, [warehouses, warehouseId]);

  useEffect(() => {
    if (products.length > 0 && lines.length === 1 && !lines[0]!.productId) {
      setLines([{ productId: products[0]!.id, quantity: 1, unitCost: 0 }]);
    }
  }, [products, lines]);

  const handleAddLine = () => {
    setLines([...lines, { productId: "", quantity: 1, unitCost: 0 }]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, idx) => idx !== index));
  };

  const handleLineChange = (
    index: number,
    field: keyof PurchaseLineItem,
    value: string | number,
  ) => {
    setLines(lines.map((line, idx) => (idx === index ? { ...line, [field]: value } : line)));
  };

  const totalAmount = lines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitCost) || 0),
    0,
  );
  const totalQuantity = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!supplierId) {
      setErrorMessage(t("purchasing.errors.selectSupplier", "Vui lòng chọn nhà cung cấp"));
      return;
    }
    if (!warehouseId) {
      setErrorMessage(t("purchasing.errors.selectWarehouse", "Vui lòng chọn kho nhập hàng"));
      return;
    }

    const invalidLines = lines.some((l) => !l.productId || l.quantity <= 0 || l.unitCost < 0);
    if (invalidLines) {
      setErrorMessage(
        t(
          "purchasing.errors.invalidLines",
          "Vui lòng chọn sản phẩm, số lượng (> 0) và đơn giá hợp lệ (>= 0)",
        ),
      );
      return;
    }

    const productIds = lines.map((l) => l.productId);
    if (new Set(productIds).size !== productIds.length) {
      setErrorMessage(
        t("purchasing.errors.duplicateProduct", "Mỗi sản phẩm chỉ được xuất hiện một lần"),
      );
      return;
    }

    const submitSessionKey = getCurrentSessionKey();
    try {
      const result = await createMutation.mutateAsync({
        supplierId,
        warehouseId,
        note: note.trim() || undefined,
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: Number(l.quantity),
          unitCost: Number(l.unitCost),
        })),
      });

      if (submitSessionKey && getCurrentSessionKey() !== submitSessionKey) {
        return;
      }

      void navigate(`/purchasing/orders/${result.id}`);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "AUTH_CONTEXT_CHANGED") {
        return;
      }
      const code = err instanceof Error ? err.name || err.message : "";
      if (code === "SUPPLIER_NOT_FOUND") {
        setErrorMessage(t("purchasing.errors.supplierNotFound", "Nhà cung cấp không tồn tại"));
      } else if (code === "WAREHOUSE_NOT_FOUND") {
        setErrorMessage(t("purchasing.errors.warehouseNotFound", "Kho nhập không tồn tại"));
      } else if (code === "PRODUCT_NOT_FOUND") {
        setErrorMessage(
          t("purchasing.errors.productNotFound", "Một hoặc nhiều sản phẩm không tồn tại"),
        );
      } else if (code === "INVALID_ORDER_LINES") {
        setErrorMessage(t("purchasing.errors.invalidOrderLines", "Chi tiết đơn mua không hợp lệ"));
      } else {
        setErrorMessage(t("purchasing.errors.createFailed", "Không thể tạo đơn mua hàng"));
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
                to="/purchasing/orders"
                startIcon={<ArrowBackIcon />}
                variant="outlined"
                size="small"
              >
                {t("purchasing.backToOrders", "Đơn mua hàng")}
              </Button>
              <Typography variant="h5" component="h1" fontWeight="bold">
                {t("purchasing.createTitle", "Tạo đơn mua hàng")}
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
                    {t("purchasing.infoSection", "Thông tin chung")}
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        select
                        fullWidth
                        id="po-supplier-select"
                        label={t("purchasing.supplier", "Nhà cung cấp")}
                        value={supplierId}
                        onChange={(e) => setSupplierId(e.target.value)}
                        required
                        disabled={suppliersQuery.isLoading}
                        data-testid="po-supplier-select"
                      >
                        {suppliers.map((s) => (
                          <MenuItem key={s.id} value={s.id}>
                            {s.name} ({s.code})
                          </MenuItem>
                        ))}
                      </TextField>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        select
                        fullWidth
                        id="po-warehouse-select"
                        label={t("purchasing.warehouse", "Kho nhập hàng")}
                        value={warehouseId}
                        onChange={(e) => setWarehouseId(e.target.value)}
                        required
                        disabled={warehousesQuery.isLoading}
                        data-testid="po-warehouse-select"
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
                        id="po-note-input"
                        label={t("purchasing.orderNote", "Ghi chú đơn mua")}
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
                      {t("purchasing.itemsSection", "Chi tiết hàng nhập")}
                    </Typography>
                    <Button
                      startIcon={<AddIcon />}
                      onClick={handleAddLine}
                      variant="outlined"
                      size="small"
                      id="add-po-line-btn"
                    >
                      {t("purchasing.addLine", "Thêm sản phẩm")}
                    </Button>
                  </Box>

                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell width="40%">{t("purchasing.product", "Sản phẩm")}</TableCell>
                          <TableCell width="20%">{t("purchasing.quantity", "Số lượng")}</TableCell>
                          <TableCell width="20%">
                            {t("purchasing.unitCost", "Đơn giá nhập (đ)")}
                          </TableCell>
                          <TableCell width="15%">
                            {t("purchasing.lineTotal", "Thành tiền")}
                          </TableCell>
                          <TableCell width="5%" align="center"></TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {lines.map((line, idx) => {
                          const lineTotal =
                            (Number(line.quantity) || 0) * (Number(line.unitCost) || 0);
                          return (
                            <TableRow key={idx}>
                              <TableCell>
                                <TextField
                                  select
                                  fullWidth
                                  size="small"
                                  id={`po-line-product-${idx}`}
                                  value={line.productId}
                                  onChange={(e) =>
                                    handleLineChange(idx, "productId", e.target.value)
                                  }
                                  required
                                  data-testid={`po-product-select-${idx}`}
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
                                  id={`po-line-quantity-${idx}`}
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
                                  id={`po-line-unit-cost-${idx}`}
                                  inputProps={{ min: 0, step: 1000 }}
                                  value={line.unitCost}
                                  onChange={(e) =>
                                    handleLineChange(
                                      idx,
                                      "unitCost",
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
                                  aria-label={t("purchasing.delete", "Xóa")}
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
                          {t("purchasing.totalQuantity", "Tổng số lượng:")}
                        </Typography>
                        <Typography fontWeight="bold">{totalQuantity}</Typography>
                      </Box>
                      <Box display="flex" justifyContent="space-between">
                        <Typography variant="subtitle1" fontWeight="bold">
                          {t("purchasing.totalAmount", "Tổng tiền nhập:")}
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
                <Button component={RouterLink} to="/purchasing/orders" variant="outlined">
                  {t("purchasing.cancel", "Hủy")}
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  startIcon={<SaveIcon />}
                  disabled={createMutation.isPending}
                  id="submit-po-btn"
                  data-testid="submit-po-button"
                >
                  {createMutation.isPending
                    ? t("purchasing.saving", "Đang xử lý...")
                    : t("purchasing.confirmCreate", "Xác nhận tạo đơn")}
                </Button>
              </Box>
            </Stack>
          </Box>
        </Stack>
      </Container>
    </Box>
  );
}
