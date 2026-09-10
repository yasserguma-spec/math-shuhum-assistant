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

  return slug || `grade-${Date.now()}`;
}

function mapGrade(row) {

  return {
    __backendId: String(row.id),

    id: row.id,

    title: row.name || '',

    name: row.name || '',

    grade: row.slug || '',

    grade_id: row.id,

    slug: row.slug || '',

    grade_number:
      row.grade_number !== null &&
      row.grade_number !== undefined
        ? Number(row.grade_number)
        : null,

    sort_order: Number(row.sort_order || 0),

    description: String(row.sort_order ?? 0),

    is_active: row.is_active !== false,

    created_at: row.created_at,

    updated_at: row.updated_at,

    record_type: 'grade'
  };
}

export default async function handler(req, res) {

  try {

    // ==========================================
    // GET — عرض الصفوف الدراسية
    // ==========================================

    if (req.method === 'GET') {

      const rows = await sql`
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
        ORDER BY
          grade_number ASC NULLS LAST,
          sort_order ASC,
          id ASC
      `;

      return send(res, 200, {

        success: true,

        count: rows.length,

        grades: rows.map(mapGrade)

      });
    }


    // ==========================================
    // السماح بالعمليات الإدارية
    // ==========================================

    if (
      !['POST', 'PUT', 'PATCH', 'DELETE']
        .includes(req.method)
    ) {

      return send(res, 405, {

        success: false,

        error: 'Method Not Allowed'

      });
    }


    // ==========================================
    // التحقق من صلاحية المدير
    // ==========================================

    if (!(await requireAdmin(req))) {

      return send(res, 401, {

        success: false,

        error:
          'غير مصرح. يجب تسجيل الدخول إلى الإدارة أولًا.'

      });
    }


    // ==========================================
    // POST — إضافة صف دراسي
    // ==========================================

    if (req.method === 'POST') {

      const body = req.body || {};

      const name = cleanText(
        body.name ?? body.title,
        200
      );

      if (!name) {

        return send(res, 400, {

          success: false,

          error: 'اسم الصف مطلوب.'

        });
      }


      // إنشاء slug

      let slug = makeSlug(
        body.slug || name
      );


      // منع تكرار slug

      const duplicate = await sql`
        SELECT id
        FROM grades
        WHERE slug = ${slug}
        LIMIT 1
      `;


      if (duplicate.length) {

        slug = `${slug}-${Date.now()}`;

      }


      // رقم الصف

      let gradeNumber = Number(
        body.grade_number ??
        body.gradeNumber
      );


      if (!Number.isFinite(gradeNumber)) {

        const existingNumbers = await sql`
          SELECT
            COALESCE(
              MAX(grade_number),
              4
            ) + 1 AS next_grade
          FROM grades
        `;

        gradeNumber = Number(
          existingNumbers[0]?.next_grade || 5
        );
      }


      // ترتيب الصف

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
          FROM grades
        `;

        sortOrder = Number(
          orderRows[0]?.next_order || 0
        );
      }


      const rows = await sql`
        INSERT INTO grades (
          name,
          slug,
          grade_number,
          sort_order,
          is_active
        )
        VALUES (
          ${name},
          ${slug},
          ${gradeNumber},
          ${sortOrder},
          ${body.is_active !== false}
        )
        RETURNING
          id,
          name,
          slug,
          grade_number,
          sort_order,
          is_active,
          created_at,
          updated_at
      `;


      return send(res, 201, {

        success: true,

        grade: mapGrade(rows[0])

      });
    }


    // ==========================================
    // استخراج ID للتعديل أو الحذف
    // ==========================================

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

        error: 'معرّف الصف غير صالح.'

      });
    }


    // ==========================================
    // PUT / PATCH — تعديل صف
    // ==========================================

    if (
      req.method === 'PUT' ||
      req.method === 'PATCH'
    ) {

      const existing = await sql`
        SELECT
          id,
          slug,
          grade_number
        FROM grades
        WHERE id = ${id}
        LIMIT 1
      `;


      if (!existing.length) {

        return send(res, 404, {

          success: false,

          error: 'الصف غير موجود.'

        });
      }


      const name = cleanText(
        body.name ?? body.title,
        200
      );


      if (!name) {

        return send(res, 400, {

          success: false,

          error: 'اسم الصف مطلوب.'

        });
      }


      const slug = makeSlug(
        body.slug ||
        existing[0].slug ||
        name
      );


      // منع تكرار slug

      const duplicate = await sql`
        SELECT id
        FROM grades
        WHERE slug = ${slug}
          AND id <> ${id}
        LIMIT 1
      `;


      if (duplicate.length) {

        return send(res, 409, {

          success: false,

          error:
            'معرّف الصف مستخدم بالفعل.'

        });
      }


      let gradeNumber = Number(
        body.grade_number ??
        body.gradeNumber
      );


      if (!Number.isFinite(gradeNumber)) {

        gradeNumber =
          Number(existing[0].grade_number);

      }


      const sortOrder =
        Number.isFinite(
          Number(body.sort_order)
        )
          ? Number(body.sort_order)
          : 0;


      const rows = await sql`
        UPDATE grades
        SET

          name = ${name},

          slug = ${slug},

          grade_number =
            ${gradeNumber},

          sort_order =
            ${sortOrder},

          is_active =
            ${body.is_active !== false},

          updated_at = NOW()

        WHERE id = ${id}

        RETURNING
          id,
          name,
          slug,
          grade_number,
          sort_order,
          is_active,
          created_at,
          updated_at
      `;


      return send(res, 200, {

        success: true,

        grade: mapGrade(rows[0])

      });
    }


    // ==========================================
    // DELETE — حذف صف
    // ==========================================

    const existing = await sql`
      SELECT id
      FROM grades
      WHERE id = ${id}
      LIMIT 1
    `;


    if (!existing.length) {

      return send(res, 404, {

        success: false,

        error: 'الصف غير موجود.'

      });
    }


    /*
      حماية المحتوى:
      عند حذف الصف لا نحذف المحتويات
      المرتبطة به، بل نفصلها عن الصف.
    */

    await sql`
      UPDATE content
      SET
        grade_id = NULL,
        updated_at = NOW()
      WHERE grade_id = ${id}
    `;


    await sql`
      UPDATE achievements
      SET
        grade_id = NULL,
        updated_at = NOW()
      WHERE grade_id = ${id}
    `;


    await sql`
      DELETE FROM grades
      WHERE id = ${id}
    `;


    return send(res, 200, {

      success: true,

      message:
        'تم حذف الصف بنجاح، ولم يتم حذف المحتوى أو المجيدات المرتبطة به.'

    });

  } catch (error) {

    console.error(
      'Grades API error:',
      error
    );


    return send(res, 500, {

      success: false,

      error:
        'تعذر تنفيذ عملية الصفوف.',

      detail:
        process.env.NODE_ENV === 'development'
          ? String(
              error?.message || error
            )
          : undefined

    });
  }
}
