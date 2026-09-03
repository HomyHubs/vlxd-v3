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
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { CreateWarehouseRequest } from "@vlxd/shared";
import { CreateWarehouseRequestSchema } from "@vlxd/shared";

import { AppHeader, useHasCapability } from "../../auth/index.js";
import { useCreateWarehouse, useWarehouses } from "../api/useWarehouses.js";

export function WarehousesPage() {
  const { t } = useTranslation();
  const canManageInventory = useHasCapability("inventory.manage");
  const [open, setOpen] = useState(false);
  const warehouses = useWarehouses();
  const createWarehouse = useCreateWarehouse();
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateWarehouseRequest>({
    resolver: zodResolver(CreateWarehouseRequestSchema),
    defaultValues: { code: "", name: "" },
  });

  async function submit(input: CreateWarehouseRequest) {
    await createWarehouse.mutateAsync(input);
    reset();
    setOpen(false);
  }

  return (
    <>
      <AppHeader />
      <Container maxWidth="lg">
        <Stack component="main" spacing={3} sx={{ py: 4 }}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={2}>
            <Box>
              <Typography component="h1" variant="h4">
                {t("warehouses.title")}
              </Typography>
              <Typography color="text.secondary">{t("warehouses.description")}</Typography>
            </Box>
            {canManageInventory && (
              <Button
                variant="contained"
                onClick={() => setOpen(true)}
                data-testid="add-warehouse-btn"
              >
                {t("warehouses.add")}
              </Button>
            )}
          </Stack>
          {warehouses.isError && <Alert severity="error">{t("warehouses.loadError")}</Alert>}
          <Stack spacing={1}>
            {warehouses.data?.items.map((warehouse) => (
              <Box
                key={warehouse.id}
                sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 2 }}
              >
                <Typography fontWeight={700}>{warehouse.code}</Typography>
                <Typography color="text.secondary">{warehouse.name}</Typography>
              </Box>
            ))}
          </Stack>
        </Stack>
      </Container>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <Box component="form" onSubmit={(event) => void handleSubmit(submit)(event)}>
          <DialogTitle>{t("warehouses.add")}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              {createWarehouse.error && (
                <Alert severity="error">
                  {t(`warehouses.errors.${createWarehouse.error.message}`, {
                    defaultValue: t("warehouses.errors.WAREHOUSE_CREATE_FAILED"),
                  })}
                </Alert>
              )}
              <Controller
                name="code"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label={t("warehouses.code")}
                    error={Boolean(errors.code)}
                    helperText={errors.code?.message}
                  />
                )}
              />
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label={t("warehouses.name")}
                    error={Boolean(errors.name)}
                    helperText={errors.name?.message}
                  />
                )}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)}>{t("warehouses.cancel")}</Button>
            <Button type="submit" variant="contained" disabled={createWarehouse.isPending}>
              {t("warehouses.save")}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </>
  );
}
