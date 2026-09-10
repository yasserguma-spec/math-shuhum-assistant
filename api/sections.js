import sql from '../lib/db.js';

function send(res, status, body) {
  return res.status(status).json(body);
}

async function requireAdmin(req) {
  try {
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;

    if (!host) return false;

    const cookie = req.headers.cookie || '';

    const response = await fetch(
      `${protocol}://${host}/api/admin/session`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(cookie ? { cookie } : {})
        },
        cache: 'no-store'
      }
    );

    if (!response.ok) return false;

    const data = await response.json();

    return data?.authenticated === true;

  } catch (error) {

    console.error('Admin session check failed:', error);

    return false;
  }
}

function cleanText(value, max = 5000) {
  return String(value ?? '')
    .trim()
    .slice(0, max);
}

function makeSlug(value) {

  const slug = cleanText(value, 180)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

  return slug || `section-${Date.now()}`;
}

function mapSection(row) {

  return {
    __backendId: String(row.id),

    id: row.id,

    title: row.name || '',

    name: row.name || '',

    grade: row.slug || '',

    section_id: row.id,

    slug: row.slug || '',

    icon: row.icon || '',

    content_type: row.icon || '',

    color: row.color || '',

    link: row.color || '',

    sort_order: Number(row.sort_order || 0),

    description: String(row.sort_order ?? 0),

    is_active: row.is_active !== false,

    created_at: row.created_at,

    updated_at: row.updated_at,

    record_type: 'section'
  };
}

export default async function handler(req, res) {

  try {

    // ==============================
    // GET — عرض الأقسام
    // ==============================

    if (req.method === 'GET') {

      const rows = await sql`
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

      return send(res, 200, {

        success: true,

        count: rows.length,

        sections: rows.map(mapSection)

      });
    }


    // ==============================
    // السماح بالعمليات الإدارية
    // ==============================

    if (
      !['POST', 'PUT', 'PATCH', 'DELETE']
        .includes(req.method)
    ) {

      return send(res, 405, {

        success: false,

        error: 'Method Not Allowed'

      });
    }


    // ==============================
    // التحقق من المدير
    // ==============================

    if (!(await requireAdmin(req))) {

      return send(res, 401, {

        success: false,

        error:
          'غير مصرح. يجب تسجيل الدخول إلى الإدارة أولًا.'

      });
    }


    // ==============================
    // POST — إضافة قسم
    // ==============================

    if (req.method === 'POST') {

      const body = req.body || {};

      const name = cleanText(
        body.name ?? body.title,
        200
      );

      if (!name) {

        return send(res, 400, {

          success: false,

          error: 'اسم القسم مطلوب.'

        });
      }


      let slug = makeSlug(
        body.slug || name
      );


      // منع تكرار المعرّف

      const duplicate = await sql`
        SELECT id
        FROM sections
        WHERE slug = ${slug}
        LIMIT 1
      `;


      if (duplicate.length) {

        slug = `${slug}-${Date.now()}`;

      }


      // ترتيب القسم

      let sortOrder = Number(
        body.sort_order
      );


      if (!Number.isFinite(sortOrder)) {

        const orderRows = await sql`
          SELECT
            COALESCE(
              MAX(sort_order),
              -1
            ) + 1 AS next_order
          FROM sections
        `;

        sortOrder = Number(
          orderRows[0]?.next_order || 0
        );
      }


      const rows = await sql`
        INSERT INTO sections (
          name,
          slug,
          icon,
          color,
          sort_order,
          is_active
        )
        VALUES (
          ${name},
          ${slug},
          ${cleanText(
            body.icon ?? body.content_type,
            100
          )},
          ${cleanText(
            body.color ?? body.link,
            100
          )},
          ${sortOrder},
          ${body.is_active !== false}
        )
        RETURNING
          id,
          name,
          slug,
          icon,
          color,
          sort_order,
          is_active,
          created_at,
          updated_at
      `;


      return send(res, 201, {

        success: true,

        section: mapSection(rows[0])

      });
    }


    // ==============================
    // ID للعمليات التالية
    // ==============================

    const body = req.body || {};

    const id = Number(
      body.id ??
      body.__backendId
    );


    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {

      return send(res, 400, {

        success: false,

        error: 'معرّف القسم غير صالح.'

      });
    }


    // ==============================
    // PUT / PATCH — تعديل قسم
    // ==============================

    if (
      req.method === 'PUT' ||
      req.method === 'PATCH'
    ) {

      const existing = await sql`
        SELECT
          id,
          slug
        FROM sections
        WHERE id = ${id}
        LIMIT 1
      `;


      if (!existing.length) {

        return send(res, 404, {

          success: false,

          error: 'القسم غير موجود.'

        });
      }


      const name = cleanText(
        body.name ?? body.title,
        200
      );


      if (!name) {

        return send(res, 400, {

          success: false,

          error: 'اسم القسم مطلوب.'

        });
      }


      const slug = makeSlug(
        body.slug ||
        existing[0].slug ||
        name
      );


      // منع استخدام slug مكرر

      const duplicate = await sql`
        SELECT id
        FROM sections
        WHERE slug = ${slug}
          AND id <> ${id}
        LIMIT 1
      `;


      if (duplicate.length) {

        return send(res, 409, {

          success: false,

          error:
            'معرّف القسم مستخدم بالفعل.'

        });
      }


      const sortOrder =
        Number.isFinite(
          Number(body.sort_order)
        )
          ? Number(body.sort_order)
          : 0;


      const rows = await sql`
        UPDATE sections
        SET
          name = ${name},

          slug = ${slug},

          icon = ${cleanText(
            body.icon ?? body.content_type,
            100
          )},

          color = ${cleanText(
            body.color ?? body.link,
            100
          )},

          sort_order = ${sortOrder},

          is_active =
            ${body.is_active !== false},

          updated_at = NOW()

        WHERE id = ${id}

        RETURNING
          id,
          name,
          slug,
          icon,
          color,
          sort_order,
          is_active,
          created_at,
          updated_at
      `;


      return send(res, 200, {

        success: true,

        section: mapSection(rows[0])

      });
    }


    // ==============================
    // DELETE — حذف قسم
    // ==============================

    const existing = await sql`
      SELECT id
      FROM sections
      WHERE id = ${id}
      LIMIT 1
    `;


    if (!existing.length) {

      return send(res, 404, {

        success: false,

        error: 'القسم غير موجود.'

      });
    }


    /*
      عند حذف القسم:
      لا نحذف المحتوى المرتبط به.
      فقط نفصل المحتوى عن القسم.
    */

    await sql`
      UPDATE content
      SET
        section_id = NULL,
        updated_at = NOW()
      WHERE section_id = ${id}
    `;


    await sql`
      DELETE FROM sections
      WHERE id = ${id}
    `;


    return send(res, 200, {

      success: true,

      message:
        'تم حذف القسم بنجاح، ولم يتم حذف المحتوى المرتبط به.'

    });

  } catch (error) {

    console.error(
      'Sections API error:',
      error
    );


    return send(res, 500, {

      success: false,

      error:
        'تعذر تنفيذ عملية الأقسام.',

      detail:
        process.env.NODE_ENV === 'development'
          ? String(
              error?.message || error
            )
          : undefined

    });
  }
}
