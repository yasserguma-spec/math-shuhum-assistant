import sql from '../lib/db.js';

export default async function handler(req, res) {
  // قراءة المجيدات متاحة للجميع
  if (req.method === 'GET') {
    try {
      const achievements = await sql`
        SELECT
          a.id,
          a.student_name,
          a.rank,
          a.description,
          a.image_url,
          a.is_active,
          a.created_at,
          a.updated_at,
          g.id AS grade_id,
          g.name AS grade_name,
          g.slug AS grade_slug,
          g.grade_number
        FROM achievements a
        LEFT JOIN grades g
          ON a.grade_id = g.id
        WHERE a.is_active = TRUE
        ORDER BY
          a.rank ASC,
          a.created_at DESC,
          a.id DESC
      `;

      return res.status(200).json({
        success: true,
        count: achievements.length,
        achievements
      });
    } catch (error) {
      console.error('Achievements GET error:', error);

      return res.status(500).json({
        success: false,
        error: 'تعذر قراءة مجيدات الرياضيات من قاعدة البيانات.'
      });
    }
  }

  // الكتابة والتعديل والحذف سنضيفها لاحقًا بعد ربط جلسة الإدارة
  return res.status(405).json({
    success: false,
    error: 'Method Not Allowed'
  });
}
