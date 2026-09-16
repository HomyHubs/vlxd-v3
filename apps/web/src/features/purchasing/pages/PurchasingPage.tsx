import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Grid,
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
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import { useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router-dom";

import { AppHeader, useHasCapability } from "../../auth/index.js";
import { useCreateSupplier, useSuppliers } from "../api/usePurchaseOrders.js";

export function PurchasingPage() {
  const { t } = useTranslation();
  const canManage = useHasCapability("purchasing.manage");

  const suppliersQuery = useSuppliers();
  const createMutation = useCreateSupplier();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const suppliers = suppliersQuery.data?.items ?? [];

  const handleCreate = async () => {
    setError("");
    try {
      await createMutation.mutateAsync({
        code: code.trim(),
        name: name.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        note: note.trim() || undefined,
      });
      setCode("");
      setName("");
      setPhone("");
      setAddress("");
      setNote("");
    } catch (err: unknown) {
      const errCode = err instanceof Error ? err.name || err.message : "";
      if (errCode === "SUPPLIER_CODE_EXISTS") {
        setError(t("purchasing.supplierCodeExists", "Mã nhà cung cấp đã tồn tại"));
      } else if (errCode === "AUTH_CONTEXT_CHANGED") {
        return;
      } else {
        setError(t("purchasing.createSupplierFailed", "Không thể tạo nhà cung cấp"));
      }
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "grey.50" }}>
      <AppHeader />
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Stack spacing={3}>
          <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap">
            <Typography variant="h5" component="h1" fontWeight="bold">
              {t("purchasing.title", "Nhà cung cấp & mua hàng")}
            </Typography>
            <Button
              component={RouterLink}
              to="/purchasing/orders"
              variant="contained"
              startIcon={<ReceiptLongIcon />}
              data-testid="nav-purchase-orders-btn"
            >
              {t("purchasing.ordersTitle", "Đơn mua hàng")}
            </Button>
          </Box>

          {canManage && (
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  {t("purchasing.addSupplier", "Thêm nhà cung cấp")}
                </Typography>
                {error && (
                  <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
                    {error}
                  </Alert>
                )}
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label={t("purchasing.code", "Mã nhà cung cấp")}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      data-testid="supplier-code-input"
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 8 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label={t("purchasing.name", "Tên nhà cung cấp")}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      data-testid="supplier-name-input"
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label={t("purchasing.phone", "Số điện thoại")}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 8 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label={t("purchasing.address", "Địa chỉ")}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label={t("purchasing.note", "Ghi chú")}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <Button
                      variant="contained"
                      disabled={!code.trim() || !name.trim() || createMutation.isPending}
                      onClick={() => void handleCreate()}
                      data-testid="submit-supplier-btn"
                    >
                      {createMutation.isPending
                        ? t("purchasing.saving", "Đang lưu...")
                        : t("purchasing.save", "Lưu")}
                    </Button>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          )}

          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                {t("purchasing.suppliers", "Danh sách nhà cung cấp")}
              </Typography>
              {suppliersQuery.isError && (
                <Alert severity="error">
                  {t("purchasing.loadSuppliersFailed", "Không thể tải danh sách nhà cung cấp")}
                </Alert>
              )}
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t("purchasing.code", "Mã")}</TableCell>
                      <TableCell>{t("purchasing.name", "Tên nhà cung cấp")}</TableCell>
                      <TableCell>{t("purchasing.phone", "Điện thoại")}</TableCell>
                      <TableCell>{t("purchasing.address", "Địa chỉ")}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {suppliersQuery.isLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                          <Typography color="text.secondary">
                            {t("purchasing.loading", "Đang tải...")}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : suppliers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                          <Typography color="text.secondary">
                            {t("purchasing.emptySuppliers", "Chưa có nhà cung cấp nào")}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      suppliers.map((s) => (
                        <TableRow key={s.id} hover>
                          <TableCell sx={{ fontWeight: "medium" }}>{s.code}</TableCell>
                          <TableCell>{s.name}</TableCell>
                          <TableCell>{s.phone ?? "-"}</TableCell>
                          <TableCell>{s.address ?? "-"}</TableCell>
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
    </Box>
  );
}
