import sql from '../db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed'
    });
  }

  try {
    const {
      page_path = '/',
      referrer = '',
      device_type = 'unknown'
    } = req.body || {};

    // عنوان IP لا يتم تخزينه مباشرة.
    // نستخدمه فقط لإنشاء بصمة مجهولة للزائر.
    const forwarded = req.headers['x-forwarded-for'];
    const ip = Array.isArray(forwarded)
      ? forwarded[0]
      : (forwarded || req.socket?.remoteAddress || 'unknown');

    const ipAddress = String(ip).split(',')[0].trim();

    // بصمة مجهولة باستخدام Web Crypto المتاح في Node
    const encoder = new TextEncoder();
    const data = encoder.encode(
      `${ipAddress}|${process.env.VISIT_HASH_SALT || 'math-shuhum-default-salt'}`
    );

    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    const visitor_hash = Array.from(new Uint8Array(hashBuffer))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');

    await sql`
      INSERT INTO visits (
        visitor_hash,
        page_path,
        referrer,
        device_type
      )
      VALUES (
        ${visitor_hash},
        ${String(page_path).slice(0, 500)},
        ${String(referrer).slice(0, 1000)},
        ${String(device_type).slice(0, 50)}
      )
    `;

    return res.status(200).json({
      success: true,
      message: 'تم تسجيل الزيارة بنجاح.'
    });

  } catch (error) {
    console.error('Visit tracking error:', error);

    return res.status(500).json({
      success: false,
      error: 'تعذر تسجيل الزيارة.'
    });
  }
}
