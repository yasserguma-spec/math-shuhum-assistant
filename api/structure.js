import sql from '../lib/db.js';

function send(res, status, body) {
  return res.status(status).json(body);
}

function cleanText(value, max = 5000) {
  return String(value ?? '').trim().slice(0, max);
}

function makeSlug(value, fallback = 'item') {
  const slug = cleanText(value, 180)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

  return slug || `${fallback}-${Date.now()}`;
}

// =====================================================
// التحقق من المدير
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

    if (rows[0]?.id) {
      return rows[0].id;
    }
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
// الحصول على ID الصف الحقيقي من جدول grades
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

    if (rows[0]?.id) {
      return rows[0].id;
    }
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
// الحصول على grade_id الحقيقي من section_grades
// =====================================================

async function resolveGradeIdFromSectionGrade(
  sectionGradeId,
  sectionId
) {

  if (
    sectionGradeId === null ||
    sectionGradeId === undefined ||
    sectionGradeId === ''
  ) {
    return null;
  }

  const id = Number(sectionGradeId);

  if (
    !Number.isInteger(id) ||
    id <= 0
  ) {
    return null;
  }

  const rows = await sql`
    SELECT grade_id
    FROM section_grades
    WHERE id = ${id}
      AND section_id = ${sectionId}
      AND is_active = TRUE
    LIMIT 1
  `;

  return rows[0]?.grade_id ?? null;
}

// =====================================================
// تحديد الصف لنوع المحتوى
// =====================================================

async function resolveContentTypeGrade(
  body,
  sectionId,
  currentGradeId = null
) {

  if (
    body.grade_id !== undefined &&
    body.grade_id !== null &&
    body.grade_id !== ''
  ) {

    return await resolveGradeId(
      body.grade_id
    );
  }

  if (
    body.grade !== undefined &&
    body.grade !== null &&
    body.grade !== ''
  ) {

    return await resolveGradeId(
      body.grade
    );
  }

  if (
    body.section_grade_id !== undefined &&
    body.section_grade_id !== null &&
    body.section_grade_id !== ''
  ) {

    return await resolveGradeIdFromSectionGrade(
      body.section_grade_id,
      sectionId
    );
  }

  return currentGradeId ?? null;
}

// =====================================================
// تحويل الصف داخل القسم
// =====================================================

function mapSectionGrade(row) {

  return {
    id: row.id,

    __backendId: String(row.id),

    section_id: row.section_id,

    section_name:
      row.section_name || '',

    section_slug:
      row.section_slug || '',

    grade_id:
      row.grade_id,

    grade_name:
      row.grade_name || '',

    grade_slug:
      row.grade_slug || '',

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

    __backendId:
      String(row.id),

    section_id:
      row.section_id,

    section_name:
      row.section_name || '',

    section_slug:
      row.section_slug || '',

    grade_id:
      row.grade_id ?? null,

    grade_name:
      row.grade_name || '',

    grade_slug:
      row.grade_slug || '',

    grade_number:
      row.grade_number !== null &&
      row.grade_number !== undefined
        ? Number(row.grade_number)
        : null,

    name:
      row.name || '',

    title:
      row.name || '',

    slug:
      row.slug || '',

    icon:
      row.icon || '',

    description:
      row.description || '',

    sort_order:
      Number(row.sort_order || 0),

    is_active:
      row.is_active !== false,

    record_type:
      'content_type'
  };
}

// =====================================================
// جلب أنواع المحتوى
// =====================================================

