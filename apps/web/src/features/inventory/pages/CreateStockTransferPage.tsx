import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
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
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import SearchIcon from "@mui/icons-material/Search";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import type { Product } from "@vlxd/shared";

import { AppHeader, getCurrentSessionKey } from "../../auth/index.js";
import { useProducts } from "../../products/api/useProducts.js";
import { useWarehouses } from "../../warehouses/index.js";
import { useCreateStockTransfer } from "../api/useStockTransfers.js";

interface TransferLineItem {
  productId: string;
  quantity: number;
}

export function CreateStockTransferPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const warehousesQuery = useWarehouses();
  const [productSearch, setProductSearch] = useState("");
  const productsQuery = useProducts(1, 100, productSearch.trim());
  const createMutation = useCreateStockTransfer();

  const [sourceWarehouseId, setSourceWarehouseId] = useState("");
  const [destinationWarehouseId, setDestinationWarehouseId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<TransferLineItem[]>([{ productId: "", quantity: 1 }]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [knownProducts, setKnownProducts] = useState<Map<string, Product>>(new Map());

  const warehouses = warehousesQuery.data?.items ?? [];

  // Accumulate known products into persistent map so items selected from previous search remain visible
  useEffect(() => {
    const items = productsQuery.data?.items;
    if (!items || items.length === 0) return;

    setKnownProducts((prev) => {
      let hasNew = false;
      for (const item of items) {
        if (!prev.has(item.id)) {
          hasNew = true;
          break;
        }
      }
      if (!hasNew) return prev;

      const next = new Map(prev);
      for (const item of items) {
        next.set(item.id, item);
      }
      return next;
    });
  }, [productsQuery.data?.items]);

  const allSelectableProducts = useMemo(() => {
    const list = Array.from(knownProducts.values());
    if (!productSearch.trim()) return list;
    const term = productSearch.trim().toLowerCase();
    const selectedIds = new Set(lines.map((l) => l.productId).filter(Boolean));
    return list.filter(
      (p) =>
        selectedIds.has(p.id) ||
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term),
    );
  }, [knownProducts, productSearch, lines]);

  // Default selection when warehouses load
  useEffect(() => {
    if (warehouses.length >= 2) {
      if (!sourceWarehouseId) {
        setSourceWarehouseId(warehouses[0]!.id);
      }
      if (!destinationWarehouseId) {
        setDestinationWarehouseId(warehouses[1]!.id);
      }
    } else if (warehouses.length === 1 && !sourceWarehouseId) {
      setSourceWarehouseId(warehouses[0]!.id);
    }
  }, [warehouses, sourceWarehouseId, destinationWarehouseId]);

  // Default product selection
  useEffect(() => {
    if (allSelectableProducts.length > 0) {
      setLines((prev) => {
        if (prev.length === 1 && !prev[0]?.productId) {
          return [{ productId: allSelectableProducts[0]!.id, quantity: 1 }];
        }
        return prev;
      });
    }
  }, [allSelectableProducts]);

  const handleAddLine = () => {
    setLines([...lines, { productId: "", quantity: 1 }]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleLineChange = (
    index: number,
    field: keyof TransferLineItem,
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

  const getAvailableStock = (productId: string) => {
    if (!productId || !sourceWarehouseId) return 0;
    const prod = knownProducts.get(productId);
    if (!prod || !prod.stockLevels) return 0;
    const stock = prod.stockLevels.find((sl) => sl.warehouseId === sourceWarehouseId);
    return stock?.quantity ?? 0;
  };

  const isWarehouseSame =
    Boolean(sourceWarehouseId) &&
    Boolean(destinationWarehouseId) &&
    sourceWarehouseId === destinationWarehouseId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (warehouses.length < 2) {
      setErrorMessage(t("transfers.needAtLeastTwoWarehouses"));
      return;
    }

    if (!sourceWarehouseId || !destinationWarehouseId) {
      setErrorMessage(t("transfers.selectBothWarehouses"));
      return;
    }

    if (isWarehouseSame) {
      setErrorMessage(t("transfers.errorSameWarehouse"));
      return;
    }

    const validLines = lines.filter((l) => l.productId && l.quantity > 0);
    if (validLines.length === 0) {
      setErrorMessage(t("transfers.emptyLinesError"));
      return;
    }

    // Check duplicate products in lines
    const productIds = validLines.map((l) => l.productId);
    if (new Set(productIds).size !== productIds.length) {
      setErrorMessage(t("transfers.errorDuplicateProductInLines"));
      return;
    }

    const currentSessionKey = getCurrentSessionKey();

    try {
      const created = await createMutation.mutateAsync({
        sourceWarehouseId,
        destinationWarehouseId,
        note: note.trim() || undefined,
        lines: validLines,
      });

      if (currentSessionKey && getCurrentSessionKey() !== currentSessionKey) {
        return;
      }

      void navigate(`/inventory/transfers/${created.id}`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : t("transfers.createFailed");
      if (errMsg === "AUTH_CONTEXT_CHANGED") {
        return;
      }
      setErrorMessage(errMsg);
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
              to="/inventory/transfers"
              startIcon={<ArrowBackIcon />}
              variant="text"
            >
              {t("common.back")}
            </Button>
            <Box>
              <Typography component="h1" variant="h4" fontWeight={700}>
                {t("transfers.createTitle")}
              </Typography>
              <Typography color="text.secondary">{t("transfers.createDescription")}</Typography>
            </Box>
          </Stack>

          {errorMessage && (
            <Alert
              severity="error"
              onClose={() => setErrorMessage(null)}
              data-testid="transfer-error"
            >
              {errorMessage}
            </Alert>
          )}

          {warehouses.length < 2 && (
            <Alert severity="warning">{t("transfers.needAtLeastTwoWarehousesWarning")}</Alert>
          )}

          <form
            onSubmit={(e) => {
              void handleSubmit(e);
            }}
          >
            <Card variant="outlined">
              <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                  {t("transfers.routeSection")}
                </Typography>

                <Stack
                  direction={{ xs: "column", md: "row" }}
                  spacing={3}
                  alignItems="center"
                  sx={{ mb: 3 }}
                >
                  <TextField
                    select
                    fullWidth
                    label={t("transfers.sourceWarehouse")}
                    value={sourceWarehouseId}
                    onChange={(e) => setSourceWarehouseId(e.target.value)}
                    required
                    inputProps={{ "data-testid": "source-warehouse-select" }}
                  >
                    {warehouses.map((wh) => (
                      <MenuItem key={wh.id} value={wh.id}>
                        {wh.name} ({wh.code})
                      </MenuItem>
                    ))}
                  </TextField>

                  <Box sx={{ display: "flex", alignItems: "center" }}>
                    <CompareArrowsIcon color="action" sx={{ fontSize: 32 }} />
                  </Box>

                  <TextField
                    select
                    fullWidth
                    label={t("transfers.destinationWarehouse")}
                    value={destinationWarehouseId}
                    onChange={(e) => setDestinationWarehouseId(e.target.value)}
                    error={isWarehouseSame}
                    helperText={isWarehouseSame ? t("transfers.errorSameWarehouse") : undefined}
                    required
                    inputProps={{ "data-testid": "destination-warehouse-select" }}
                  >
                    {warehouses.map((wh) => (
                      <MenuItem key={wh.id} value={wh.id}>
                        {wh.name} ({wh.code})
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>

                <TextField
                  fullWidth
                  label={t("transfers.note")}
                  placeholder={t("transfers.notePlaceholder")}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  multiline
                  rows={2}
                  sx={{ mb: 3 }}
                  inputProps={{ "data-testid": "transfer-note-input" }}
                />

                <Divider sx={{ my: 3 }} />

                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  justifyContent="space-between"
                  alignItems={{ sm: "center" }}
                  spacing={2}
                  sx={{ mb: 2 }}
                >
                  <Typography variant="h6" fontWeight={600}>
                    {t("transfers.itemsSection")}
                  </Typography>

                  <Stack direction="row" spacing={2} alignItems="center">
                    <TextField
                      size="small"
                      placeholder={
                        t("transfers.searchProductPlaceholder") || "Tìm kiếm sản phẩm (tên/SKU)..."
                      }
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      slotProps={{
                        input: {
                          startAdornment: (
                            <SearchIcon fontSize="small" sx={{ mr: 1, color: "action" }} />
                          ),
                        },
                      }}
                      sx={{ minWidth: 260 }}
                      data-testid="search-product-input"
                    />

                    <Button
                      type="button"
                      variant="outlined"
                      startIcon={<AddIcon />}
                      onClick={handleAddLine}
                      data-testid="add-line-btn"
                    >
                      {t("transfers.addLine")}
                    </Button>
                  </Stack>
                </Stack>

                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ minWidth: 260 }}>{t("transfers.product")}</TableCell>
                        <TableCell sx={{ width: 140 }}>{t("transfers.unit")}</TableCell>
                        <TableCell sx={{ width: 160 }}>{t("transfers.availableStock")}</TableCell>
                        <TableCell sx={{ width: 160 }}>{t("transfers.transferQuantity")}</TableCell>
                        <TableCell sx={{ width: 60 }} align="center">
                          {t("common.delete")}
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {lines.map((line, index) => {
                        const selectedProduct = knownProducts.get(line.productId);
                        const available = getAvailableStock(line.productId);
                        const isOverStock = line.quantity > available;

                        return (
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
                                required
                                inputProps={{ "data-testid": `product-select-${index}` }}
                              >
                                {allSelectableProducts.map((p) => (
                                  <MenuItem key={p.id} value={p.id}>
                                    [{p.sku}] {p.name}
                                  </MenuItem>
                                ))}
                              </TextField>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" color="text.secondary">
                                {selectedProduct?.unitName ?? "—"}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={`${available.toLocaleString()} ${selectedProduct?.unitName ?? ""}`}
                                size="small"
                                color={available > 0 ? "default" : "error"}
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell>
                              <TextField
                                type="number"
                                size="small"
                                value={line.quantity}
                                onChange={(e) =>
                                  handleLineChange(index, "quantity", e.target.value)
                                }
                                error={isOverStock}
                                helperText={
                                  isOverStock ? t("transfers.overStockWarning") : undefined
                                }
                                slotProps={{
                                  htmlInput: {
                                    min: 1,
                                    "data-testid": `quantity-input-${index}`,
                                  },
                                }}
                                required
                              />
                            </TableCell>
                            <TableCell align="center">
                              <IconButton
                                size="small"
                                color="error"
                                disabled={lines.length <= 1}
                                onClick={() => handleRemoveLine(index)}
                                data-testid={`remove-line-${index}`}
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

                <Stack direction="row" justifyContent="flex-end" spacing={2} sx={{ mt: 4 }}>
                  <Button component={RouterLink} to="/inventory/transfers" variant="outlined">
                    {t("common.cancel")}
                  </Button>
                  <Button
                    type="submit"
                    variant="contained"
                    startIcon={<SaveIcon />}
                    disabled={createMutation.isPending || isWarehouseSame || warehouses.length < 2}
                    data-testid="submit-transfer-btn"
                  >
                    {createMutation.isPending ? t("common.saving") : t("transfers.submitCreate")}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </form>
        </Stack>
      </Container>
    </>
  );
}
