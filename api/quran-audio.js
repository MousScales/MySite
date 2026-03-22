import fetch from 'node-fetch';

export default async function handler(req, res) {
  const { ayah, reciter } = req.query;
  if (!ayah || !reciter) {
    res.status(400).json({ error: 'Missing ayah or reciter' });
    return;
  }
  const url = `http://api.alquran.cloud/v1/ayah/${ayah}/${reciter}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Proxy error', details: err.message });
  }
} 