async function getSectionTypes(
  sectionId,
  gradeId = null,
  gradeWasRequested = false
) {

  if (gradeWasRequested) {

    if (!gradeId) {
      return [];
    }

    /*
     * عند اختيار صف:
     *
     * 1. نعرض الأنواع العامة القديمة للقسم
     *    grade_id IS NULL
     *
     * 2. نعرض الأنواع الخاصة بالصف
     *    grade_id = الصف الحالي
     *
     * 3. إذا كان الاسم نفسه موجودًا في الاثنين،
     *    نعتمد النوع الخاص بالصف.
     */

    return await sql`

      WITH candidates AS (

        SELECT

          ct.id,

          ct.section_id,

          s.name AS section_name,

          s.slug AS section_slug,

          ct.grade_id,

          g.name AS grade_name,

          g.slug AS grade_slug,

          g.grade_number,

          ct.name,

          ct.slug,

          ct.icon,

          ct.description,

          ct.sort_order,

          ct.is_active,

          CASE

            WHEN ct.grade_id = ${gradeId}
              THEN 0

            ELSE 1

          END AS priority

        FROM content_types ct

        INNER JOIN sections s
          ON s.id = ct.section_id

        LEFT JOIN grades g
          ON g.id = ct.grade_id

        WHERE

          ct.section_id = ${sectionId}

          AND ct.is_active = TRUE

          AND (

            ct.grade_id = ${gradeId}

            OR ct.grade_id IS NULL

          )
      ),

      unique_types AS (

        SELECT DISTINCT ON (
          LOWER(TRIM(name))
        )

          id,

          section_id,

          section_name,

          section_slug,

          grade_id,

          grade_name,

          grade_slug,

          grade_number,

          name,

          slug,

          icon,

          description,

          sort_order,

          is_active,

          priority

        FROM candidates

        ORDER BY

          LOWER(TRIM(name)),

          priority ASC,

          sort_order ASC,

          id ASC
      )

      SELECT

        id,

        section_id,

        section_name,

        section_slug,

        grade_id,

        grade_name,

        grade_slug,

        grade_number,

        name,

        slug,

        icon,

        description,

        sort_order,

        is_active

      FROM unique_types

      ORDER BY

        sort_order ASC,

        id ASC

    `;
  }

  /*
   * عند عدم تحديد صف:
   * نعرض الأنواع العامة فقط.
   */

  return await sql`

    SELECT

      ct.id,

      ct.section_id,

      s.name AS section_name,

      s.slug AS section_slug,

      ct.grade_id,

      g.name AS grade_name,

      g.slug AS grade_slug,

      g.grade_number,

      ct.name,

      ct.slug,

      ct.icon,

      ct.description,

      ct.sort_order,

      ct.is_active

    FROM content_types ct

    INNER JOIN sections s
      ON s.id = ct.section_id

    LEFT JOIN grades g
      ON g.id = ct.grade_id

    WHERE

      ct.section_id = ${sectionId}

      AND ct.grade_id IS NULL

      AND ct.is_active = TRUE

    ORDER BY

      ct.sort_order ASC,

      ct.id ASC

  `;
}

// =====================================================
// جلب نوع محتوى محدد
// =====================================================

async function getContentTypeById(id) {

  const rows = await sql`

    SELECT

      ct.id,

      ct.section_id,

      s.name AS section_name,

      s.slug AS section_slug,

      ct.grade_id,

      g.name AS grade_name,

      g.slug AS grade_slug,

      g.grade_number,

      ct.name,

      ct.slug,

      ct.icon,

      ct.description,

      ct.sort_order,

      ct.is_active

    FROM content_types ct

    INNER JOIN sections s
      ON s.id = ct.section_id

    LEFT JOIN grades g
      ON g.id = ct.grade_id

    WHERE ct.id = ${id}

    LIMIT 1

  `;

  return rows[0] || null;
}

// =====================================================
// API
// =====================================================

