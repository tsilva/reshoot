export const maxDuration = 300;

type GenerateRequest = {
  original?: string;
  references?: Array<{ label?: string; image?: string }>;
  target?: {
    label?: string;
    azimuth?: number;
    elevation?: number;
  };
  feedback?: string;
};

type OpenRouterImagesResponse = {
  data?: Array<{
    b64_json?: string;
    media_type?: string;
  }>;
  error?: {
    message?: string;
  };
};

const MODEL = "openai/gpt-image-2";
const OPENROUTER_IMAGES_URL = "https://openrouter.ai/api/v1/images";
const MAX_IMAGE_LENGTH = 30_000_000;
const STREAM_HEARTBEAT_MS = 15_000;

function isImageDataUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_IMAGE_LENGTH &&
    /^data:image\/(png|jpe?g|webp);base64,/.test(value)
  );
}

function errorMessage(
  payload: OpenRouterImagesResponse | null,
  fallback: string,
) {
  const message = payload?.error?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

function streamedGenerationResponse(
  request: Request,
  apiKey: string,
  payload: Record<string, unknown>,
  targetLabel: string,
) {
  const encoder = new TextEncoder();
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const finish = (result: Record<string, unknown>) => {
        if (heartbeat) clearInterval(heartbeat);
        if (cancelled) return;
        controller.enqueue(encoder.encode(JSON.stringify(result)));
        controller.close();
      };

      // Send a byte before the image provider finishes, then keep the proxied
      // connection active while the long-running generation is in flight.
      controller.enqueue(encoder.encode("\n"));
      heartbeat = setInterval(() => {
        if (!cancelled) controller.enqueue(encoder.encode("\n"));
      }, STREAM_HEARTBEAT_MS);

      console.info("Image generation started", {
        requestId,
        target: targetLabel,
        model: MODEL,
      });

      void (async () => {
        try {
          const upstream = await fetch(OPENROUTER_IMAGES_URL, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://reshoot.tsilva.eu",
              "X-OpenRouter-Title": "Reshoot",
            },
            body: JSON.stringify(payload),
            signal: request.signal,
          });

          const result = (await upstream
            .json()
            .catch(() => null)) as OpenRouterImagesResponse | null;

          if (!upstream.ok) {
            const message = errorMessage(
              result,
              `OpenRouter image generation failed (${upstream.status}).`,
            );
            console.error("OpenRouter image generation failed", {
              requestId,
              target: targetLabel,
              status: upstream.status,
              durationMs: Date.now() - startedAt,
              message,
            });
            finish({ error: message, upstreamStatus: upstream.status });
            return;
          }

          const image = result?.data?.[0];
          const mediaType = image?.media_type;

          if (
            typeof image?.b64_json !== "string" ||
            typeof mediaType !== "string" ||
            !mediaType.startsWith("image/")
          ) {
            console.error("OpenRouter returned no usable image", {
              requestId,
              target: targetLabel,
              durationMs: Date.now() - startedAt,
            });
            finish({
              error: "The model did not return an image. Please try again.",
            });
            return;
          }

          console.info("Image generation completed", {
            requestId,
            target: targetLabel,
            model: MODEL,
            durationMs: Date.now() - startedAt,
          });
          finish({
            image: `data:${mediaType};base64,${image.b64_json}`,
            mediaType,
            model: MODEL,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Image generation failed.";
          console.error("Image generation route failed", {
            requestId,
            target: targetLabel,
            name: error instanceof Error ? error.name : "UnknownError",
            durationMs: Date.now() - startedAt,
            message,
          });
          finish({ error: message });
        }
      })();
    },
    cancel() {
      cancelled = true;
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return Response.json(
        {
          error:
            "OpenRouter is not configured. Add OPENROUTER_API_KEY to the server environment.",
        },
        { status: 503 },
      );
    }

    const body = (await request.json()) as GenerateRequest;

    if (!isImageDataUrl(body.original)) {
      return Response.json(
        { error: "A valid original product image is required." },
        { status: 400 },
      );
    }

    const target = body.target;
    if (
      !target ||
      typeof target.label !== "string" ||
      typeof target.azimuth !== "number" ||
      typeof target.elevation !== "number"
    ) {
      return Response.json(
        { error: "A valid target perspective is required." },
        { status: 400 },
      );
    }

    const references = (body.references ?? [])
      .filter(
        (
          reference,
        ): reference is {
          label: string;
          image: string;
        } =>
          typeof reference.label === "string" &&
          isImageDataUrl(reference.image),
      )
      .slice(-4);

    const referenceLabels = [
      "INPUT REFERENCE 1 is the ORIGINAL USER-UPLOADED PHOTO. It is the authoritative identity anchor and is never AI-generated.",
      ...references.map(
        (reference, index) =>
          `INPUT REFERENCE ${index + 2} is a PREVIOUSLY AI-GENERATED PHOTO (${reference.label}). Use it only for spatial consistency. If it conflicts with input reference 1, the ORIGINAL PHOTO always wins.`,
      ),
    ];

    const prompt = [
      "Create exactly one premium studio product photograph.",
      `TARGET VIEW: ${target.label}; camera azimuth ${Math.round(target.azimuth)} degrees; elevation ${Math.round(target.elevation)} degrees.`,
      ...referenceLabels,
      "Identity consistency is the highest priority. Preserve the exact product shape, proportions, materials, colors, construction details, face, seams, accessories, imperfections, and wear shown in the original.",
      "Infer only the unseen geometry needed for the requested camera angle. Keep the original lighting character.",
      "BACKGROUND REQUIREMENT: Replace the background from every input reference. The output must have a seamless, evenly lit, solid pure white background (#FFFFFF; RGB 255, 255, 255) extending edge-to-edge through all four corners.",
      "Do not produce an off-white, gray, colored, transparent, textured, gradient, environmental, or horizon-line background. A small natural contact shadow may touch the product, but every other background area must remain pure white.",
      "Do not add text, props, hands, people, logos, packaging, extra objects, alternate products, or a contact sheet.",
      body.feedback
        ? `REGENERATION FEEDBACK FROM THE HUMAN REVIEWER: ${body.feedback}`
        : "This is an initial generation. Produce the requested angle cleanly.",
      "Return only one image at the requested perspective.",
    ].join("\n");

    return streamedGenerationResponse(
      request,
      apiKey,
      {
        model: MODEL,
        prompt,
        n: 1,
        aspect_ratio: "1:1",
        quality: "high",
        background: "opaque",
        input_references: [
          {
            type: "image_url",
            image_url: { url: body.original },
          },
          ...references.map((reference) => ({
            type: "image_url",
            image_url: { url: reference.image },
          })),
        ],
      },
      target.label,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Image generation failed.";
    console.error("Image generation route failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message,
    });
    return Response.json({ error: message }, { status: 500 });
  }
}
