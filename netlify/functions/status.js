// netlify/functions/status.js
exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { model, request_id } = event.queryStringParameters;

    if (!model || !request_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing model or request_id parameter' })
      };
    }

    const response = await fetch(
      `https://queue.fal.run/${model}/requests/${request_id}`,
      {
        headers: {
          'Authorization': `Key ${process.env.FAL_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('fal.ai status error:', errorText);
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
    console.error('Status function error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};