export default async function handler(
  req,
  res
) {

  try {

    // =================================================
    // GET
    // =================================================

    if (req.method === 'GET') {

      const sectionValue =
        req.query?.section_id ??
        req.query?.section;

      const sectionId =
        await resolveSectionId(
          sectionValue
        );

      const type =
        cleanText(
          req.query?.type,
          50
        );

      // ===============================================
      // الصفوف داخل القسم
      // ===============================================

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

          WHERE sg.section_id =
            ${sectionId}

            AND sg.is_active = TRUE

          ORDER BY

            g.grade_number ASC,

            sg.sort_order ASC,

            sg.id ASC

        `;

        return send(res, 200, {

          success: true,

          count:
            rows.length,

          section_grades:
            rows.map(
              mapSectionGrade
            )

        });
      }

      // ===============================================
      // أنواع المحتوى
      // ===============================================

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

        const hasGrade =

          (

            req.query?.grade_id !==
              undefined &&

            req.query?.grade_id !==
              null &&

            req.query?.grade_id !==
              ''

          )

          ||

          (

            req.query?.grade !==
              undefined &&

            req.query?.grade !==
              null &&

            req.query?.grade !==
              ''

          )

          ||

          (

            req.query?.section_grade_id !==
              undefined &&

            req.query?.section_grade_id !==
              null &&

            req.query?.section_grade_id !==
              ''

          );

        let gradeId = null;

        // ---------------------------------------------
        // grade_id
        // ---------------------------------------------

        if (
          req.query?.grade_id
        ) {

          gradeId =
            await resolveGradeId(
              req.query.grade_id
            );

        }

        // ---------------------------------------------
        // grade slug
        // ---------------------------------------------

        else if (
          req.query?.grade
        ) {

          gradeId =
            await resolveGradeId(
              req.query.grade
            );

        }

        // ---------------------------------------------
        // section_grade_id
        // ---------------------------------------------

        else if (
          req.query?.section_grade_id
        ) {

          gradeId =
            await resolveGradeIdFromSectionGrade(
              req.query.section_grade_id,
              sectionId
            );

        }

        if (
          hasGrade &&
          !gradeId
        ) {

          return send(res, 400, {

            success: false,

            error:
              'الصف المحدد غير موجود.'

          });
        }

        const rows =
          await getSectionTypes(
            sectionId,
            gradeId,
            hasGrade
          );

        return send(res, 200, {

          success: true,

          count:
            rows.length,

          grade_id:
            gradeId,

          content_types:
            rows.map(
              mapContentType
            )

        });
      }

      // ===============================================
      // الأقسام
      // ===============================================

      const sections =
        await sql`

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
          Number(
            body.sort_order
          );

        if (
          !Number.isFinite(
            sortOrder
          )
        ) {

          const orderRows =
            await sql`

              SELECT

                COALESCE(
                  MAX(sort_order),
                  -1
                ) + 1
                  AS next_order

              FROM section_grades

              WHERE section_id =
                ${sectionId}

            `;

          sortOrder =
            Number(
              orderRows[0]?.next_order ||
              0
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

        // ---------------------------------------------
        // الصف الحقيقي
        // ---------------------------------------------

        const gradeId =
          await resolveContentTypeGrade(
            body,
            sectionId
          );

        // ---------------------------------------------
        // التأكد أن القسم يستخدم الصفوف
        // ---------------------------------------------

        const sectionHasGrades =
          await sql`

            SELECT id

            FROM section_grades

            WHERE section_id =
              ${sectionId}

              AND is_active = TRUE

            LIMIT 1

          `;

        if (
          sectionHasGrades.length &&
          !gradeId
        ) {

          return send(res, 400, {

            success: false,

            error:
              'يجب تحديد الصف قبل إضافة نوع المحتوى.'

          });
        }

        // ---------------------------------------------
        // التأكد من ارتباط الصف بالقسم
        // ---------------------------------------------

        if (gradeId) {

          const relation =
            await sql`

              SELECT id

              FROM section_grades

              WHERE section_id =
                ${sectionId}

                AND grade_id =
                ${gradeId}

                AND is_active = TRUE

              LIMIT 1

            `;

          if (!relation.length) {

            return send(res, 400, {

              success: false,

              error:
                'الصف المحدد غير مرتبط بهذا القسم.'

            });
          }
        }

        const slug =
          makeSlug(
            body.slug ||
            name,
            'content-type'
          );

        // ---------------------------------------------
        // منع التكرار داخل نفس الصف
        // ---------------------------------------------

        const duplicate =
          gradeId

            ? await sql`

                SELECT id

                FROM content_types

                WHERE section_id =
                  ${sectionId}

                  AND grade_id =
                  ${gradeId}

                  AND slug =
                  ${slug}

                LIMIT 1

              `

            : await sql`

                SELECT id

                FROM content_types

                WHERE section_id =
                  ${sectionId}

                  AND grade_id IS NULL

                  AND slug =
                  ${slug}

                LIMIT 1

              `;

        if (duplicate.length) {

          return send(res, 409, {

            success: false,

            error:
              'نوع المحتوى موجود بالفعل لهذا الصف.'

          });
        }

        let sortOrder =
          Number(
            body.sort_order
          );

        if (
          !Number.isFinite(
            sortOrder
          )
        ) {

          const orderRows =
            gradeId

              ? await sql`

                  SELECT

                    COALESCE(
                      MAX(sort_order),
                      -1
                    ) + 1
                      AS next_order

                  FROM content_types

                  WHERE section_id =
                    ${sectionId}

                    AND grade_id =
                    ${gradeId}

                `

              : await sql`

                  SELECT

                    COALESCE(
                      MAX(sort_order),
                      -1
                    ) + 1
                      AS next_order

                  FROM content_types

                  WHERE section_id =
                    ${sectionId}

                    AND grade_id IS NULL

                `;

          sortOrder =
            Number(
              orderRows[0]?.next_order ||
              0
            );
        }

        const rows =
          await sql`

            INSERT INTO content_types (

              section_id,

              grade_id,

              name,

              slug,

              icon,

              description,

              sort_order,

              is_active

            )

            VALUES (

              ${sectionId},

              ${gradeId},

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
          await getContentTypeById(
            rows[0].id
          );

        return send(res, 201, {

          success: true,

          content_type:
            mapContentType(
              result
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
      // تعديل صف
      // ===============================================

      if (
        entity === 'grade' ||
        entity === 'section-grade'
      ) {

        const existing =
          await sql`

            SELECT id

            FROM section_grades

            WHERE id =
              ${id}

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

        if (
          !sectionId ||
          !gradeId
        ) {

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
            Number(
              body.sort_order
            )
          )

            ? Number(
                body.sort_order
              )

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

            WHERE id =
              ${id}

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

            SELECT

              id,

              section_id,

              grade_id,

              sort_order

            FROM content_types

            WHERE id =
              ${id}

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

        if (
          !sectionId ||
          !name
        ) {

          return send(res, 400, {

            success: false,

            error:
              'القسم واسم النوع مطلوبان.'

          });
        }

        /*
         * إذا لم يرسل النموذج الصف،
         * نحافظ على الصف الحالي.
         */

        const gradeId =
          await resolveContentTypeGrade(
            body,
            sectionId,
            existing[0].grade_id ??
              null
          );

        if (gradeId) {

          const relation =
            await sql`

              SELECT id

              FROM section_grades

              WHERE section_id =
                ${sectionId}

                AND grade_id =
                ${gradeId}

                AND is_active = TRUE

              LIMIT 1

            `;

          if (!relation.length) {

            return send(res, 400, {

              success: false,

              error:
                'الصف المحدد غير مرتبط بهذا القسم.'

            });
          }
        }

        const slug =
          makeSlug(
            body.slug ||
            name,
            'content-type'
          );

        const duplicate =
          gradeId

            ? await sql`

                SELECT id

                FROM content_types

                WHERE section_id =
                  ${sectionId}

                  AND grade_id =
                  ${gradeId}

                  AND slug =
                  ${slug}

                  AND id <> ${id}

                LIMIT 1

              `

            : await sql`

                SELECT id

                FROM content_types

                WHERE section_id =
                  ${sectionId}

                  AND grade_id IS NULL

                  AND slug =
                  ${slug}

                  AND id <> ${id}

                LIMIT 1

              `;

        if (duplicate.length) {

          return send(res, 409, {

            success: false,

            error:
              'نوع المحتوى مستخدم بالفعل لهذا الصف.'

          });
        }

        const sortOrder =
          Number.isFinite(
            Number(
              body.sort_order
            )
          )

            ? Number(
                body.sort_order
              )

            : Number(
                existing[0].sort_order ||
                0
              );

        const rows =
          await sql`

            UPDATE content_types

            SET

              section_id =
                ${sectionId},

              grade_id =
                ${gradeId},

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

            WHERE id =
              ${id}

            RETURNING id

          `;

        const result =
          await getContentTypeById(
            rows[0].id
          );

        return send(res, 200, {

          success: true,

          content_type:
            mapContentType(
              result
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

            WHERE id =
              ${id}

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

            WHERE id =
              ${id}

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

          WHERE id =
            ${id}

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
