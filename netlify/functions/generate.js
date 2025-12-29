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

    console.log('Calling fal.ai API:', `https://queue.fal.run/${model}`);

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