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
    const grades = await sql`
      SELECT
        id,
        name,
        slug,
        grade_number,
        sort_order,
        is_active,
        created_at,
        updated_at
      FROM grades
      WHERE is_active = TRUE
      ORDER BY grade_number ASC, id ASC
    `;

    return res.status(200).json({
      success: true,
      count: grades.length,
      grades
    });
  } catch (error) {
    console.error('Grades API error:', error);

    return res.status(500).json({
      success: false,
      error: 'تعذر قراءة الصفوف من قاعدة البيانات.'
    });
  }
}
