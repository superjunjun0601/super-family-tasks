"use client";

import { useEffect } from "react";
import { appServiceName } from "@/lib/app-metadata";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const isLocalhostPreview =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "0.0.0.0";

    if (process.env.NODE_ENV !== "production" || isLocalhostPreview) {
      clearPwaArtifacts();
      return;
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => registration.update())
      .catch(() => {
        // PWA installability should not block normal app usage.
      });
  }, []);

  return null;
}

function clearPwaArtifacts() {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
  window.caches?.keys().then((keys) => {
    keys
      .filter((key) => key.startsWith(appServiceName))
      .forEach((key) => window.caches.delete(key));
  });
}
