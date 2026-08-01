export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  console.error("Unhandled API error", error);
  return Response.json(
    {
      error: {
        code: "internal_error",
        message: "Something went wrong. Please try again.",
      },
    },
    { status: 500 },
  );
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError(400, "invalid_json", "The request body is invalid.");
  }
}
