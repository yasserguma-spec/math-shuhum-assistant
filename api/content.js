import sql from '../lib/db.js';

function send(res, status, body) {
  res.status(status).json(body);
}

async function requireAdmin(req) {
  try {
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;

    if (!host) return false;

    const cookie = req.headers.cookie || '';

    const response = await fetch(`${protocol}://${host}/api/admin/session`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(cookie ? { cookie } : {})
      },
      cache: 'no-store'
    });

    if (!response.ok) return false;

    const data = await response.json();

    return data && data.authenticated === true;
  } catch (error) {
    console.error('Admin session check failed:', error);
    return false;
  }
}

function cleanText(value, max = 5000) {
  return String(value ?? '').trim().slice(0, max);
}

async function resolveSectionId(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const raw = String(value).trim();

  if (/^\d+$/.test(raw)) {
    const rows = await sql`
      SELECT id
      FROM sections
      WHERE id = ${Number(raw)}
      LIMIT 1
    `;

    return rows[0]?.id ?? null;
  }

  const rows = await sql`
    SELECT id
    FROM sections
    WHERE slug = ${raw}
    LIMIT 1
  `;

  return rows[0]?.id ?? null;
}

async function resolveGradeId(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const raw = String(value).trim();

  if (/^\d+$/.test(raw)) {
    const rows = await sql`
      SELECT id
      FROM grades
      WHERE id = ${Number(raw)}
      LIMIT 1
    `;

    return rows[0]?.id ?? null;
  }

  const rows = await sql`
    SELECT id
    FROM grades
    WHERE slug = ${raw}
    LIMIT 1
  `;

  return rows[0]?.id ?? null;
}

