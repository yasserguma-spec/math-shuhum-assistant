import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  // السماح بطلبات POST فقط
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    // استقبال البيانات بطريقة آمنة
    let body = req.body;

    // إذا وصلت البيانات كنص JSON، نحولها إلى كائن
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (parseError) {
        return res.status(400).json({
          error: "تعذر قراءة بيانات السؤال المرسلة إلى المساعد.",
        });
      }
    }

    // استخراج السؤال
    const message =
      body && typeof body.message === "string"
        ? body.message.trim()
        : "";

    const siteContent =
      body && typeof body.siteContent === "string"
        ? body.siteContent
        : "";

    // التحقق من السؤال
    if (!message) {
      return res.status(400).json({
        error: "لم يتم استلام السؤال. يرجى كتابة سؤالك في الرياضيات.",
      });
    }

    // التحقق من مفتاح OpenAI
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "مفتاح OPENAI_API_KEY غير موجود في إعدادات المشروع.",
      });
    }

    // إرسال السؤال إلى OpenAI
    const response = await client.responses.create({
      model: "gpt-5.6",
      input: [
        {
          role: "system",
          content: `
أنت مساعد رياضيات ذكي تابع لموقع "مساعد شحوم للرياضيات".

تعليماتك:
- أجب باللغة العربية دائمًا.
- ساعد الطلاب والمعلمين في مادة الرياضيات.
- اشرح الحلول الرياضية خطوة بخطوة.
- كن واضحًا ومشجعًا.
- استخدم الرموز والمعادلات الرياضية بطريقة سهلة.
- إذا كان السؤال غير واضح، اطلب من المستخدم توضيحه.
- لا تخترع معلومات أو نتائج غير صحيحة.
- إذا كان محتوى الموقع مفيدًا، استخدمه في الإجابة.

محتوى الموقع:
${siteContent}
          `,
        },
        {
          role: "user",
          content: message,
        },
      ],
    });

    // إعادة إجابة المساعد
    return res.status(200).json({
      reply: response.output_text || "لم يتم إنشاء إجابة من المساعد.",
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
