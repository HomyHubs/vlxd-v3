import { CircularProgress, Container } from "@mui/material";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useCurrentUser } from "../api/useAuth.js";

export function ProtectedRoute() {
  const { data: session, isLoading } = useCurrentUser();
  const location = useLocation();

  if (isLoading) {
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

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
