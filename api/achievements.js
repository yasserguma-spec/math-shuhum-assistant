import sql from '../lib/db.js';

/* =========================================================
   أدوات مساعدة
   ========================================================= */

function send(res, status, body) {
  return res.status(status).json(body);
}

function cleanText(value, max = 5000) {
  return String(value ?? '').trim().slice(0, max);
}

/* =========================================================
   التحقق من جلسة المدير
   ========================================================= */

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

/* =========================================================
   التحقق من الصف
   ========================================================= */

async function resolveGradeId(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const raw = String(value).trim();

  /* إذا تم إرسال رقم قاعدة البيانات */
  if (/^\d+$/.test(raw)) {

    const rows = await sql`
      SELECT id
      FROM grades
      WHERE id = ${Number(raw)}
      LIMIT 1
    `;

    return rows[0]?.id ?? null;
  }

  /* إذا تم إرسال slug */
  const rows = await sql`
    SELECT id
    FROM grades
    WHERE slug = ${raw}
    LIMIT 1
  `;

  return rows[0]?.id ?? null;
}

/* =========================================================
   تحويل سجل المجيدة إلى الشكل المستخدم في الموقع
   ========================================================= */

function mapAchievement(row) {

  if (!row) return null;

  return {
    __backendId: String(row.id),

    id: row.id,

    student_name:
      row.student_name || '',

    rank:
      Number(row.rank || 0),

    description:
      row.description || '',

    image_url:
      row.image_url || '',

    is_active:
      row.is_active !== false,

    grade_id:
      row.grade_id ?? null,

    grade_name:
      row.grade_name || '',

    grade_slug:
      row.grade_slug || '',

    grade_number:
      row.grade_number ?? null,

    created_at:
      row.created_at,

    updated_at:
      row.updated_at
  };
}

/* =========================================================
   جلب جميع المجيدات النشطة
   ========================================================= */

