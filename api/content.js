import sql from '../lib/db.js';

export default async function handler(req, res) {
  // القراءة فقط في هذه المرحلة
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed'
    });
  }

  try {
    const content = await sql`
      SELECT
        c.id,
        c.title,
        c.description,
        c.content_type,
        c.link,
        c.image_url,
        c.file_url,
        c.file_name,
        c.is_featured,
        c.sort_order,
        c.is_active,
        c.created_at,
        c.updated_at,

        s.id AS section_id,
        s.name AS section_name,
        s.slug AS section_slug,

        g.id AS grade_id,
        g.name AS grade_name,
        g.slug AS grade_slug,
        g.grade_number

      FROM content c

      LEFT JOIN sections s
        ON c.section_id = s.id

      LEFT JOIN grades g
        ON c.grade_id = g.id

      WHERE c.is_active = TRUE

      ORDER BY
        c.sort_order ASC,
        c.created_at DESC,
        c.id DESC
    `;

    return res.status(200).json({
      success: true,
      count: content.length,
      content
    });

  } catch (error) {
    console.error('Content API error:', error);

    return res.status(500).json({
      success: false,
      error: 'تعذر قراءة محتوى الموقع من قاعدة البيانات.'
    });
  }
}
