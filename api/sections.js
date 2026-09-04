import sql from '../lib/db.js';

export default async function handler(req, res) {
  // السماح بالقراءة فقط عبر GET
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed'
    });
  }

  try {
    const sections = await sql`
      SELECT
        id,
        name,
        slug,
        icon,
        color,
        sort_order,
        is_active,
        created_at,
        updated_at
      FROM sections
      WHERE is_active = TRUE
      ORDER BY sort_order ASC, id ASC
    `;

    return res.status(200).json({
      success: true,
      count: sections.length,
      sections
    });
  } catch (error) {
    console.error('Sections API error:', error);

    return res.status(500).json({
      success: false,
      error: 'تعذر قراءة الأقسام من قاعدة البيانات.'
    });
  }
}
