import sql from '../db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed'
    });
  }

  try {
    const visits = await sql`
      SELECT COUNT(*)::int AS count
      FROM visits
    `;

    const content = await sql`
      SELECT COUNT(*)::int AS count
      FROM content
      WHERE is_active = TRUE
    `;

    const achievements = await sql`
      SELECT COUNT(*)::int AS count
      FROM achievements
      WHERE is_active = TRUE
    `;

    const sections = await sql`
      SELECT COUNT(*)::int AS count
      FROM sections
      WHERE is_active = TRUE
    `;

    const grades = await sql`
      SELECT COUNT(*)::int AS count
      FROM grades
      WHERE is_active = TRUE
    `;

    return res.status(200).json({
      success: true,
      stats: {
        visits: visits[0]?.count || 0,
        content: content[0]?.count || 0,
        achievements: achievements[0]?.count || 0,
        sections: sections[0]?.count || 0,
        grades: grades[0]?.count || 0
      }
    });

  } catch (error) {
    console.error('Public statistics error:', error);

    return res.status(500).json({
      success: false,
      error: 'تعذر تحميل الإحصاءات العامة.'
    });
  }
}
