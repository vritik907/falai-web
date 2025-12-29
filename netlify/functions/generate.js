export default async (req, context) => {
  try {
    const FAL_KEY = process.env.FAL_KEY;
    if (!FAL_KEY) {
      return new Response("Missing FAL_KEY", { status: 500 });
    }

    const { model, prompt, images, image_size } = await req.json();

    if (!images || images.length === 0) {
      return new Response("Reference images required", { status: 400 });
    }

    // 1️⃣ Upload images to fal.ai
    const uploadedImages = [];

    for (const img of images) {
      const buffer = Buffer.from(img.base64, "base64");

      const form = new FormData();
      form.append("file", new Blob([buffer]), img.name);

      const uploadRes = await fetch(
        "https://fal.run/fal-ai/files/upload",
        {
          method: "POST",
          headers: {
            Authorization: `Key ${FAL_KEY}`
          },
          body: form
        }
      );

      if (!uploadRes.ok) {
        throw new Error("Image upload failed");
      }

      const uploadData = await uploadRes.json();
      uploadedImages.push(uploadData.url);
    }

    // 2️⃣ Call EDIT model
    const genRes = await fetch(
      `https://queue.fal.run/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Key ${FAL_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt,
          image_urls: uploadedImages,
          image_size: image_size || "1024x1024"
        })
      }
    );

    if (!genRes.ok) {
      const err = await genRes.text();
      return new Response(err, { status: 403 });
    }

    const data = await genRes.json();
    return Response.json(data);

  } catch (err) {
    return new Response(err.message, { status: 500 });
  }
};
