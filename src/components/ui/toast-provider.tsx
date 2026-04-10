"use client";

import { Toaster } from "react-hot-toast";

export function ToastProvider() {
  return (
    <Toaster
      position="top-center"
      toastOptions={{
        duration: 3200,
        style: {
          borderRadius: "16px",
          border: "1px solid rgba(216, 205, 179, 1)",
          background: "#fff9ee",
          color: "#111827",
          boxShadow: "0 18px 40px rgba(17, 24, 39, 0.12)",
          padding: "14px 16px",
        },
        success: {
          iconTheme: {
            primary: "#1f7a4c",
            secondary: "#fff9ee",
          },
        },
        error: {
          iconTheme: {
            primary: "#b42318",
            secondary: "#fff9ee",
          },
        },
      }}
    />
  );
}
