import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { isAppError } from "@/src/lib/errors";
import { logger } from "@/src/lib/logger";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function created<T>(data: T) {
  return NextResponse.json(data, { status: 201 });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export function handleRouteError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        code: "VALIDATION_ERROR",
        message: "Invalid request input",
        details: error.flatten(),
      },
      { status: 400 },
    );
  }

  if (isAppError(error)) {
    return NextResponse.json(
      {
        code: error.code,
        message: error.message,
        details: error.details,
      },
      { status: error.status },
    );
  }

  logger.error("Unhandled route error", {
    error: error instanceof Error ? error.message : String(error),
  });

  return NextResponse.json(
    {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    },
    { status: 500 },
  );
}
