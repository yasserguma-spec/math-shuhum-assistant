import sql from './db.js';

export default async function handler(req, res) {
  try {
    const result = await sql`
      SELECT
        NOW() AS server_time,
        current_database() AS database_name
    `;

    return res.status(200).json({
      success: true,
      message: 'تم الاتصال بقاعدة البيانات بنجاح',
      database: result[0].database_name,
      serverTime: result[0].server_time
    });
  } catch (error) {
    console.error('Database test error:', error);

    return res.status(500).json({
      success: false,
      message: 'فشل الاتصال بقاعدة البيانات',
      error: error.message
    });
  }
}
