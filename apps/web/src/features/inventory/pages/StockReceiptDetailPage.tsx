import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Divider,
  Grid,
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
import { useTranslation } from "react-i18next";
import { Link as RouterLink, useParams } from "react-router-dom";

import { AppHeader } from "../../auth/index.js";
import { useStockReceipt } from "../api/useStockReceipts.js";

export function StockReceiptDetailPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams<{ id: string }>();
  const receiptQuery = useStockReceipt(id);

  const receipt = receiptQuery.data;

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
              {t("inventory.detailTitle")}
            </Typography>
          </Stack>

          {receiptQuery.isLoading && (
            <Typography color="text.secondary">{t("inventory.loading")}</Typography>
          )}

          {receiptQuery.isError && (
            <Alert severity="error">{t("inventory.errors.loadDetailFailed")}</Alert>
          )}

          {receipt && (
            <Stack spacing={3}>
              <Card variant="outlined">
                <CardContent sx={{ p: 3 }}>
                  <Stack spacing={2}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      justifyContent="space-between"
                      alignItems={{ sm: "center" }}
                      gap={1}
                    >
                      <Box>
                        <Typography variant="overline" color="text.secondary">
                          {t("inventory.receiptNumber")}
                        </Typography>
                        <Typography variant="h5" fontWeight={700}>
                          {receipt.receiptNumber}
                        </Typography>
                      </Box>
                      <Chip
                        label={t(`inventory.statuses.${receipt.status}`, {
                          defaultValue: receipt.status,
                        })}
                        color="success"
                      />
                    </Stack>

                    <Divider />

                    <Grid container spacing={3}>
                      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                        <Typography variant="body2" color="text.secondary">
                          {t("inventory.warehouse")}
                        </Typography>
                        <Typography variant="subtitle1" fontWeight={600}>
                          {receipt.warehouseName} ({receipt.warehouseCode})
                        </Typography>
                      </Grid>

                      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                        <Typography variant="body2" color="text.secondary">
                          {t("inventory.createdAt")}
                        </Typography>
                        <Typography variant="subtitle1">
                          {new Date(receipt.createdAt).toLocaleString()}
                        </Typography>
                      </Grid>

                      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                        <Typography variant="body2" color="text.secondary">
                          {t("inventory.createdBy")}
                        </Typography>
                        <Typography variant="subtitle1">{receipt.createdByName}</Typography>
                      </Grid>

                      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                        <Typography variant="body2" color="text.secondary">
                          {t("inventory.totalQuantity")}
                        </Typography>
                        <Typography variant="h6" color="primary" fontWeight={700}>
                          {receipt.totalQuantity}
                        </Typography>
                      </Grid>
                    </Grid>

                    {receipt.note && (
                      <Box sx={{ bgcolor: "action.hover", p: 1.5, borderRadius: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                          {t("inventory.note")}: {receipt.note}
                        </Typography>
                      </Box>
                    )}
                  </Stack>
                </CardContent>
              </Card>

              <Card variant="outlined">
                <CardContent sx={{ p: 3 }}>
                  <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                    {t("inventory.itemsTitle")}
                  </Typography>

                  <TableContainer>
                    <Table size="medium">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 600 }}>#</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>
                            {t("inventory.productCol")}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>{t("products.sku")}</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>{t("products.unit")}</TableCell>
                          <TableCell sx={{ fontWeight: 600 }} align="right">
                            {t("inventory.quantityCol")}
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {receipt.lines.map((line, index) => (
                          <TableRow key={line.id} hover>
                            <TableCell>{index + 1}</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{line.productName}</TableCell>
                            <TableCell>{line.productSku}</TableCell>
                            <TableCell>{line.unitName}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                              {line.quantity}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>
            </Stack>
          )}
        </Stack>
      </Container>
    </>
  );
}
