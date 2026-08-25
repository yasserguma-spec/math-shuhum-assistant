import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const { message, siteContent = "" } = req.body || {};

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        error: "يرجى كتابة سؤال في الرياضيات.",
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "مفتاح OPENAI_API_KEY غير موجود في إعدادات Vercel.",
      });
    }

    const response = await client.responses.create({
      model: "gpt-5.6",
      input: [
        {
          role: "system",
          content: `
أنت مساعد رياضيات ذكي تابع لموقع "رياضيات بلاد الشحوم".

اتبع التعليمات التالية:
- أجب دائمًا باللغة العربية.
- ساعد الطلاب والمعلمين في مادة الرياضيات.
- اشرح الحل بطريقة واضحة ومنظمة.
- عند حل مسألة رياضية، اشرح الحل خطوة بخطوة.
- استخدم الرموز والمعادلات الرياضية بشكل واضح.
- كن مشجعًا ومناسبًا للطلاب.
- إذا كان السؤال غير واضح، اطلب توضيحه.
- لا تقدم معلومات غير صحيحة.
- استخدم محتوى الموقع إذا كان مفيدًا للإجابة.

محتوى الموقع:
${siteContent}
          `,
        },
        {
          role: "user",
          content: message.trim(),
        },
      ],
    });

    return res.status(200).json({
      reply:
        response.output_text ||
        "عذرًا، لم يتمكن المساعد من إنشاء إجابة.",
    });

  } catch (error) {
    console.error("Assistant error:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "حدث خطأ أثناء الاتصال بالمساعد الذكي.",
    });
  }
}
