import sql from '../lib/db.js';

function send(res, status, body) {
  return res.status(status).json(body);
}

// =====================================================
// التحقق من صلاحية المدير
// =====================================================

async function requireAdmin(req) {
  try {
    const protocol =
      req.headers['x-forwarded-proto'] || 'https';

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

    console.error(
      'Admin session check failed:',
      error
    );

    return false;
  }
}


// =====================================================
// تنظيف النصوص
// =====================================================

function cleanText(value, max = 5000) {

  return String(value ?? '')
    .trim()
    .slice(0, max);
}


// =====================================================
// إنشاء Slug
// =====================================================

function makeSlug(value, fallback = 'item') {

  const slug = cleanText(value, 180)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

  return slug || `${fallback}-${Date.now()}`;
}


// =====================================================
// الحصول على ID القسم
// =====================================================

async function resolveSectionId(value) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
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


// =====================================================
// الحصول على ID الصف
// =====================================================

async function resolveGradeId(value) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
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


// =====================================================
// تحويل علاقة القسم والصف
// =====================================================

function mapSectionGrade(row) {

  return {

    id: row.id,

    __backendId: String(row.id),

    section_id: row.section_id,

    section_name: row.section_name || '',

    section_slug: row.section_slug || '',

    grade_id: row.grade_id,

    grade_name: row.grade_name || '',

    grade_slug: row.grade_slug || '',

    grade_number:
      row.grade_number !== null &&
      row.grade_number !== undefined
        ? Number(row.grade_number)
        : null,

    sort_order:
      Number(row.sort_order || 0),

    is_active:
      row.is_active !== false,

    record_type:
      'section_grade'
  };
}


// =====================================================
// تحويل نوع المحتوى
// =====================================================

function mapContentType(row) {

  return {

    id: row.id,

    __backendId: String(row.id),

    section_id: row.section_id,

    section_name: row.section_name || '',

    section_slug: row.section_slug || '',

    name: row.name || '',

    title: row.name || '',

    slug: row.slug || '',

    icon: row.icon || '',

    description: row.description || '',

    sort_order:
      Number(row.sort_order || 0),

    is_active:
      row.is_active !== false,

    record_type:
      'content_type'
  };
}


// =====================================================
// GET
// =====================================================

