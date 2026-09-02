import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";

import { useHealthCheck } from "../api/useHealthCheck";

export function SystemHealthCard() {
  const { t } = useTranslation();
  const health = useHealthCheck();

  const errorMessage =
    health.error instanceof Error && health.error.message === "DATABASE_UNAVAILABLE"
      ? t("health.databaseUnavailable")
      : t("health.unknownError");

  return (
    <Card component="section" sx={{ width: "100%", maxWidth: 640 }}>
      <CardContent>
        <Stack spacing={3}>
          <Stack spacing={1}>
            <Typography component="h1" variant="h4">
              {t("health.title")}
            </Typography>
            <Typography color="text.secondary">{t("health.description")}</Typography>
          </Stack>

          <Button
            variant="contained"
            size="large"
            disabled={health.isFetching}
            onClick={() => {
              void health.refetch();
            }}
            startIcon={
              health.isFetching ? (
                <CircularProgress color="inherit" size={18} />
              ) : (
                <CheckCircleOutlineIcon />
              )
            }
          >
            {health.isFetching ? t("health.checking") : t("health.action")}
          </Button>

          {health.data ? <Alert severity="success">{t("health.success")}</Alert> : null}
          {health.isError ? <Alert severity="error">{errorMessage}</Alert> : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
