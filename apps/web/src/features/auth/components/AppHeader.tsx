import LogoutIcon from "@mui/icons-material/Logout";
import PersonIcon from "@mui/icons-material/Person";
import StorefrontIcon from "@mui/icons-material/Storefront";
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Chip,
  Container,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { useCurrentUser, useLogout } from "../api/useAuth.js";

export function AppHeader() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: session } = useCurrentUser();
  const logoutMutation = useLogout();

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      void navigate("/login", { replace: true });
    }
  };

  return (
    <AppBar position="static" color="inherit" elevation={1} sx={{ bgcolor: "background.paper" }}>
      <Container maxWidth="lg">
        <Toolbar disableGutters sx={{ justifyContent: "space-between", py: 1 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar sx={{ bgcolor: "primary.main", width: 36, height: 36 }}>
              <StorefrontIcon fontSize="small" />
            </Avatar>
            <Box>
              <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>
                {session?.tenant.name ?? t("app.name")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("app.slice")}
              </Typography>
            </Box>
          </Stack>

          {session && (
            <Stack direction="row" spacing={2} alignItems="center">
              <Chip
                icon={<PersonIcon fontSize="small" />}
                label={session.user.fullName}
                variant="outlined"
                color="primary"
                size="medium"
                data-testid="header-user-name"
              />
              {session.user.titles && session.user.titles.length > 0 && (
                <Chip
                  label={session.user.titles[0]}
                  variant="filled"
                  color={session.user.titles[0]?.includes("Chủ") ? "primary" : "secondary"}
                  size="small"
                  data-testid="header-user-title"
                />
              )}
              <Button
                variant="outlined"
                color="inherit"
                size="small"
                startIcon={<LogoutIcon />}
                onClick={() => {
                  void handleLogout();
                }}
                disabled={logoutMutation.isPending}
                data-testid="logout-button"
              >
                {t("auth.logoutButton")}
              </Button>
            </Stack>
          )}
        </Toolbar>
      </Container>
    </AppBar>
  );
}
