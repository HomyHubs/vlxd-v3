import { zodResolver } from "@hookform/resolvers/zod";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { LoginRequestSchema, type LoginRequest } from "@vlxd/shared";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import { useCurrentUser, useLogin } from "../api/useAuth.js";

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: session, isLoading: isCheckingAuth } = useCurrentUser();
  const loginMutation = useLogin();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({
    resolver: zodResolver(LoginRequestSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const locationState = location.state as { from?: { pathname?: string } } | null;
  const fromLocation = locationState?.from?.pathname ?? "/";

  useEffect(() => {
    if (session) {
      void navigate(fromLocation, { replace: true });
    }
  }, [session, navigate, fromLocation]);

  const onSubmit = async (data: LoginRequest) => {
    setErrorMessage(null);
    try {
      await loginMutation.mutateAsync(data);
      void navigate(fromLocation, { replace: true });
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "INVALID_CREDENTIALS") {
        setErrorMessage(t("auth.invalidCredentials"));
      } else {
        setErrorMessage(t("auth.genericError"));
      }
    }
  };

  if (isCheckingAuth) {
    return (
      <Container
        sx={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
        }}
        data-testid="auth-loading"
      >
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container
      maxWidth="sm"
      sx={{ minHeight: "100vh", display: "flex", alignItems: "center", py: 4 }}
    >
      <Card sx={{ width: "100%", p: { xs: 2, sm: 4 }, boxShadow: 3 }}>
        <CardContent>
          <Stack spacing={3} alignItems="center">
            <Avatar sx={{ bgcolor: "primary.main", width: 56, height: 56 }}>
              <LockOutlinedIcon fontSize="medium" />
            </Avatar>

            <Box textAlign="center">
              <Typography component="h1" variant="h5" fontWeight={700}>
                {t("auth.loginTitle")}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {t("auth.loginSubtitle")}
              </Typography>
            </Box>

            {errorMessage && (
              <Alert severity="error" sx={{ width: "100%" }} data-testid="login-error-alert">
                {errorMessage}
              </Alert>
            )}

            <Box
              component="form"
              onSubmit={(event) => {
                void handleSubmit(onSubmit)(event);
              }}
              noValidate
              sx={{ width: "100%" }}
            >
              <Stack spacing={2.5}>
                <TextField
                  id="email"
                  label={t("auth.emailLabel")}
                  placeholder={t("auth.emailPlaceholder")}
                  type="email"
                  fullWidth
                  autoComplete="email"
                  error={Boolean(errors.email)}
                  helperText={errors.email?.message}
                  {...register("email")}
                  slotProps={{
                    htmlInput: { "data-testid": "email-input" },
                  }}
                />

                <TextField
                  id="password"
                  label={t("auth.passwordLabel")}
                  placeholder={t("auth.passwordPlaceholder")}
                  type="password"
                  fullWidth
                  autoComplete="current-password"
                  error={Boolean(errors.password)}
                  helperText={errors.password?.message}
                  {...register("password")}
                  slotProps={{
                    htmlInput: { "data-testid": "password-input" },
                  }}
                />

                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  size="large"
                  disabled={isSubmitting || loginMutation.isPending}
                  data-testid="login-submit-button"
                  sx={{ py: 1.4, mt: 1 }}
                >
                  {isSubmitting || loginMutation.isPending
                    ? t("auth.loggingIn")
                    : t("auth.loginButton")}
                </Button>
              </Stack>
            </Box>
          </Stack>
        </CardContent>
      </Card>
    </Container>
  );
}
