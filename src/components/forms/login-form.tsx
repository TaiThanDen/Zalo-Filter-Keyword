"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: formData.get("email"),
          password: formData.get("password"),
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? "Đăng nhập thất bại");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <form action={handleSubmit} className="login-form">
      <div className="form-group">
        <label htmlFor="email">
          Email
        </label>
        <input id="email" name="email" type="email" className="field" placeholder="admin@example.com" autoComplete="email" required />
      </div>

      <div className="form-group">
        <label htmlFor="password">
          Mật khẩu
        </label>
        <input id="password" name="password" type="password" className="field" placeholder="••••••••" autoComplete="current-password" required />
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <button type="submit" className="btn btn-primary login-submit" disabled={pending}>
        {pending ? "Đang đăng nhập..." : "Đăng nhập"}
      </button>
    </form>
  );
}
