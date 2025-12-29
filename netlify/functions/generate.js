import fetch from "node-fetch";
import FormData from "form-data";

export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method not allowed" };
    }

    const { model, prompt, images, image_size } = JSON.parse(event.body);

    if (!model || !prompt || !images?.length) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing inputs" }),
      };
    }

    const apiKey = process.env.FAL_KEY;
    if (!apiKey) {
      throw new Error("FAL_KEY missing");
    }

    /* ------------------------------------
       1️⃣ Upload images to fal.ai
    ------------------------------------ */

    const uploadedUrls = [];

    for (const img of images) {
      const form = new FormData();
      form.append(
        "file",
        Buffer.from(img.base64, "base64"),
        img.name
      );

      const upload = await fetch(
        "https://fal.run/fal-ai/files/upload",
        {
          method: "POST",
          headers: {
            Authorization: `Key ${apiKey}`,
          },
          body: form,
        }
      );

      if (!upload.ok) {
        const t = await upload.text();
        throw new Error("Upload failed: " + t);
      }

      const uploaded = await upload.json();
      uploadedUrls.push(uploaded.url);
    }

    /* ------------------------------------
       2️⃣ Create generation job
    ------------------------------------ */

    const create = await fetch(
      `https://queue.fal.run/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Key ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          image_size,
          images: uploadedUrls,
        }),
      }
    );

    if (!create.ok) {
      const t = await create.text();
      throw new Error("Generate failed: " + t);
    }

    const { request_id } = await create.json();

    /* ------------------------------------
       3️⃣ Poll result
    ------------------------------------ */

    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 2000));

      const poll = await fetch(
        `https://queue.fal.run/${model}/requests/${request_id}`,
        {
          headers: {
            Authorization: `Key ${apiKey}`,
          },
        }
      );

      const status = await poll.json();

      if (status.status === "FAILED") {
        throw new Error(status.error || "Generation failed");
      }

      if (status.status === "COMPLETED") {
        return {
          statusCode: 200,
          body: JSON.stringify(status.response),
        };
      }
    }

    throw new Error("Timeout waiting for result");

  } catch (err) {
    console.error("❌ ERROR:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
