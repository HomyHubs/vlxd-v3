import { useState } from "react";
import { Alert, Button, Card, CardContent, Stack, TextField, Typography } from "@mui/material";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiClient } from "../../../lib/apiClient.js";

export function PurchasingPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await apiClient.GET("/suppliers");
      if (error) throw new Error("load");
      return data;
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await apiClient.POST("/suppliers", { body: { code, name } });
      if (error) throw new Error("create");
      return data;
    },
    onSuccess: () => {
      setCode("");
      setName("");
      setError("");
      void qc.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: () => setError(t("purchasing.createFailed", "Không thể tạo nhà cung cấp")),
  });
  return (
    <Stack spacing={3}>
      <Typography variant="h4">{t("purchasing.title", "Nhà cung cấp & mua hàng")}</Typography>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">{t("purchasing.addSupplier", "Thêm nhà cung cấp")}</Typography>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label={t("purchasing.code", "Mã nhà cung cấp")}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <TextField
              label={t("purchasing.name", "Tên nhà cung cấp")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button
              variant="contained"
              disabled={!code.trim() || !name.trim() || create.isPending}
              onClick={() => create.mutate()}
            >
              {t("common.save", "Lưu")}
            </Button>
          </Stack>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {t("purchasing.suppliers", "Danh sách nhà cung cấp")}
          </Typography>
          {suppliers.isLoading ? (
            <Typography>...</Typography>
          ) : (
            suppliers.data?.items.map((s) => (
              <Typography key={s.id}>
                {s.code} — {s.name}
              </Typography>
            ))
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
