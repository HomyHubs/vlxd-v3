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
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router-dom";

import { AppHeader, useHasCapability } from "../../auth/index.js";
import { useWarehouses } from "../../warehouses/index.js";
import { useStockTransfers } from "../api/useStockTransfers.js";

export function StockTransferListPage() {
  const { t } = useTranslation();
  const canManageInventory = useHasCapability("inventory.manage");
  const [sourceWarehouseFilter, setSourceWarehouseFilter] = useState<string>("");
  const [destinationWarehouseFilter, setDestinationWarehouseFilter] = useState<string>("");

  const warehousesQuery = useWarehouses();
  const transfersQuery = useStockTransfers(
    1,
    50,
    sourceWarehouseFilter || undefined,
    destinationWarehouseFilter || undefined,
  );

  const warehouses = warehousesQuery.data?.items ?? [];
  const transfers = transfersQuery.data?.items ?? [];

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
                {t("transfers.listTitle")}
              </Typography>
              <Typography color="text.secondary">{t("transfers.listDescription")}</Typography>
            </Box>
            {canManageInventory && (
              <Button
                component={RouterLink}
                to="/inventory/transfers/new"
                variant="contained"
                startIcon={<AddIcon />}
                data-testid="create-transfer-btn"
              >
                {t("transfers.newTransfer")}
              </Button>
            )}
          </Stack>

          <Card variant="outlined">
            <CardContent sx={{ p: 2 }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
                <TextField
                  select
                  size="small"
                  label={t("transfers.filterSourceWarehouse")}
                  value={sourceWarehouseFilter}
                  onChange={(e) => setSourceWarehouseFilter(e.target.value)}
                  sx={{ minWidth: 200 }}
                  data-testid="filter-source-warehouse"
                >
                  <MenuItem value="">{t("transfers.allWarehouses")}</MenuItem>
                  {warehouses.map((wh) => (
                    <MenuItem key={wh.id} value={wh.id}>
                      {wh.name} ({wh.code})
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  select
                  size="small"
                  label={t("transfers.filterDestinationWarehouse")}
                  value={destinationWarehouseFilter}
                  onChange={(e) => setDestinationWarehouseFilter(e.target.value)}
                  sx={{ minWidth: 200 }}
                  data-testid="filter-destination-warehouse"
                >
                  <MenuItem value="">{t("transfers.allWarehouses")}</MenuItem>
                  {warehouses.map((wh) => (
                    <MenuItem key={wh.id} value={wh.id}>
                      {wh.name} ({wh.code})
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>

              {transfersQuery.isLoading ? (
                <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
                  {t("common.loading")}
                </Typography>
              ) : transfers.length === 0 ? (
                <Box sx={{ py: 6, textAlign: "center" }}>
                  <Typography color="text.secondary" variant="body1">
                    {t("transfers.empty")}
                  </Typography>
                  {canManageInventory && (
                    <Button
                      component={RouterLink}
                      to="/inventory/transfers/new"
                      variant="outlined"
                      sx={{ mt: 2 }}
                      startIcon={<AddIcon />}
                    >
                      {t("transfers.newTransfer")}
                    </Button>
                  )}
                </Box>
              ) : (
                <TableContainer>
                  <Table size="medium">
                    <TableHead>
                      <TableRow>
                        <TableCell>{t("transfers.transferNumber")}</TableCell>
                        <TableCell>{t("transfers.createdAt")}</TableCell>
                        <TableCell>{t("transfers.route")}</TableCell>
                        <TableCell align="right">{t("transfers.itemCount")}</TableCell>
                        <TableCell align="right">{t("transfers.totalQuantity")}</TableCell>
                        <TableCell>{t("transfers.createdByName")}</TableCell>
                        <TableCell>{t("transfers.status")}</TableCell>
                        <TableCell align="center">{t("common.actions")}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {transfers.map((item) => (
                        <TableRow key={item.id} hover data-testid={`transfer-row-${item.id}`}>
                          <TableCell sx={{ fontWeight: 600 }}>{item.transferNumber}</TableCell>
                          <TableCell>
                            {new Date(item.createdAt).toLocaleString(undefined, {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" alignItems="center" spacing={1}>
                              <Typography variant="body2" fontWeight={500}>
                                {item.sourceWarehouseName}
                              </Typography>
                              <CompareArrowsIcon fontSize="small" color="action" />
                              <Typography variant="body2" fontWeight={500}>
                                {item.destinationWarehouseName}
                              </Typography>
                            </Stack>
                          </TableCell>
                          <TableCell align="right">{item.itemCount.toLocaleString()}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            {item.totalQuantity.toLocaleString()}
                          </TableCell>
                          <TableCell>{item.createdByName}</TableCell>
                          <TableCell>
                            <Chip
                              label={t("transfers.statusCompleted")}
                              color="success"
                              size="small"
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Button
                              component={RouterLink}
                              to={`/inventory/transfers/${item.id}`}
                              size="small"
                              variant="outlined"
                              startIcon={<VisibilityIcon />}
                              data-testid={`view-transfer-${item.id}`}
                            >
                              {t("common.view")}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Stack>
      </Container>
    </>
  );
}
