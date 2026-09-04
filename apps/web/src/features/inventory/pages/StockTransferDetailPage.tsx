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
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import { useTranslation } from "react-i18next";
import { Link as RouterLink, useParams } from "react-router-dom";

import { AppHeader } from "../../auth/index.js";
import { useStockTransfer } from "../api/useStockTransfers.js";

export function StockTransferDetailPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams<{ id: string }>();
  const transferQuery = useStockTransfer(id);

  const transfer = transferQuery.data;

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
              color="inherit"
              size="small"
            >
              {t("transfers.backToList")}
            </Button>
            <Typography component="h1" variant="h4" fontWeight={700}>
              {t("transfers.detailTitle")}
            </Typography>
          </Stack>

          {transferQuery.isLoading && (
            <Typography color="text.secondary">{t("common.loading")}</Typography>
          )}

          {transferQuery.isError && (
            <Alert severity="error">{t("transfers.loadDetailFailed")}</Alert>
          )}

          {transfer && (
            <Card variant="outlined" data-testid="transfer-detail-card">
              <CardContent sx={{ p: 3 }}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  justifyContent="space-between"
                  alignItems={{ sm: "center" }}
                  gap={2}
                  sx={{ mb: 3 }}
                >
                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      {t("transfers.transferNumber")}
                    </Typography>
                    <Typography variant="h5" fontWeight={700}>
                      {transfer.transferNumber}
                    </Typography>
                  </Box>
                  <Chip
                    label={t("transfers.statusCompleted")}
                    color="success"
                    size="medium"
                    variant="outlined"
                  />
                </Stack>

                <Divider sx={{ mb: 3 }} />

                <Grid container spacing={3} sx={{ mb: 3 }}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="overline" color="text.secondary">
                      {t("transfers.route")}
                    </Typography>
                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mt: 0.5 }}>
                      <Box>
                        <Typography variant="body1" fontWeight={600}>
                          {transfer.sourceWarehouseName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {transfer.sourceWarehouseCode} ({t("transfers.sourceLabel")})
                        </Typography>
                      </Box>
                      <CompareArrowsIcon color="action" />
                      <Box>
                        <Typography variant="body1" fontWeight={600}>
                          {transfer.destinationWarehouseName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {transfer.destinationWarehouseCode} ({t("transfers.destLabel")})
                        </Typography>
                      </Box>
                    </Stack>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Typography variant="overline" color="text.secondary">
                      {t("transfers.createdAt")}
                    </Typography>
                    <Typography variant="body1">
                      {new Date(transfer.createdAt).toLocaleString(undefined, {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Typography>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Typography variant="overline" color="text.secondary">
                      {t("transfers.createdByName")}
                    </Typography>
                    <Typography variant="body1">{transfer.createdByName}</Typography>
                  </Grid>
                </Grid>

                {transfer.note && (
                  <Box sx={{ mb: 3, p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>
                      {t("transfers.noteLabel")}
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      {transfer.note}
                    </Typography>
                  </Box>
                )}

                <Divider sx={{ mb: 3 }} />

                <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                  {t("transfers.itemsList")}
                </Typography>

                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ width: 60 }}>#</TableCell>
                        <TableCell>{t("transfers.productSku")}</TableCell>
                        <TableCell>{t("transfers.productName")}</TableCell>
                        <TableCell>{t("transfers.unit")}</TableCell>
                        <TableCell align="right">{t("transfers.transferQuantity")}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {transfer.lines.map((line, idx) => (
                        <TableRow key={line.id}>
                          <TableCell>{idx + 1}</TableCell>
                          <TableCell sx={{ fontFamily: "monospace" }}>{line.productSku}</TableCell>
                          <TableCell sx={{ fontWeight: 500 }}>{line.productName}</TableCell>
                          <TableCell>{line.unitName}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            {line.quantity.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell colSpan={4} sx={{ fontWeight: 700, textAlign: "right" }}>
                          {t("transfers.totalQuantityLabel")}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, fontSize: "1.05rem" }}>
                          {transfer.totalQuantity.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          )}
        </Stack>
      </Container>
    </>
  );
}
