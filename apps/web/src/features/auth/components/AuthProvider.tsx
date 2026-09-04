import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { getAuthBroadcastChannel, handleRemoteAuthTransition } from "../api/useAuth.js";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = getAuthBroadcastChannel();
    if (!channel) return;

    const handler = (event: MessageEvent<{ type: string }>) => {
      if (event.data?.type === "AUTH_CHANGED") {
        handleRemoteAuthTransition(queryClient);
      }
    };

    channel.addEventListener("message", handler);
    return () => {
      channel.removeEventListener("message", handler);
    };
  }, [queryClient]);

  return <>{children}</>;
}
