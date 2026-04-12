"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

type JsonActionFormProps = {
  endpoint: string;
  method: "POST" | "PATCH" | "DELETE";
  successMessage: string;
  errorMessage?: string;
  className?: string;
  children: React.ReactNode;
  booleanFields?: string[];
  arrayFields?: string[];
  nullIfEmptyFields?: string[];
  resetOnSuccess?: boolean;
  confirmMessage?: string;
};

function buildPayload(formData: FormData, options: Pick<JsonActionFormProps, "booleanFields" | "arrayFields" | "nullIfEmptyFields">) {
  const payload: Record<string, unknown> = {};
  const booleanFields = new Set(options.booleanFields ?? []);
  const arrayFields = new Set(options.arrayFields ?? []);
  const nullIfEmptyFields = new Set(options.nullIfEmptyFields ?? []);

  for (const field of arrayFields) {
    payload[field] = formData.getAll(field).map((value) => String(value)).filter(Boolean);
  }

  for (const field of booleanFields) {
    payload[field] = formData.get(field) === "on";
  }

  for (const [key, value] of formData.entries()) {
    if (arrayFields.has(key) || booleanFields.has(key)) {
      continue;
    }

    const stringValue = String(value);

    if (stringValue === "" && nullIfEmptyFields.has(key)) {
      payload[key] = null;
      continue;
    }

    payload[key] = stringValue;
  }

  return payload;
}

export function JsonActionForm({
  endpoint,
  method,
  successMessage,
  errorMessage,
  className,
  children,
  booleanFields,
  arrayFields,
  nullIfEmptyFields,
  resetOnSuccess = false,
  confirmMessage,
}: JsonActionFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) {
      return;
    }

    if (confirmMessage && !window.confirm(confirmMessage)) {
      return;
    }

    setPending(true);
    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch(endpoint, {
        method,
        headers: method === "DELETE" ? undefined : { "Content-Type": "application/json" },
        body:
          method === "DELETE"
            ? undefined
            : JSON.stringify(buildPayload(formData, { booleanFields, arrayFields, nullIfEmptyFields })),
      });

      const text = await response.text();
      const body = text ? (JSON.parse(text) as { message?: string }) : null;

      if (!response.ok) {
        throw new Error(body?.message ?? errorMessage ?? "Thao tác thất bại");
      }

      toast.success(successMessage);

      if (resetOnSuccess) {
        formRef.current?.reset();
      }

      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : errorMessage ?? "Thao tác thất bại");
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className={className}>
      <fieldset disabled={pending} className="contents disabled:opacity-70">
        {children}
      </fieldset>
    </form>
  );
}
