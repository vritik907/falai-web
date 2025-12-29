// netlify/functions/generate.js
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { prompt, model, image_size, image_files } = JSON.parse(event.body);
    
    // Build the request payload
    const payload = {
      prompt,
      image_size: image_size || '1024',
      num_inference_steps: 28,
      guidance_scale: 3.5,
      num_images: 1,
      enable_safety_checker: true
    };

    // Add reference images if provided
    if (image_files && image_files.length > 0) {
      payload.image_url = `data:image/png;base64,${image_files[0].base64}`;
    }

    const response = await fetch(`https://queue.fal.run/${model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${process.env.FAL_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('fal.ai error:', errorText);
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `fal.ai API error: ${errorText}` })
      };
    }

    const data = await response.json();
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error('Generate function error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};