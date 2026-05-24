import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';

// You need these from App Store Connect > Users and Access > Keys
const CONFIG = {
  issuerId: 'YOUR_ISSUER_ID',        // UUID from App Store Connect
  keyId: 'YOUR_KEY_ID',              // e.g. "ABCDEF1234"
  privateKey: `-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----`,
  appId: '1404871703',               // Your app's App Store Connect ID (NOT the numeric Store ID)
};

function generateToken() {
  const now = Math.round(Date.now() / 1000);
  const payload = {
    iss: CONFIG.issuerId,
    exp: now + 20 * 60,  // 20 min expiry
    aud: 'appstoreconnect-v1',
  };
  return jwt.sign(payload, CONFIG.privateKey, {
    algorithm: 'ES256',
    keyid: CONFIG.keyId,
  });
}

async function fetchReviews(token, appId, territory = 'IN', cursor = null) {
  const url = new URL(`https://api.appstoreconnect.apple.com/v1/apps/${appId}/customerReviews`);
  url.searchParams.set('limit', '200');
  url.searchParams.set('sort', '-createdDate');
  url.searchParams.set('filter[territory]', territory);
  url.searchParams.set('fields[customerReviews]', 'rating,title,body,reviewerNickname,createdDate,territory');
  if (cursor) url.searchParams.set('cursor', cursor);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

async function main() {
  const token = generateToken();
  let cursor = null;
  let allReviews = [];

  do {
    const data = await fetchReviews(token, CONFIG.appId, 'IN', cursor);
    allReviews.push(...(data.data || []));
    cursor = data.links?.next ? new URL(data.links.next).searchParams.get('cursor') : null;
  } while (cursor);

  console.log(`Fetched ${allReviews.length} reviews`);
  allReviews.slice(0, 5).forEach(r => {
    const a = r.attributes;
    console.log(`[${a.rating}★] ${a.title || '(no title)'} by ${a.reviewerNickname}: ${(a.body || '').slice(0, 120)}`);
  });
}

main().catch(console.error);
