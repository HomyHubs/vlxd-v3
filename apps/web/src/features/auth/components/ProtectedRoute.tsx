import { CircularProgress, Container } from "@mui/material";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useCurrentUser } from "../api/useAuth.js";

export interface ProtectedRouteProps {
  requiredCapability?: string;
}

export function ProtectedRoute({ requiredCapability }: ProtectedRouteProps = {}) {
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

  if (requiredCapability && !session.user.capabilities?.includes(requiredCapability)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
