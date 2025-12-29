const fetch = require("node-fetch");
const FormData = require("form-data");

exports.handler = async (event) => {
  try {
    const { model, prompt, images } = JSON.parse(event.body);

    if (!process.env.FAL_KEY) {
      throw new Error("FAL_KEY missing");
    }

    if (!images || images.length === 0) {
      throw new Error("Reference images required");
    }

    const uploadedUrls = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];

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
            Authorization: `Key ${process.env.FAL_KEY}`,
            ...form.getHeaders() // 🔥 THIS IS THE FIX
          },
          body: form
        }
      );

      if (!upload.ok) {
        const text = await upload.text();
        throw new Error(`Image upload failed: ${text}`);
      }

      const result = await upload.json();
      uploadedUrls.push(result.url);
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

    let output;
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 5000));

      const poll = await fetch(
        `https://queue.fal.run/${model}/requests/${job.request_id}`,
        {
          headers: {
            Authorization: `Key ${process.env.FAL_KEY}`
          }
        }
      );

      output = await poll.json();
      if (output.status === "COMPLETED") break;
      if (output.status === "FAILED") {
        throw new Error("Generation failed");
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify(output)
    };

  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: err.message })
    };
  }
};
