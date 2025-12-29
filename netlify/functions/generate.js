import Busboy from "busboy";
import FormData from "form-data";
import fetch from "node-fetch";

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const contentType =
      event.headers["content-type"] || event.headers["Content-Type"];

    if (!contentType || !contentType.includes("multipart/form-data")) {
      return {
        statusCode: 400,
        body: "Expected multipart/form-data"
      };
    }

    const busboy = Busboy({ headers: { "content-type": contentType } });

    let prompt = "";
    let model = "";
    let imageSize = null;
    const files = [];

    await new Promise((resolve, reject) => {
      busboy.on("field", (name, val) => {
        if (name === "prompt") prompt = val;
        if (name === "model") model = val;
        if (name === "image_size") imageSize = val;
      });

      busboy.on("file", (name, file, info) => {
        const chunks = [];
        file.on("data", d => chunks.push(d));
        file.on("end", () => {
          files.push({
            filename: info.filename,
            mimeType: info.mimeType,
            buffer: Buffer.concat(chunks)
          });
        });
      });

      busboy.on("finish", resolve);
      busboy.on("error", reject);

      const bodyBuffer = event.isBase64Encoded
        ? Buffer.from(event.body, "base64")
        : Buffer.from(event.body);

      busboy.end(bodyBuffer);
    });

    if (!prompt || !model) {
      return {
        statusCode: 400,
        body: "Missing prompt or model"
      };
    }

    const payload = { prompt };

    // ================== EDIT MODELS ==================
    if (model.includes("edit")) {
      if (files.length === 0) {
        return {
          statusCode: 400,
          body: "Edit models require reference images"
        };
      }

      const imageUrls = [];

      for (const f of files) {
        const form = new FormData();
        form.append("file", f.buffer, {
          filename: f.filename,
          contentType: f.mimeType
        });

        const uploadRes = await fetch(
          "https://fal.run/fal-ai/files/upload",
          {
            method: "POST",
            headers: {
              Authorization: `Key ${process.env.FAL_KEY}`,
              ...form.getHeaders()
            },
            body: form
          }
        );

        if (!uploadRes.ok) {
          const t = await uploadRes.text();
          return {
            statusCode: 500,
            body: "fal.ai upload failed: " + t
          };
        }

        const uploadData = await uploadRes.json();
        imageUrls.push(uploadData.file_url || uploadData.url);
      }

      payload.image_urls = imageUrls;
    } 
    // ================== TEXT TO IMAGE ==================
    else {
      if (imageSize) payload.image_size = imageSize;
    }

    const genRes = await fetch(
      `https://queue.fal.run/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Key ${process.env.FAL_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    if (!genRes.ok) {
      const t = await genRes.text();
      return { statusCode: genRes.status, body: t };
    }

    const data = await genRes.json();

    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message,
        stack: err.stack
      })
    };
  }
}
