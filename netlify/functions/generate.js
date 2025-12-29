// netlify/functions/generate.js

export async function handler(event) {
  try {
    // Only allow POST
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: "Method Not Allowed"
      };
    }

    // Ensure API key exists
    if (!process.env.FAL_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "FAL_KEY is not set" })
      };
    }

    // Parse request body
    const body = JSON.parse(event.body || "{}");
    const { prompt, model, image_size } = body;

    if (!prompt || !model) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing prompt or model" })
      };
    }

    // ---- STRICT PAYLOAD RULES ----
    // For text-to-image models (flux/schnell):
    // ONLY send prompt (+ optional image_size)
    const payload = { prompt };

    if (image_size && !model.includes("edit")) {
      payload.image_size = image_size;
    }

    // ---- CALL fal.ai ----
    const response = await fetch(
      `https://queue.fal.run/${model}`,
      {
        method: "POST",
        headers: {
          "Authorization": `Key ${process.env.FAL_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    const text = await response.text();

    if (!response.ok) {
      console.error("fal.ai generate error:", text);
      return {
        statusCode: response.status,
        body: text
      };
    }

    // Success
    return {
      statusCode: 200,
      body: text
    };

  } catch (err) {
    console.error("Generate function crashed:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
}
