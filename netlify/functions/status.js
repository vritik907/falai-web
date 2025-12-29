export async function handler(event) {
  const { model, request_id } = event.queryStringParameters;

  const response = await fetch(
    `https://queue.fal.run/${model}/requests/${request_id}`,
    {
      headers: {
        "Authorization": `Key ${process.env.FAL_KEY}`,
      },
    }
  );

  const data = await response.json();

  return {
    statusCode: 200,
    body: JSON.stringify(data),
  };
}
