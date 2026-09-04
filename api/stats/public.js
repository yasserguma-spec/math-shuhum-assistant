import sql from '../db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed'
    });
  }

  try {
    const [
      visitsTotal,
      visitsToday,
      visitsWeek,
      visitsMonth,
      contentTotal,
      achievementsTotal,
      sectionsTotal,
      gradesTotal,
      contentBySection,
      contentByGrade,
      visitsByDay
    ] = await Promise.all([
      sql`
        SELECT COUNT(*)::int AS count
        FROM visits
      `,

      sql`
        SELECT COUNT(*)::int AS count
        FROM visits
        WHERE created_at >= CURRENT_DATE
      `,

      sql`
        SELECT COUNT(*)::int AS count
        FROM visits
        WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      `,

      sql`
        SELECT COUNT(*)::int AS count
        FROM visits
        WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
      `,

      sql`
        SELECT COUNT(*)::int AS count
        FROM content
        WHERE is_active = TRUE
      `,

      sql`
        SELECT COUNT(*)::int AS count
        FROM achievements
        WHERE is_active = TRUE
      `,

      sql`
        SELECT COUNT(*)::int AS count
        FROM sections
        WHERE is_active = TRUE
      `,

      sql`
        SELECT COUNT(*)::int AS count
        FROM grades
        WHERE is_active = TRUE
      `,

      sql`
        SELECT
          s.id,
          s.name,
          s.slug,
          COUNT(c.id)::int AS count
        FROM sections s
        LEFT JOIN content c
          ON c.section_id = s.id
          AND c.is_active = TRUE
        WHERE s.is_active = TRUE
        GROUP BY s.id, s.name, s.slug, s.sort_order
        ORDER BY s.sort_order
      `,

      sql`
        SELECT
          g.id,
          g.name,
          g.slug,
          g.grade_number,
          COUNT(c.id)::int AS count
        FROM grades g
        LEFT JOIN content c
          ON c.grade_id = g.id
          AND c.is_active = TRUE
        WHERE g.is_active = TRUE
        GROUP BY g.id, g.name, g.slug, g.grade_number, g.sort_order
        ORDER BY g.grade_number
      `,

      sql`
        SELECT
          DATE(created_at) AS date,
          COUNT(*)::int AS count
        FROM visits
        WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'
        GROUP BY DATE(created_at)
        ORDER BY date
      `
    ]);

    return res.status(200).json({
      success: true,
      stats: {
        visits: {
          total: visitsTotal[0]?.count || 0,
          today: visitsToday[0]?.count || 0,
          week: visitsWeek[0]?.count || 0,
          month: visitsMonth[0]?.count || 0
        },

        content: {
          total: contentTotal[0]?.count || 0
        },

        achievements: {
          total: achievementsTotal[0]?.count || 0
        },

        sections: {
          total: sectionsTotal[0]?.count || 0
        },

        grades: {
          total: gradesTotal[0]?.count || 0
        },

        contentBySection,
        contentByGrade,
        visitsByDay
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
