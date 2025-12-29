// netlify/functions/generate.js

// Use native fetch or fallback to node-fetch
const fetch = globalThis.fetch || require('node-fetch');

exports.handler = async (event) => {
  // Add CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    console.log('FAL_KEY present:', !!process.env.FAL_KEY);
    
    const { prompt, model, image_size, image_files } = JSON.parse(event.body);
    
    console.log('Request details:', { prompt, model, image_size, hasImages: image_files?.length > 0 });

    if (!process.env.FAL_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'FAL_KEY not configured in environment variables' })
      };
    }

    // Build the request payload based on the fal.ai API docs
    const payload = {
      prompt,
      num_images: 1,
      aspect_ratio: "auto",
      output_format: "png",
      resolution: image_size || "1K" // nano-banana-pro uses 1K, 2K, or 4K
    };

    // Add reference images if provided (nano-banana-pro/edit requires image_urls array)
    if (image_files && image_files.length > 0) {
      // Convert base64 to data URIs
      payload.image_urls = image_files.map(
        img => `data:image/png;base64,${img.base64}`
      );
    }

    console.log('Calling fal.ai API:', `https://queue.fal.run/${model}`);
    console.log('Payload:', JSON.stringify({...payload, image_urls: payload.image_urls ? `[${payload.image_urls.length} images]` : undefined}));

    const response = await fetch(`https://queue.fal.run/${model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${process.env.FAL_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    console.log('fal.ai response status:', response.status);
    console.log('fal.ai response:', responseText.substring(0, 500));

    if (!response.ok) {
      console.error('fal.ai error:', responseText);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ 
          error: `fal.ai API error: ${response.status}`,
          details: responseText
        })
      };
    }

    const data = JSON.parse(responseText);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error('Generate function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: error.message,
        stack: error.stack 
      })
    };
  }
};