const fetch = require("node-fetch");
const FormData = require("form-data");

exports.handler = async (event) => {
  try {
    const { model, prompt, images } = JSON.parse(event.body);

    if (!process.env.FAL_KEY) {
      throw new Error("FAL_KEY missing");
    }

    if (!images || !images.length) {
      throw new Error("Reference images required");
    }

    const uploadedUrls = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];

      if (!img.data) {
        throw new Error(`Invalid image at index ${i}`);
      }

      const buffer = Buffer.from(img.data, "base64");

      const form = new FormData();
      form.append("file", buffer, {
        filename: img.name,
        contentType: img.type
      });

      const upload = await fetch(
        "https://fal.run/fal-ai/files/upload",
        {
          method: "POST",
          headers: {
            Authorization: `Key ${process.env.FAL_KEY}`
          },
          body: form
        }
      );

      if (!upload.ok) {
        const t = await upload.text();
        throw new Error("Image upload failed: " + t);
      }

      const up = await upload.json();
      uploadedUrls.push(up.url);
    }

    const gen = await fetch(`https://queue.fal.run/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${process.env.FAL_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt,
        image_urls: uploadedUrls
      })
    });

    const job = await gen.json();

    let result;
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const poll = await fetch(
        `https://queue.fal.run/${model}/requests/${job.request_id}`,
        {
          headers: { Authorization: `Key ${process.env.FAL_KEY}` }
        }
      );
      result = await poll.json();
      if (result.status === "COMPLETED") break;
      if (result.status === "FAILED") throw new Error("Generation failed");
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ images: result.images })
    };

  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: err.message })
    };
  }
};
