// netlify/functions/status.js

// Use native fetch or fallback to node-fetch
const fetch = globalThis.fetch || require('node-fetch');

exports.handler = async (event) => {
  // Add CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { 
      statusCode: 405, 
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const { model, request_id } = event.queryStringParameters || {};

    console.log('Status check:', { model, request_id });

    if (!model || !request_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing model or request_id parameter' })
      };
    }

    if (!process.env.FAL_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'FAL_KEY not configured' })
      };
    }

    const url = `https://queue.fal.run/${model}/requests/${request_id}`;
    console.log('Checking status at:', url);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Key ${process.env.FAL_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const responseText = await response.text();
    console.log('Status response:', response.status, responseText.substring(0, 500));

    if (!response.ok) {
      console.error('fal.ai status error:', responseText);
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
    console.error('Status function error:', error);
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