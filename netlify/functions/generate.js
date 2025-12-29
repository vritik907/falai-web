if (!model.value.includes("edit") && refs.length > 0) {
    alert("Reference images are only supported for edit models.");
    return;
}
async function generateOne(prompt,i){
    log("🔄 Generating: " + prompt);

    // ---- BUILD PAYLOAD SAFELY ----
    const payload = {
        prompt,
        model: model.value,
        image_size: resolution.value
    };

    // ONLY attach images for edit models
    if (model.value.includes("edit")) {
        if (refs.length === 0) {
            throw new Error("Edit model requires reference images");
        }

        payload.image_files = [];

        for (const f of refs) {
            const base64 = await new Promise(res => {
                const r = new FileReader();
                r.onload = () => res(r.result.split(",")[1]);
                r.readAsDataURL(f);
            });

            payload.image_files.push({
                name: f.name,
                base64
            });
        }
    }

    // ---- CALL GENERATE API ----
    const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const t = await res.text();
        throw new Error("Generate API error: " + t);
    }

    const data = await res.json();
    if (!data.request_id) {
        throw new Error("No request_id returned");
    }

    const id = data.request_id;
    log(`⏳ Request ID: ${id}`);

    // ---- POLL STATUS ----
    const maxAttempts = 60; // ~5 minutes (free tier safe)
    for (let a = 1; a <= maxAttempts; a++) {
        await new Promise(r => setTimeout(r, 5000));

        const s = await fetch(
            `/api/status?model=${encodeURIComponent(model.value)}&request_id=${id}`
        );

        if (!s.ok) throw new Error("Status API error");

        const j = await s.json();
        log(`📊 Status: ${j.status} (attempt ${a})`);

        if (j.status === "FAILED") {
            throw new Error(j.error || "fal.ai request FAILED");
        }

        if (j.status === "COMPLETED") {
            const url =
                j.images?.[0]?.url ||
                j.image?.url ||
                j.response?.images?.[0]?.url;

            if (!url) throw new Error("No image URL returned");

            gallerySection.style.display = "block";
            gallery.innerHTML += `
              <div class="gallery-item">
                <img src="${url}">
                <button class="download-btn"
                        onclick="download('${url}',${i})">⬇️</button>
              </div>
            `;

            done++;
            progressUpdate();
            log("✅ Generated successfully");
            return;
        }
    }

    throw new Error("Timeout waiting for fal.ai");
}
