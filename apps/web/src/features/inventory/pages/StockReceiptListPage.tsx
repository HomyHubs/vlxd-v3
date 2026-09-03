import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
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
import VisibilityIcon from "@mui/icons-material/Visibility";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router-dom";

import { AppHeader, useHasCapability } from "../../auth/index.js";
import { useWarehouses } from "../../warehouses/index.js";
import { useStockReceipts } from "../api/useStockReceipts.js";

export function StockReceiptListPage() {
  const { t } = useTranslation();
  const canManageInventory = useHasCapability("inventory.manage");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("");
  const warehousesQuery = useWarehouses();
  const receiptsQuery = useStockReceipts(1, 50, warehouseFilter || undefined);

  const warehouses = warehousesQuery.data?.items ?? [];
  const receipts = receiptsQuery.data?.items ?? [];

  return (
    <>
      <AppHeader />
      <Container maxWidth="lg">
        <Stack component="main" spacing={3} sx={{ py: 4 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            justifyContent="space-between"
            alignItems={{ sm: "center" }}
            gap={2}
          >
            <Box>
              <Typography component="h1" variant="h4" fontWeight={700}>
                {t("inventory.listTitle")}
              </Typography>
              <Typography color="text.secondary">{t("inventory.listDescription")}</Typography>
            </Box>
            {canManageInventory && (
              <Button
                component={RouterLink}
                to="/inventory/receipts/new"
                variant="contained"
                startIcon={<AddIcon />}
                data-testid="create-receipt-btn"
              >
                {t("inventory.newReceipt")}
              </Button>
            )}
          </Stack>

          <Card variant="outlined">
            <CardContent sx={{ p: 2 }}>
              <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                <TextField
                  select
                  size="small"
                  label={t("inventory.filterWarehouse")}
                  value={warehouseFilter}
                  onChange={(e) => setWarehouseFilter(e.target.value)}
                  sx={{ minWidth: 200 }}
                >
                  <MenuItem value="">{t("inventory.allWarehouses")}</MenuItem>
                  {warehouses.map((wh) => (
                    <MenuItem key={wh.id} value={wh.id}>
                      {wh.name} ({wh.code})
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>

              <TableContainer>
                <Table size="medium">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>{t("inventory.receiptNumber")}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{t("inventory.warehouse")}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{t("inventory.createdAt")}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{t("inventory.createdBy")}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="right">
                        {t("inventory.itemCount")}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="right">
                        {t("inventory.totalQuantity")}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{t("inventory.status")}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="center">
                        {t("inventory.actions")}
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {receiptsQuery.isLoading ? (
                      <TableRow>
                        <TableCell colSpan={8} align="center">
                          <Typography color="text.secondary" sx={{ py: 3 }}>
                            {t("inventory.loading")}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : receipts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} align="center">
                          <Typography color="text.secondary" sx={{ py: 4 }}>
                            {t("inventory.emptyReceipts")}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      receipts.map((receipt) => (
                        <TableRow key={receipt.id} hover>
                          <TableCell sx={{ fontWeight: 600 }}>{receipt.receiptNumber}</TableCell>
                          <TableCell>{receipt.warehouseName}</TableCell>
                          <TableCell>{new Date(receipt.createdAt).toLocaleString()}</TableCell>
                          <TableCell>{receipt.createdByName}</TableCell>
                          <TableCell align="right">{receipt.itemCount}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            {receipt.totalQuantity}
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={t(`inventory.statuses.${receipt.status}`, {
                                defaultValue: receipt.status,
                              })}
                              color="success"
                              size="small"
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Button
                              component={RouterLink}
                              to={`/inventory/receipts/${receipt.id}`}
                              size="small"
                              startIcon={<VisibilityIcon />}
                              variant="outlined"
                            >
                              {t("inventory.viewDetail")}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Stack>
      </Container>
    </>
  );
}
