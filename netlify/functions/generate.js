export default async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const { model, prompt, images, image_size } = await req.json();

    if (!model || !prompt || !images?.length) {
      return new Response(
        JSON.stringify({ error: "Missing model, prompt, or images" }),
        { status: 400 }
      );
    }

    const apiKey = process.env.FAL_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "FAL_KEY not set" }),
        { status: 500 }
      );
    }

    /* ----------------------------------
       1️⃣ Upload images to fal.ai
    ---------------------------------- */

    const uploadedImages = [];

    for (const img of images) {
      const form = new FormData();
      form.append(
        "file",
        Buffer.from(img.base64, "base64"),
        img.name
      );

      const uploadRes = await fetch(
        "https://fal.run/fal-ai/files/upload",
        {
          method: "POST",
          headers: {
            Authorization: `Key ${apiKey}`,
          },
          body: form,
        }
      );

      if (!uploadRes.ok) {
        const t = await uploadRes.text();
        throw new Error("Image upload failed: " + t);
      }

      const uploaded = await uploadRes.json();
      uploadedImages.push(uploaded.url);
    }

    /* ----------------------------------
       2️⃣ Create generation request
    ---------------------------------- */

    const genRes = await fetch(
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
          images: uploadedImages,
        }),
      }
    );

    if (!genRes.ok) {
      const t = await genRes.text();
      throw new Error("Generate API error: " + t);
    }

    const { request_id } = await genRes.json();

    /* ----------------------------------
       3️⃣ Poll status
    ---------------------------------- */

    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 2000));

      const statusRes = await fetch(
        `https://queue.fal.run/${model}/requests/${request_id}`,
        {
          headers: {
            Authorization: `Key ${apiKey}`,
          },
        }
      );

      const status = await statusRes.json();

      if (status.status === "FAILED") {
        throw new Error(status.error || "fal.ai FAILED");
      }

      if (status.status === "COMPLETED") {
        return new Response(
          JSON.stringify(status.response),
          { status: 200 }
        );
      }
    }

    throw new Error("Timeout waiting for result");

  } catch (err) {
    console.error("❌ GENERATE ERROR:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500 }
    );
  }
};