function mapContent(row) {
  if (!row) return null;

  return {
    __backendId: String(row.id),
    id: row.id,

    title: row.title || '',
    description: row.description || '',

    section: row.section_slug || '',
    section_id: row.section_id ?? null,
    section_name: row.section_name || '',

    grade: row.grade_slug || '',
    grade_id: row.grade_id ?? null,
    grade_name: row.grade_name || '',

    content_type: row.content_type || 'رابط',

    link: row.link || '',
    image_url: row.image_url || '',
    file_url: row.file_url || '',
    file_name: row.file_name || '',

    is_featured: Boolean(row.is_featured),

    sort_order: Number(row.sort_order || 0),

    is_active: row.is_active !== false,

    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function getAllContent() {
  return await sql`
    SELECT
      c.id,
      c.title,
      c.description,

      c.section_id,
      s.slug AS section_slug,
      s.name AS section_name,

      c.grade_id,
      g.slug AS grade_slug,
      g.name AS grade_name,

      c.content_type,
      c.link,
      c.image_url,
      c.file_url,
      c.file_name,

      c.is_featured,
      c.sort_order,
      c.is_active,

      c.created_at,
      c.updated_at

    FROM content c

    LEFT JOIN sections s
      ON s.id = c.section_id

    LEFT JOIN grades g
      ON g.id = c.grade_id

    WHERE c.is_active = TRUE

    ORDER BY
      c.sort_order ASC,
      c.created_at DESC,
      c.id DESC
  `;
}

export default async function handler(req, res) {
  try {

    /* =========================================================
       GET
       جلب جميع المحتويات النشطة
       ========================================================= */

    if (req.method === 'GET') {
      const rows = await getAllContent();

      return send(res, 200, {
        success: true,
        count: rows.length,
        content: rows.map(mapContent)
      });
    }


    /* =========================================================
       السماح بالعمليات الإدارية فقط
       ========================================================= */

    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return send(res, 405, {
        success: false,
        error: 'Method Not Allowed'
      });
    }


    /* =========================================================
       التحقق من جلسة المدير
       ========================================================= */

    const authenticated = await requireAdmin(req);

    if (!authenticated) {
      return send(res, 401, {
        success: false,
        error: 'غير مصرح. يجب تسجيل الدخول إلى الإدارة أولًا.'
      });
    }


    /* =========================================================
       POST
       إضافة محتوى جديد
       ========================================================= */

    if (req.method === 'POST') {
      const body = req.body || {};

      const title = cleanText(body.title, 500);

      if (!title) {
        return send(res, 400, {
          success: false,
          error: 'عنوان المحتوى مطلوب.'
        });
      }


      const sectionId = await resolveSectionId(
        body.section_id ?? body.section
      );

      if (!sectionId) {
        return send(res, 400, {
          success: false,
          error: 'القسم المحدد غير موجود.'
        });
      }


      const gradeId = await resolveGradeId(
        body.grade_id ?? body.grade
      );


      const rows = await sql`
        INSERT INTO content (
          title,
          description,
          section_id,
          grade_id,
          content_type,
          link,
          image_url,
          file_url,
          file_name,
          is_featured,
          sort_order,
          is_active
        )

        VALUES (
          ${title},
          ${cleanText(body.description, 5000)},
          ${sectionId},
          ${gradeId},
          ${cleanText(body.content_type || 'رابط', 100)},
          ${cleanText(body.link, 2000)},
          ${cleanText(body.image_url, 5000)},
          ${cleanText(body.file_url, 5000)},
          ${cleanText(body.file_name, 500)},
          ${Boolean(body.is_featured)},
          ${
            Number.isFinite(Number(body.sort_order))
              ? Number(body.sort_order)
              : 0
          },
          ${body.is_active !== false}
        )

        RETURNING id
      `;


      const inserted = await sql`
        SELECT
          c.id,
          c.title,
          c.description,

          c.section_id,
          s.slug AS section_slug,
          s.name AS section_name,

          c.grade_id,
          g.slug AS grade_slug,
          g.name AS grade_name,

          c.content_type,
          c.link,
          c.image_url,
          c.file_url,
          c.file_name,

          c.is_featured,
          c.sort_order,
          c.is_active,

          c.created_at,
          c.updated_at

        FROM content c

        LEFT JOIN sections s
          ON s.id = c.section_id

        LEFT JOIN grades g
          ON g.id = c.grade_id

        WHERE c.id = ${insertedId(rows)}

        LIMIT 1
      `;


      return send(res, 201, {
        success: true,
        content: mapContent(inserted[0])
      });
    }


    /* =========================================================
       PUT / PATCH
       تعديل محتوى موجود
       ========================================================= */

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = req.body || {};

      const id = Number(
        body.id ?? body.__backendId
      );


      if (!Number.isInteger(id) || id <= 0) {
        return send(res, 400, {
          success: false,
          error: 'معرّف المحتوى غير صالح.'
        });
      }


      const existingRows = await sql`
        SELECT id
        FROM content
        WHERE id = ${id}
        LIMIT 1
      `;


      if (!existingRows.length) {
        return send(res, 404, {
          success: false,
          error: 'المحتوى غير موجود.'
        });
      }


      const sectionId = await resolveSectionId(
        body.section_id ?? body.section
      );


      if (!sectionId) {
        return send(res, 400, {
          success: false,
          error: 'القسم المحدد غير موجود.'
        });
      }


      const gradeId = await resolveGradeId(
        body.grade_id ?? body.grade
      );


      await sql`
        UPDATE content

        SET
          title = ${cleanText(body.title, 500)},

          description = ${cleanText(
            body.description,
            5000
          )},

          section_id = ${sectionId},

          grade_id = ${gradeId},

          content_type = ${cleanText(
            body.content_type || 'رابط',
            100
          )},

          link = ${cleanText(
            body.link,
            2000
          )},

          image_url = ${cleanText(
            body.image_url,
            5000
          )},

          file_url = ${cleanText(
            body.file_url,
            5000
          )},

          file_name = ${cleanText(
            body.file_name,
            500
          )},

          is_featured = ${Boolean(
            body.is_featured
          )},

          sort_order = ${
            Number.isFinite(Number(body.sort_order))
              ? Number(body.sort_order)
              : 0
          },

          is_active = ${
            body.is_active !== false
          },

          updated_at = NOW()

        WHERE id = ${id}
      `;


      const updated = await sql`
        SELECT
          c.id,
          c.title,
          c.description,

          c.section_id,
          s.slug AS section_slug,
          s.name AS section_name,

          c.grade_id,
          g.slug AS grade_slug,
          g.name AS grade_name,

          c.content_type,
          c.link,
          c.image_url,
          c.file_url,
          c.file_name,

          c.is_featured,
          c.sort_order,
          c.is_active,

          c.created_at,
          c.updated_at

        FROM content c

        LEFT JOIN sections s
          ON s.id = c.section_id

        LEFT JOIN grades g
          ON g.id = c.grade_id

        WHERE c.id = ${id}

        LIMIT 1
      `;


      return send(res, 200, {
        success: true,
        content: mapContent(updated[0])
      });
    }


    /* =========================================================
       DELETE
       حذف محتوى
       ========================================================= */

    if (req.method === 'DELETE') {
      const body = req.body || {};

      const id = Number(
        body.id ??
        body.__backendId ??
        req.query?.id
      );


      if (!Number.isInteger(id) || id <= 0) {
        return send(res, 400, {
          success: false,
          error: 'معرّف المحتوى غير صالح.'
        });
      }


      const result = await sql`
        DELETE FROM content
        WHERE id = ${id}
      `;


      if (!result.count) {
        return send(res, 404, {
          success: false,
          error: 'المحتوى غير موجود.'
        });
      }


      return send(res, 200, {
        success: true,
        message: 'تم حذف المحتوى بنجاح.'
      });
    }

  } catch (error) {

    console.error(
      'Content API error:',
      error
    );

    return send(res, 500, {
      success: false,
      error: 'تعذر تنفيذ عملية المحتوى.',

      detail:
        process.env.NODE_ENV === 'development'
          ? String(error?.message || error)
          : undefined
    });
  }
}


/* =========================================================
   استخراج ID للسجل الذي تم إدخاله
   ========================================================= */

function insertedId(rows) {
  return rows?.[0]?.id;
}
