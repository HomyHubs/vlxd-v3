import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Divider,
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
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, useNavigate } from "react-router-dom";

import { AppHeader } from "../../auth/index.js";
import { useProducts } from "../../products/api/useProducts.js";
import { useWarehouses } from "../../warehouses/index.js";
import { useCreateStockReceipt } from "../api/useStockReceipts.js";

interface ReceiptLineItem {
  productId: string;
  quantity: number;
}

export function CreateStockReceiptPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const warehousesQuery = useWarehouses();
  const productsQuery = useProducts(1, 100, "");
  const createMutation = useCreateStockReceipt();

  const [warehouseId, setWarehouseId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<ReceiptLineItem[]>([{ productId: "", quantity: 1 }]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const warehouses = warehousesQuery.data?.items ?? [];
  const products = productsQuery.data?.items ?? [];

  const handleAddLine = () => {
    setLines([...lines, { productId: "", quantity: 1 }]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleLineChange = (
    index: number,
    field: keyof ReceiptLineItem,
    value: string | number,
  ) => {
    const updated = [...lines];
    if (field === "quantity") {
      updated[index] = { ...updated[index]!, quantity: Math.max(1, Number(value) || 1) };
    } else {
      updated[index] = { ...updated[index]!, productId: String(value) };
    }
    setLines(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!warehouseId) {
      setErrorMessage(t("inventory.errors.warehouseRequired"));
      return;
    }

    const invalidLine = lines.find((l) => !l.productId || l.quantity <= 0);
    if (invalidLine || lines.length === 0) {
      setErrorMessage(t("inventory.errors.invalidLines"));
      return;
    }

    try {
      const result = await createMutation.mutateAsync({
        warehouseId,
        note: note.trim() || undefined,
        lines,
      });
      void navigate(`/inventory/receipts/${result.id}`);
    } catch (err: unknown) {
      const code = err instanceof Error ? err.message : "UNKNOWN";
      setErrorMessage(
        t(`inventory.errors.${code}`, {
          defaultValue: t("inventory.errors.createFailed"),
        }),
      );
    }
  };

  return (
    <>
      <AppHeader />
      <Container maxWidth="lg">
        <Stack component="main" spacing={3} sx={{ py: 4 }}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Button
              component={RouterLink}
              to="/inventory/receipts"
              startIcon={<ArrowBackIcon />}
              color="inherit"
              size="small"
            >
              {t("inventory.backToList")}
            </Button>
            <Typography component="h1" variant="h4" fontWeight={700}>
              {t("inventory.createTitle")}
            </Typography>
          </Stack>

          {errorMessage && (
            <Alert severity="error" onClose={() => setErrorMessage(null)}>
              {errorMessage}
            </Alert>
          )}

          <Card variant="outlined">
            <CardContent sx={{ p: 3 }}>
              <Box
                component="form"
                onSubmit={(e) => {
                  void handleSubmit(e);
                }}
                noValidate
              >
                <Stack spacing={3}>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                    <TextField
                      select
                      required
                      fullWidth
                      label={t("inventory.selectWarehouse")}
                      value={warehouseId}
                      onChange={(e) => setWarehouseId(e.target.value)}
                      disabled={createMutation.isPending}
                      data-testid="warehouse-select"
                    >
                      {warehouses.map((wh) => (
                        <MenuItem key={wh.id} value={wh.id}>
                          {wh.name} ({wh.code})
                        </MenuItem>
                      ))}
                    </TextField>

                    <TextField
                      fullWidth
                      label={t("inventory.note")}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      disabled={createMutation.isPending}
                      placeholder={t("inventory.notePlaceholder")}
                    />
                  </Stack>

                  <Divider />

                  <Stack spacing={2}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="h6" fontWeight={600}>
                        {t("inventory.itemsTitle")}
                      </Typography>
                      <Button
                        startIcon={<AddIcon />}
                        variant="outlined"
                        size="small"
                        onClick={handleAddLine}
                        disabled={createMutation.isPending}
                        data-testid="add-line-button"
                      >
                        {t("inventory.addLine")}
                      </Button>
                    </Stack>

                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ minWidth: 260 }}>
                              {t("inventory.productCol")}
                            </TableCell>
                            <TableCell sx={{ width: 140 }}>{t("inventory.quantityCol")}</TableCell>
                            <TableCell sx={{ width: 80 }} align="center">
                              {t("inventory.actionCol")}
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {lines.map((line, index) => (
                            <TableRow key={index}>
                              <TableCell>
                                <TextField
                                  select
                                  fullWidth
                                  size="small"
                                  value={line.productId}
                                  onChange={(e) =>
                                    handleLineChange(index, "productId", e.target.value)
                                  }
                                  disabled={createMutation.isPending}
                                  data-testid={`product-select-${index}`}
                                >
                                  {products.map((p) => (
                                    <MenuItem key={p.id} value={p.id}>
                                      {p.name} [{p.sku}] - ({p.unitName})
                                    </MenuItem>
                                  ))}
                                </TextField>
                              </TableCell>
                              <TableCell>
                                <TextField
                                  fullWidth
                                  size="small"
                                  type="number"
                                  inputProps={{ min: 1 }}
                                  value={line.quantity}
                                  onChange={(e) =>
                                    handleLineChange(index, "quantity", e.target.value)
                                  }
                                  disabled={createMutation.isPending}
                                  data-testid={`quantity-input-${index}`}
                                />
                              </TableCell>
                              <TableCell align="center">
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => handleRemoveLine(index)}
                                  disabled={lines.length <= 1 || createMutation.isPending}
                                  title={t("inventory.removeLine")}
                                >
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Stack>

                  <Stack direction="row" justifyContent="flex-end" spacing={2} sx={{ pt: 2 }}>
                    <Button
                      component={RouterLink}
                      to="/inventory/receipts"
                      color="inherit"
                      disabled={createMutation.isPending}
                    >
                      {t("inventory.cancel")}
                    </Button>
                    <Button
                      type="submit"
                      variant="contained"
                      startIcon={<SaveIcon />}
                      disabled={createMutation.isPending}
                      data-testid="submit-receipt-button"
                    >
                      {createMutation.isPending
                        ? t("inventory.saving")
                        : t("inventory.saveReceipt")}
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            </CardContent>
          </Card>
        </Stack>
      </Container>
    </>
  );
}
