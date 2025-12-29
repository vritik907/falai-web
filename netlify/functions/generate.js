const fetch = require("node-fetch");
const FormData = require("form-data");

exports.handler = async (event) => {
  try {
    const { model, prompt, images } = JSON.parse(event.body);

    if (!process.env.FAL_KEY) {
      return error("FAL_KEY missing");
    }

    if (!images || !images.length) {
      return error("Reference images required");
    }

    // Upload images to fal.ai
    const uploaded = [];

    for (const img of images) {
      const form = new FormData();
      form.append("file", Buffer.from(img.data, "base64"), {
        filename: img.name,
        contentType: img.type
      });

      const uploadRes = await fetch(
        "https://fal.run/fal-ai/files/upload",
        {
          method: "POST",
          headers: { Authorization: `Key ${process.env.FAL_KEY}` },
          body: form
        }
      );

      if (!uploadRes.ok) {
        const txt = await uploadRes.text();
        return error("Image upload failed: " + txt);
      }

      const uploadJson = await uploadRes.json();
      uploaded.push(uploadJson.url);
    }

    // Send generation request
    const genRes = await fetch(`https://queue.fal.run/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${process.env.FAL_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt,
        image_urls: uploaded
      })
    });

    if (!genRes.ok) {
      return error("Generation request failed");
    }

    const gen = await genRes.json();

    // Poll result
    let status;
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 5000));

      const s = await fetch(
        `https://queue.fal.run/${model}/requests/${gen.request_id}`,
        { headers: { Authorization: `Key ${process.env.FAL_KEY}` } }
      );

      status = await s.json();
      if (status.status === "COMPLETED") break;
      if (status.status === "FAILED") return error("Generation failed");
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ images: status.images.map(i => i.url) })
    };

  } catch (err) {
    return error(err.message);
  }
};

function error(msg) {
  return {
    statusCode: 400,
    body: JSON.stringify({ error: msg })
  };
}