export default async function handler(req, res) {

  try {

    // =================================================
    // GET — جلب الصفوف والأنواع
    // =================================================

    if (req.method === 'GET') {

      const sectionId =
        await resolveSectionId(
          req.query?.section_id ??
          req.query?.section
        );


      const type =
        cleanText(
          req.query?.type,
          50
        );


      // -----------------------------------------------
      // صفوف قسم محدد
      // -----------------------------------------------

      if (
        type === 'grades' ||
        type === 'section-grades'
      ) {

        if (!sectionId) {

          return send(res, 400, {

            success: false,

            error:
              'يجب تحديد القسم.'

          });
        }


        const rows = await sql`

          SELECT

            sg.id,

            sg.section_id,

            s.name AS section_name,

            s.slug AS section_slug,

            sg.grade_id,

            g.name AS grade_name,

            g.slug AS grade_slug,

            g.grade_number,

            sg.sort_order,

            sg.is_active

          FROM section_grades sg

          INNER JOIN sections s
            ON s.id = sg.section_id

          INNER JOIN grades g
            ON g.id = sg.grade_id

          WHERE sg.section_id = ${sectionId}

            AND sg.is_active = TRUE

          ORDER BY

            g.grade_number ASC,

            sg.sort_order ASC,

            sg.id ASC
        `;


        return send(res, 200, {

          success: true,

          count: rows.length,

          section_grades:
            rows.map(mapSectionGrade)

        });
      }


      // -----------------------------------------------
      // أنواع المحتوى لقسم محدد
      // -----------------------------------------------

      if (
        type === 'types' ||
        type === 'content-types'
      ) {

        if (!sectionId) {

          return send(res, 400, {

            success: false,

            error:
              'يجب تحديد القسم.'

          });
        }


        const rows = await sql`

          SELECT

            ct.id,

            ct.section_id,

            s.name AS section_name,

            s.slug AS section_slug,

            ct.name,

            ct.slug,

            ct.icon,

            ct.description,

            ct.sort_order,

            ct.is_active

          FROM content_types ct

          INNER JOIN sections s
            ON s.id = ct.section_id

          WHERE ct.section_id =
            ${sectionId}

            AND ct.is_active = TRUE

          ORDER BY

            ct.sort_order ASC,

            ct.id ASC
        `;


        return send(res, 200, {

          success: true,

          count: rows.length,

          content_types:
            rows.map(mapContentType)

        });
      }


      // -----------------------------------------------
      // إذا لم يتم تحديد نوع
      // -----------------------------------------------

      const sections = await sql`

        SELECT
          id,
          name,
          slug,
          icon,
          color,
          sort_order,
          is_active

        FROM sections

        WHERE is_active = TRUE

        ORDER BY
          sort_order ASC,
          id ASC
      `;


      return send(res, 200, {

        success: true,

        sections

      });
    }


    // =================================================
    // العمليات الإدارية
    // =================================================

    if (
      ![
        'POST',
        'PUT',
        'PATCH',
        'DELETE'
      ].includes(req.method)
    ) {

      return send(res, 405, {

        success: false,

        error:
          'Method Not Allowed'

      });
    }


    // =================================================
    // التحقق من المدير
    // =================================================

    if (
      !(await requireAdmin(req))
    ) {

      return send(res, 401, {

        success: false,

        error:
          'غير مصرح. يجب تسجيل الدخول إلى الإدارة أولًا.'

      });
    }


    const body =
      req.body || {};


    // نوع العملية
    const entity =
      cleanText(
        body.entity ||
        body.type,
        50
      );


    // =================================================
    // POST
    // =================================================

    if (req.method === 'POST') {


      // ===============================================
      // إضافة صف إلى قسم
      // ===============================================

      if (
        entity === 'grade' ||
        entity === 'section-grade'
      ) {

        const sectionId =
          await resolveSectionId(
            body.section_id ??
            body.section
          );


        const gradeId =
          await resolveGradeId(
            body.grade_id ??
            body.grade
          );


        if (!sectionId) {

          return send(res, 400, {

            success: false,

            error:
              'القسم المحدد غير موجود.'

          });
        }


        if (!gradeId) {

          return send(res, 400, {

            success: false,

            error:
              'الصف المحدد غير موجود.'

          });
        }


        const duplicate =
          await sql`

            SELECT id

            FROM section_grades

            WHERE section_id =
              ${sectionId}

              AND grade_id =
              ${gradeId}

            LIMIT 1
          `;


        if (duplicate.length) {

          return send(res, 409, {

            success: false,

            error:
              'هذا الصف موجود بالفعل داخل القسم.'

          });
        }


        let sortOrder =
          Number(body.sort_order);


        if (!Number.isFinite(sortOrder)) {

          const orderRows =
            await sql`

              SELECT

                COALESCE(
                  MAX(sort_order),
                  -1
                ) + 1 AS next_order

              FROM section_grades

              WHERE section_id =
                ${sectionId}
            `;


          sortOrder =
            Number(
              orderRows[0]?.next_order || 0
            );
        }


        const rows =
          await sql`

            INSERT INTO section_grades (

              section_id,

              grade_id,

              sort_order,

              is_active

            )

            VALUES (

              ${sectionId},

              ${gradeId},

              ${sortOrder},

              TRUE

            )

            RETURNING *

          `;


        const result =
          await sql`

            SELECT

              sg.id,

              sg.section_id,

              s.name AS section_name,

              s.slug AS section_slug,

              sg.grade_id,

              g.name AS grade_name,

              g.slug AS grade_slug,

              g.grade_number,

              sg.sort_order,

              sg.is_active

            FROM section_grades sg

            INNER JOIN sections s
              ON s.id = sg.section_id

            INNER JOIN grades g
              ON g.id = sg.grade_id

            WHERE sg.id =
              ${rows[0].id}

            LIMIT 1
          `;


        return send(res, 201, {

          success: true,

          section_grade:
            mapSectionGrade(
              result[0]
            )

        });
      }


      // ===============================================
      // إضافة نوع محتوى
      // ===============================================

      if (
        entity === 'content-type' ||
        entity === 'type'
      ) {

        const sectionId =
          await resolveSectionId(
            body.section_id ??
            body.section
          );


        if (!sectionId) {

          return send(res, 400, {

            success: false,

            error:
              'القسم المحدد غير موجود.'

          });
        }


        const name =
          cleanText(
            body.name ??
            body.title,
            200
          );


        if (!name) {

          return send(res, 400, {

            success: false,

            error:
              'اسم نوع المحتوى مطلوب.'

          });
        }


        const slug =
          makeSlug(
            body.slug ||
            name,
            'content-type'
          );


        const duplicate =
          await sql`

            SELECT id

            FROM content_types

            WHERE section_id =
              ${sectionId}

              AND slug =
              ${slug}

            LIMIT 1
          `;


        if (duplicate.length) {

          return send(res, 409, {

            success: false,

            error:
              'نوع المحتوى موجود بالفعل في هذا القسم.'

          });
        }


        let sortOrder =
          Number(body.sort_order);


        if (!Number.isFinite(sortOrder)) {

          const orderRows =
            await sql`

              SELECT

                COALESCE(
                  MAX(sort_order),
                  -1
                ) + 1 AS next_order

              FROM content_types

              WHERE section_id =
                ${sectionId}
            `;


          sortOrder =
            Number(
              orderRows[0]?.next_order || 0
            );
        }


        const rows =
          await sql`

            INSERT INTO content_types (

              section_id,

              name,

              slug,

              icon,

              description,

              sort_order,

              is_active

            )

            VALUES (

              ${sectionId},

              ${name},

              ${slug},

              ${cleanText(
                body.icon,
                100
              )},

              ${cleanText(
                body.description,
                1000
              )},

              ${sortOrder},

              TRUE

            )

            RETURNING id

          `;


        const result =
          await sql`

            SELECT

              ct.id,

              ct.section_id,

              s.name AS section_name,

              s.slug AS section_slug,

              ct.name,

              ct.slug,

              ct.icon,

              ct.description,

              ct.sort_order,

              ct.is_active

            FROM content_types ct

            INNER JOIN sections s
              ON s.id = ct.section_id

            WHERE ct.id =
              ${rows[0].id}

            LIMIT 1

          `;


        return send(res, 201, {

          success: true,

          content_type:
            mapContentType(
              result[0]
            )

        });
      }


      return send(res, 400, {

        success: false,

        error:
          'نوع العملية غير معروف.'

      });
    }


    // =================================================
    // PUT / PATCH
    // =================================================

    if (
      req.method === 'PUT' ||
      req.method === 'PATCH'
    ) {

      const id =
        Number(
          body.id ??
          body.__backendId
        );


      if (
        !Number.isInteger(id) ||
        id <= 0
      ) {

        return send(res, 400, {

          success: false,

          error:
            'المعرّف غير صالح.'

        });
      }


      // ===============================================
      // تعديل صف داخل قسم
      // ===============================================

      if (
        entity === 'grade' ||
        entity === 'section-grade'
      ) {

        const existing =
          await sql`

            SELECT id

            FROM section_grades

            WHERE id = ${id}

            LIMIT 1

          `;


        if (!existing.length) {

          return send(res, 404, {

            success: false,

            error:
              'العلاقة بين الصف والقسم غير موجودة.'

          });
        }


        const sectionId =
          await resolveSectionId(
            body.section_id ??
            body.section
          );


        const gradeId =
          await resolveGradeId(
            body.grade_id ??
            body.grade
          );


        if (!sectionId || !gradeId) {

          return send(res, 400, {

            success: false,

            error:
              'القسم والصف مطلوبان.'

          });
        }


        const duplicate =
          await sql`

            SELECT id

            FROM section_grades

            WHERE section_id =
              ${sectionId}

              AND grade_id =
              ${gradeId}

              AND id <> ${id}

            LIMIT 1

          `;


        if (duplicate.length) {

          return send(res, 409, {

            success: false,

            error:
              'هذا الصف موجود بالفعل داخل القسم.'

          });
        }


        const sortOrder =
          Number.isFinite(
            Number(body.sort_order)
          )
            ? Number(body.sort_order)
            : 0;


        const rows =
          await sql`

            UPDATE section_grades

            SET

              section_id =
                ${sectionId},

              grade_id =
                ${gradeId},

              sort_order =
                ${sortOrder},

              is_active =
                ${body.is_active !== false}

            WHERE id = ${id}

            RETURNING id

          `;


        const result =
          await sql`

            SELECT

              sg.id,

              sg.section_id,

              s.name AS section_name,

              s.slug AS section_slug,

              sg.grade_id,

              g.name AS grade_name,

              g.slug AS grade_slug,

              g.grade_number,

              sg.sort_order,

              sg.is_active

            FROM section_grades sg

            INNER JOIN sections s
              ON s.id = sg.section_id

            INNER JOIN grades g
              ON g.id = sg.grade_id

            WHERE sg.id =
              ${rows[0].id}

            LIMIT 1

          `;


        return send(res, 200, {

          success: true,

          section_grade:
            mapSectionGrade(
              result[0]
            )

        });
      }


      // ===============================================
      // تعديل نوع المحتوى
      // ===============================================

      if (
        entity === 'content-type' ||
        entity === 'type'
      ) {

        const existing =
          await sql`

            SELECT id

            FROM content_types

            WHERE id = ${id}

            LIMIT 1

          `;


        if (!existing.length) {

          return send(res, 404, {

            success: false,

            error:
              'نوع المحتوى غير موجود.'

          });
        }


        const sectionId =
          await resolveSectionId(
            body.section_id ??
            body.section
          );


        const name =
          cleanText(
            body.name ??
            body.title,
            200
          );


        if (!sectionId || !name) {

          return send(res, 400, {

            success: false,

            error:
              'القسم واسم النوع مطلوبان.'

          });
        }


        const slug =
          makeSlug(
            body.slug ||
            name,
            'content-type'
          );


        const duplicate =
          await sql`

            SELECT id

            FROM content_types

            WHERE section_id =
              ${sectionId}

              AND slug =
              ${slug}

              AND id <> ${id}

            LIMIT 1

          `;


        if (duplicate.length) {

          return send(res, 409, {

            success: false,

            error:
              'نوع المحتوى مستخدم بالفعل.'

          });
        }


        const sortOrder =
          Number.isFinite(
            Number(body.sort_order)
          )
            ? Number(body.sort_order)
            : 0;


        const rows =
          await sql`

            UPDATE content_types

            SET

              section_id =
                ${sectionId},

              name =
                ${name},

              slug =
                ${slug},

              icon =
                ${cleanText(
                  body.icon,
                  100
                )},

              description =
                ${cleanText(
                  body.description,
                  1000
                )},

              sort_order =
                ${sortOrder},

              is_active =
                ${body.is_active !== false},

              updated_at =
                NOW()

            WHERE id = ${id}

            RETURNING id

          `;


        const result =
          await sql`

            SELECT

              ct.id,

              ct.section_id,

              s.name AS section_name,

              s.slug AS section_slug,

              ct.name,

              ct.slug,

              ct.icon,

              ct.description,

              ct.sort_order,

              ct.is_active

            FROM content_types ct

            INNER JOIN sections s
              ON s.id = ct.section_id

            WHERE ct.id =
              ${rows[0].id}

            LIMIT 1

          `;


        return send(res, 200, {

          success: true,

          content_type:
            mapContentType(
              result[0]
            )

        });
      }


      return send(res, 400, {

        success: false,

        error:
          'نوع العملية غير معروف.'

      });
    }


    // =================================================
    // DELETE
    // =================================================

    if (req.method === 'DELETE') {

      const id =
        Number(
          body.id ??
          body.__backendId ??
          req.query?.id
        );


      if (
        !Number.isInteger(id) ||
        id <= 0
      ) {

        return send(res, 400, {

          success: false,

          error:
            'المعرّف غير صالح.'

        });
      }


      // ===============================================
      // حذف صف من قسم
      // ===============================================

      if (
        entity === 'grade' ||
        entity === 'section-grade'
      ) {

        const result =
          await sql`

            DELETE FROM section_grades

            WHERE id = ${id}

          `;


        if (!result.count) {

          return send(res, 404, {

            success: false,

            error:
              'الصف غير موجود داخل هذا القسم.'

          });
        }


        return send(res, 200, {

          success: true,

          message:
            'تم إزالة الصف من القسم بنجاح.'

        });
      }


      // ===============================================
      // حذف نوع محتوى
      // ===============================================

      if (
        entity === 'content-type' ||
        entity === 'type'
      ) {

        const existing =
          await sql`

            SELECT id

            FROM content_types

            WHERE id = ${id}

            LIMIT 1

          `;


        if (!existing.length) {

          return send(res, 404, {

            success: false,

            error:
              'نوع المحتوى غير موجود.'

          });
        }


        await sql`

          DELETE FROM content_types

          WHERE id = ${id}

        `;


        return send(res, 200, {

          success: true,

          message:
            'تم حذف نوع المحتوى بنجاح.'

        });
      }


      return send(res, 400, {

        success: false,

        error:
          'نوع العملية غير معروف.'

      });
    }

  } catch (error) {

    console.error(
      'Structure API error:',
      error
    );


    return send(res, 500, {

      success: false,

      error:
        'تعذر تنفيذ عملية إدارة هيكل الموقع.',

      detail:
        process.env.NODE_ENV === 'development'
          ? String(
              error?.message ||
              error
            )
          : undefined

    });
  }
}
