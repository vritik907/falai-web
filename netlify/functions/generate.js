async function generateOne(prompt, i) {
  log("Generating: " + prompt);

  /* ===============================
     STEP 1: CALL /api/generate
  =============================== */
  let res;
  try {
    const fd = new FormData();
    fd.append("prompt", prompt);
    fd.append("model", model.value);
    fd.append("image_size", resolution.value);

    // attach reference images
    for (const f of refs) {
      fd.append("images", f);
    }

    res = await fetch("/api/generate", {
      method: "POST",
      body: fd
    });
  } catch (e) {
    throw new Error("Generate request failed (network)");
  }

  if (!res.ok) {
    const t = await res.text();
    throw new Error("Generate API error: " + t);
  }

  const data = await res.json();
  if (!data.request_id) {
    throw new Error("fal.ai did not return request_id");
  }

  const requestId = data.request_id;

  /* ===============================
     STEP 2: POLL /api/status SAFELY
  =============================== */
  const maxAttempts = 120;     // ~10 minutes
  const pollDelay = 5000;      // 5 seconds

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, pollDelay));

    let statusRes;
    try {
      statusRes = await fetch(
        `/api/status?model=${encodeURIComponent(model.value)}&request_id=${requestId}`
      );
    } catch (e) {
      log(`Status check failed (attempt ${attempt}), retrying...`, "error");
      continue; // do NOT fail job
    }

    if (!statusRes.ok) {
      log(`Status API HTTP ${statusRes.status}, retrying...`, "error");
      continue;
    }

    const j = await statusRes.json();

    if (j.status === "FAILED") {
      throw new Error(j.error || "fal.ai request FAILED");
    }

    if (j.status === "IN_QUEUE") {
      log("In queue…");
      continue;
    }

    if (j.status === "IN_PROGRESS") {
      log("Processing…");
      continue;
    }

    if (j.status === "COMPLETED") {
      const out = j.response || j;
      const url =
        out.images?.[0]?.url ||
        out.image?.url ||
        out.output?.[0]?.url;

      if (!url) {
        throw new Error("No image URL returned");
      }

      gallerySection.style.display = "block";
      gallery.innerHTML += `
        <div class="gallery-item">
          <img src="${url}">
          <button class="download-btn" onclick="download('${url}', ${i})">⬇️</button>
        </div>
      `;

      done++;
      progressUpdate();
      return;
    }
  }

  throw new Error("Timeout waiting for fal.ai completion");
}
