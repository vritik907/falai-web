const fetch = require("node-fetch");
const FormData = require("form-data");

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const { model, prompt, images } = body;

    if (!process.env.FAL_KEY) {
      return fail("FAL_KEY missing");
    }

    if (!Array.isArray(images) || images.length === 0) {
      return fail("Reference images are required");
    }

    const uploadedUrls = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];

      // 🔐 HARD VALIDATION (THIS FIXES YOUR ERROR)
      if (
        !img ||
        typeof img.data !== "string" ||
        img.data.length === 0
      ) {
        return fail(`Invalid image data at index ${i}`);
      }

      const buffer = Buffer.from(img.data, "base64");

      const form = new FormData();
      form.append("file", buffer, {
        filename: img.name || `image_${i}.png`,
        contentType: img.type || "image/png"
      });

      const uploadRes = await fetch(
        "https://fal.run/fal-ai/files/upload",
        {
          method: "POST",
          headers: {
            Authorization: `Key ${process.env.FAL_KEY}`
          },
          body: form
        }
      );

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        return fail("Image upload failed: " + errText);
      }

      const uploadJson = await uploadRes.json();
      uploadedUrls.push(uploadJson.url);
    }

    // 🚀 Start generation
    const genRes = await fetch(`https://queue.fal.run/${model}`, {
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

    if (!genRes.ok) {
      const t = await genRes.text();
      return fail("Generation request failed: " + t);
    }

    const gen = await genRes.json();

    // ⏳ Polling
    let result;
    for (let i = 0; i < 120; i++) {
      await sleep(5000);

      const poll = await fetch(
        `https://queue.fal.run/${model}/requests/${gen.request_id}`,
        {
          headers: {
            Authorization: `Key ${process.env.FAL_KEY}`
          }
        }
      );

      result = await poll.json();

      if (result.status === "COMPLETED") break;
      if (result.status === "FAILED") {
        return fail("Generation failed");
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        images: result.images.map(i => i.url)
      })
    };

  } catch (err) {
    return fail(err.message);
  }
};

function fail(msg) {
  return {
    statusCode: 400,
    body: JSON.stringify({ error: msg })
  };
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
