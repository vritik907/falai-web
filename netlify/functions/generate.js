const fetch = require("node-fetch");
const FormData = require("form-data");

exports.handler = async (event) => {
  try {
    const { model, prompt, images } = JSON.parse(event.body);
    const apiKey = process.env.FAL_KEY;

    if (!apiKey) {
      return { statusCode: 500, body: "FAL_KEY missing" };
    }

    // ===============================
    // 1️⃣ Upload reference images
    // ===============================
    const uploadedImages = [];

    for (const img of images) {
      const buffer = Buffer.from(img.data, "base64");

      const form = new FormData();
      form.append("file", buffer, {
        filename: img.name,
        contentType: img.type,
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
        throw new Error(`Upload failed: ${err}`);
      }

      const uploadJson = await uploadRes.json();
      uploadedImages.push(uploadJson.file_id);
    }

    // ===============================
    // 2️⃣ Create generation request
    // ===============================
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
          images: uploadedImages,
        }),
      }
    );

    if (!createRes.ok) {
      const err = await createRes.text();
      throw new Error(`Create failed: ${err}`);
    }

    const { request_id } = await createRes.json();

    // ===============================
    // 3️⃣ Poll for result
    // ===============================
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 5000));

      const pollRes = await fetch(
        `https://queue.fal.run/${model}/requests/${request_id}`,
        {
          headers: {
            Authorization: `Key ${apiKey}`,
          },
        }
      );

      const pollJson = await pollRes.json();

      if (pollJson.status === "completed") {
        return {
          statusCode: 200,
          body: JSON.stringify(pollJson),
        };
      }

      if (pollJson.status === "failed") {
        throw new Error(JSON.stringify(pollJson));
      }
    }

    throw new Error("Timeout waiting for result");

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
