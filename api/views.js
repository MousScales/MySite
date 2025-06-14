export default async function handler(req, res) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || Math.random().toString(36).slice(2); // fallback for localhost
  const now = Date.now();
  const windowMs = 5 * 60 * 1000; // 5 minutes

  // Store this IP with current timestamp
  await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/set/${ip}/${now}`,
    { headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` } });

  // Get all keys (IPs)
  const resp = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/keys/*`,
    { headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` } });
  const keys = (await resp.json()).result || [];

  // Count how many are within the window
  let liveCount = 0;
  for (const key of keys) {
    const tsResp = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/get/${key}`,
      { headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` } });
    const ts = parseInt((await tsResp.json()).result, 10);
    if (now - ts < windowMs) liveCount++;
    else {
      // Clean up old keys
      await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/del/${key}`,
        { headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` } });
    }
  }

  res.status(200).json({ live: liveCount });
} 