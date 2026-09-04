import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Box,
  Button,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { MRT_ColumnDef, MRT_PaginationState } from "material-react-table";
import { MaterialReactTable, useMaterialReactTable } from "material-react-table";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { CreateProductRequest, Product, UnitCode } from "@vlxd/shared";
import { CreateProductRequestSchema } from "@vlxd/shared";

import { AppHeader, useHasCapability } from "../../auth/index.js";
import { useCreateProduct, useProducts } from "../api/useProducts.js";
import { useWarehouses } from "../../warehouses/index.js";

const UNIT_CODES: UnitCode[] = ["vien", "bao", "tan", "kg", "m3", "cay", "tam", "thung"];

export function ProductsPage() {
  const { t } = useTranslation();
  const canManageProducts = useHasCapability("products.manage");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState<MRT_PaginationState>({ pageIndex: 0, pageSize: 20 });
  const products = useProducts(pagination.pageIndex + 1, pagination.pageSize, search);
  const warehouses = useWarehouses();
  const createProduct = useCreateProduct();
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateProductRequest>({
    resolver: zodResolver(CreateProductRequestSchema),
    defaultValues: { sku: "", name: "", unitCode: "bao" },
  });

  const columns = useMemo<MRT_ColumnDef<Product>[]>(
    () => [
      { accessorKey: "sku", header: t("products.sku") },
      { accessorKey: "name", header: t("products.name") },
      { accessorKey: "unitName", header: t("products.unit") },
      ...((warehouses.data?.items ?? []).map((warehouse) => ({
        id: `stock-${warehouse.id}`,
        header: warehouse.code,
        accessorFn: (product: Product) =>
          product.stockLevels.find((level) => level.warehouseId === warehouse.id)?.quantity ?? 0,
      })) satisfies MRT_ColumnDef<Product>[]),
    ],
    [t, warehouses.data?.items],
  );

  const table = useMaterialReactTable({
    columns,
    data: products.data?.items ?? [],
    manualPagination: true,
    rowCount: products.data?.total ?? 0,
    onPaginationChange: setPagination,
    state: { pagination, isLoading: products.isLoading },
    enableGlobalFilter: false,
  });

  async function submit(input: CreateProductRequest) {
    try {
      await createProduct.mutateAsync(input);
      reset();
      setOpen(false);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "AUTH_CONTEXT_CHANGED") {
        reset();
        setOpen(false);
      }
    }
  }

  const createError = createProduct.error?.message;

  return (
    <>
      <AppHeader />
      <Container maxWidth="lg">
        <Stack component="main" spacing={3} sx={{ py: 4 }}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={2}>
            <Box>
              <Typography component="h1" variant="h4">
                {t("products.title")}
              </Typography>
              <Typography color="text.secondary">{t("products.description")}</Typography>
            </Box>
            {canManageProducts && (
              <Button
                variant="contained"
                onClick={() => setOpen(true)}
                data-testid="add-product-btn"
              >
                {t("products.add")}
              </Button>
            )}
          </Stack>
          <TextField
            label={t("products.search")}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPagination((value) => ({ ...value, pageIndex: 0 }));
            }}
          />
          {products.isError && <Alert severity="error">{t("products.loadError")}</Alert>}
          <MaterialReactTable table={table} />
        </Stack>
      </Container>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <Box component="form" onSubmit={(event) => void handleSubmit(submit)(event)}>
          <DialogTitle>{t("products.add")}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              {createError && (
                <Alert severity="error">
                  {t(`products.errors.${createError}`, {
                    defaultValue: t("products.errors.PRODUCT_CREATE_FAILED"),
                  })}
                </Alert>
              )}
              <Controller
                name="sku"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label={t("products.sku")}
                    error={Boolean(errors.sku)}
                    helperText={errors.sku?.message}
                  />
                )}
              />
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label={t("products.name")}
                    error={Boolean(errors.name)}
                    helperText={errors.name?.message}
                  />
                )}
              />
              <Controller
                name="unitCode"
                control={control}
                render={({ field }) => (
                  <TextField {...field} select label={t("products.unit")}>
                    {UNIT_CODES.map((code) => (
                      <MenuItem key={code} value={code}>
                        {t(`products.units.${code}`)}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)}>{t("products.cancel")}</Button>
            <Button type="submit" variant="contained" disabled={createProduct.isPending}>
              {createProduct.isPending ? t("products.saving") : t("products.save")}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </>
  );
}
