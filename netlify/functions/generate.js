import fetch from "node-fetch";
import FormData from "form-data";

export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method not allowed" };
    }

    const body = JSON.parse(event.body);
    const { model, prompt, images } = body;

    if (!model || !prompt || !images?.length) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing inputs" }),
      };
    }

    const apiKey = process.env.FAL_KEY;
    if (!apiKey) throw new Error("FAL_KEY missing");

    /* -------------------------------
       1️⃣ Upload reference images
    -------------------------------- */

    const uploadedUrls = [];

    for (const img of images) {
      const buffer = Buffer.from(img.base64, "base64");

      const form = new FormData();
      form.append("file", buffer, {
        filename: img.name,
        contentType: img.type || "image/png",
      });

      const uploadRes = await fetch(
        "https://fal.run/fal-ai/files/upload",
        {
          method: "POST",
          headers: {
            Authorization: `Key ${apiKey}`,
            ...form.getHeaders(),
          },
          body: form,
        }
      );

      if (!uploadRes.ok) {
        const err = await uploadRes.text();
        throw new Error("Image upload failed: " + err);
      }

      const uploaded = await uploadRes.json();
      uploadedUrls.push(uploaded.url);
    }

    /* -------------------------------
       2️⃣ Create generation job
    -------------------------------- */

    const createRes = await fetch(
      `https://queue.fal.run/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Key ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          images: uploadedUrls,
        }),
      }
    );

    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error("Generate failed: " + err);
    }

    const { request_id } = await createRes.json();

    /* -------------------------------
       3️⃣ Poll result
    -------------------------------- */

    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 2000));

      const pollRes = await fetch(
        `https://queue.fal.run/${model}/requests/${request_id}`,
        {
          headers: { Authorization: `Key ${apiKey}` },
        }
      );

      const data = await pollRes.json();

      if (data.status === "FAILED") {
        throw new Error(data.error || "Generation failed");
      }

      if (data.status === "COMPLETED") {
        return {
          statusCode: 200,
          body: JSON.stringify(data.response),
        };
      }
    }

    throw new Error("Timeout waiting for result");

  } catch (err) {
    console.error("❌ ERROR:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
