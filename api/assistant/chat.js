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
    let body = req.body;

    // إذا وصل جسم الطلب كنص، نحوله إلى JSON
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (parseError) {
        return res.status(400).json({
          error: "تعذر قراءة بيانات السؤال المرسلة إلى الخادم.",
        });
      }
    }

    // ضمان وجود كائن للبيانات
    body = body || {};

    // قبول message أو query
    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : typeof body.query === "string"
        ? body.query.trim()
        : "";

    // قبول siteContent أو siteContext
    let siteContent = "";

    if (typeof body.siteContent === "string") {
      siteContent = body.siteContent;
    } else if (Array.isArray(body.siteContext)) {
      siteContent = body.siteContext.join("\n");
    }

    // التحقق من وجود السؤال
    if (!message) {
      return res.status(400).json({
        error: "لم يتم استلام السؤال. يرجى كتابة سؤال في الرياضيات.",
        received: body,
      });
    }

    // التحقق من مفتاح OpenAI
    if (!process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is missing");

      return res.status(500).json({
        error: "مفتاح OPENAI_API_KEY غير موجود في إعدادات Vercel.",
      });
    }

    // إرسال السؤال إلى OpenAI
    const response = await client.responses.create({
      model: "gpt-5.6",
      input: [
        {
          role: "system",
          content: `
أنت مساعد رياضيات ذكي تابع لموقع "رياضيات بلاد الشحوم".

التعليمات:
- أجب باللغة العربية.
- ساعد الطلاب والمعلمين في مادة الرياضيات.
- اشرح الحلول الرياضية خطوة بخطوة.
- كن واضحًا ودقيقًا ومشجعًا.
- استخدم محتوى الموقع إذا كان يحتوي على معلومات مرتبطة بالسؤال.
- إذا لم تجد الإجابة في محتوى الموقع، قدم إجابة تعليمية دقيقة من معرفتك.
- لا تدّعِ وجود معلومات في الموقع إذا لم تكن موجودة.
- عند حل المسائل، اكتب خطوات الحل بصورة منظمة وسهلة الفهم.

محتوى الموقع:
${siteContent || "لا يوجد محتوى إضافي للموقع حاليًا."}
          `,
        },
        {
          role: "user",
          content: message,
        },
      ],
    });

    const reply =
      response.output_text ||
      "لم يتمكن المساعد من إنشاء إجابة.";

    return res.status(200).json({
      success: true,
      reply: reply,
    });

  } catch (error) {
    console.error("Assistant error:", error);

    // رسالة خطأ أكثر تفصيلًا في سجلات Vercel
    const errorMessage =
      error?.message ||
      "حدث خطأ غير معروف أثناء الاتصال بالمساعد الذكي.";

    return res.status(500).json({
      error: "حدث خطأ أثناء الاتصال بالمساعد الذكي.",
      details: errorMessage,
    });
  }
}