async function getAllAchievements() {

  return await sql`
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
}


/* =========================================================
   API
   ========================================================= */

export default async function handler(req, res) {

  try {

    /* =====================================================
       GET
       قراءة المجيدات - متاح للجميع
       ===================================================== */

    if (req.method === 'GET') {

      const achievements =
        await getAllAchievements();

      return send(res, 200, {
        success: true,
        count: achievements.length,
        achievements:
          achievements.map(mapAchievement)
      });
    }


    /* =====================================================
       بقية العمليات تحتاج مديرًا مسجلاً
       ===================================================== */

    if (
      !['POST', 'PUT', 'PATCH', 'DELETE']
        .includes(req.method)
    ) {

      return send(res, 405, {
        success: false,
        error: 'Method Not Allowed'
      });
    }


    /* =====================================================
       التحقق من تسجيل الدخول
       ===================================================== */

    const authenticated =
      await requireAdmin(req);

    if (!authenticated) {

      return send(res, 401, {
        success: false,
        error:
          'غير مصرح. يجب تسجيل الدخول إلى الإدارة أولًا.'
      });
    }


    /* =====================================================
       POST
       إضافة مجيدة جديدة
       ===================================================== */

    if (req.method === 'POST') {

      const body = req.body || {};

      const studentName =
        cleanText(
          body.student_name ??
          body.studentName,
          300
        );

      if (!studentName) {

        return send(res, 400, {
          success: false,
          error:
            'اسم الطالبة أو الطالب مطلوب.'
        });
      }


      /* التحقق من المركز */

      const rank =
        Number(
          body.rank
        );

      if (
        !Number.isInteger(rank) ||
        rank < 1 ||
        rank > 12
      ) {

        return send(res, 400, {
          success: false,
          error:
            'المركز يجب أن يكون من 1 إلى 12.'
        });
      }


      /* تحديد الصف */

      const gradeId =
        await resolveGradeId(
          body.grade_id ??
          body.grade
        );

      if (!gradeId) {

        return send(res, 400, {
          success: false,
          error:
            'الصف المحدد غير موجود.'
        });
      }


      /* إضافة السجل */

      const inserted =
        await sql`
          INSERT INTO achievements (
            student_name,
            grade_id,
            rank,
            description,
            image_url,
            is_active
          )

          VALUES (
            ${studentName},
            ${gradeId},
            ${rank},
            ${cleanText(
              body.description,
              5000
            )},
            ${cleanText(
              body.image_url,
              5000
            )},
            ${body.is_active !== false}
          )

          RETURNING id
        `;


      const newId =
        inserted?.[0]?.id;


      const result =
        await sql`
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

          WHERE a.id = ${newId}

          LIMIT 1
        `;


      return send(res, 201, {
        success: true,
        achievement:
          mapAchievement(result[0])
      });
    }


    /* =====================================================
       PUT / PATCH
       تعديل مجيدة
       ===================================================== */

    if (
      req.method === 'PUT' ||
      req.method === 'PATCH'
    ) {

      const body = req.body || {};

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
            'معرّف المجيدة غير صالح.'
        });
      }


      /* التأكد من وجود السجل */

      const existing =
        await sql`
          SELECT id
          FROM achievements
          WHERE id = ${id}
          LIMIT 1
        `;


      if (!existing.length) {

        return send(res, 404, {
          success: false,
          error:
            'المجيدة غير موجودة.'
        });
      }


      const studentName =
        cleanText(
          body.student_name ??
          body.studentName,
          300
        );

      if (!studentName) {

        return send(res, 400, {
          success: false,
          error:
            'اسم الطالبة أو الطالب مطلوب.'
        });
      }


      /* التحقق من المركز */

      const rank =
        Number(
          body.rank
        );

      if (
        !Number.isInteger(rank) ||
        rank < 1 ||
        rank > 12
      ) {

        return send(res, 400, {
          success: false,
          error:
            'المركز يجب أن يكون من 1 إلى 12.'
        });
      }


      /* تحديد الصف */

      const gradeId =
        await resolveGradeId(
          body.grade_id ??
          body.grade
        );

      if (!gradeId) {

        return send(res, 400, {
          success: false,
          error:
            'الصف المحدد غير موجود.'
        });
      }


      /* تحديث السجل */

      await sql`
        UPDATE achievements

        SET
          student_name =
            ${studentName},

          grade_id =
            ${gradeId},

          rank =
            ${rank},

          description =
            ${cleanText(
              body.description,
              5000
            )},

          image_url =
            ${cleanText(
              body.image_url,
              5000
            )},

          is_active =
            ${body.is_active !== false},

          updated_at =
            NOW()

        WHERE id = ${id}
      `;


      /* قراءة السجل بعد التحديث */

      const updated =
        await sql`
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

          WHERE a.id = ${id}

          LIMIT 1
        `;


      return send(res, 200, {
        success: true,
        achievement:
          mapAchievement(updated[0])
      });
    }


    /* =====================================================
       DELETE
       حذف مجيدة
       ===================================================== */

    if (req.method === 'DELETE') {

      const body = req.body || {};

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
            'معرّف المجيدة غير صالح.'
        });
      }


      const result =
        await sql`
          DELETE FROM achievements
          WHERE id = ${id}
        `;


      if (!result.count) {

        return send(res, 404, {
          success: false,
          error:
            'المجيدة غير موجودة.'
        });
      }


      return send(res, 200, {
        success: true,
        message:
          'تم حذف المجيدة بنجاح.'
      });
    }


  } catch (error) {

    console.error(
      'Achievements API error:',
      error
    );

    return send(res, 500, {
      success: false,
      error:
        'تعذر تنفيذ عملية مجيدات الرياضيات.',

      detail:
        process.env.NODE_ENV === 'development'
          ? String(
              error?.message || error
            )
          : undefined
    });
  }
}
