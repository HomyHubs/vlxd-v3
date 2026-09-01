import { Container, CssBaseline, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

import { SystemHealthCard } from "./features/health";

export function App() {
  const { t } = useTranslation();

  return (
    <>
      <CssBaseline />
      <Container maxWidth="md">
        <Stack
          component="main"
          spacing={4}
          sx={{ minHeight: "100vh", justifyContent: "center", py: 6 }}
        >
          <Stack spacing={0.5}>
            <Typography color="primary" fontWeight={700} variant="overline">
              {t("app.slice")}
            </Typography>
            <Typography component="p" color="text.secondary" variant="h6">
              {t("app.name")}
            </Typography>
          </Stack>
          <SystemHealthCard />
        </Stack>
      </Container>
    </>
  );
}
