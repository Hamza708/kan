import { useCallback, useEffect, useRef, useState } from "react";

type Permission = "default" | "granted" | "denied";

export function useDesktopNotifications() {
  const [permission, setPermission] = useState<Permission>("default");
  const swRegistered = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      swRegistered.current
    )
      return;

    swRegistered.current = true;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => {
        // SW registration failed — desktop notifications will still work in foreground
      });
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }, []);

  const showNotification = useCallback(
    (title: string, body: string, url?: string | null) => {
      if (
        typeof window === "undefined" ||
        !("Notification" in window) ||
        Notification.permission !== "granted"
      )
        return;

      // Use service worker if available so clicks can navigate even in background
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready
          .then((reg) =>
            reg.showNotification(title, {
              body,
              icon: "/favicon.svg",
              tag: "kan-notification",
              data: { url: url ?? "/" },
            }),
          )
          .catch(() => {
            // Fall back to plain Notification
            const n = new Notification(title, { body, icon: "/favicon.svg" });
            if (url) n.onclick = () => { window.focus(); window.location.href = url; };
          });
      } else {
        const n = new Notification(title, { body, icon: "/favicon.svg" });
        if (url) n.onclick = () => { window.focus(); window.location.href = url; };
      }
    },
    [],
  );

  return { permission, requestPermission, showNotification };
}
