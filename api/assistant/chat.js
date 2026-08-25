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
    // قراءة البيانات القادمة من الموقع
    let body = req.body;

    // إذا كانت البيانات نصًا نحاول تحويلها إلى JSON
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (parseError) {
        return res.status(400).json({
          error: "تعذر قراءة البيانات المرسلة.",
        });
      }
    }

    // استخراج السؤال
    const message =
      body && typeof body.message === "string"
        ? body.message.trim()
        : "";

    // استخراج محتوى الموقع إن وجد
    const siteContent =
      body && typeof body.siteContent === "string"
        ? body.siteContent
        : "";

    // التأكد من وجود سؤال
    if (!message) {
      return res.status(400).json({
        error: "يرجى كتابة سؤال في الرياضيات.",
      });
    }

    // التأكد من وجود مفتاح OpenAI
    if (!process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is missing");

      return res.status(500).json({
        error: "مفتاح OPENAI_API_KEY غير موجود في إعدادات Vercel.",
      });
    }

    // الاتصال بخدمة OpenAI
    const response = await client.responses.create({
      model: "gpt-5.6",
      input: [
        {
          role: "system",
          content: `
أنت مساعد رياضيات ذكي تابع لموقع "رياضيات بلاد الشحوم".

تعليماتك:
- أجب باللغة العربية.
- ساعد الطلاب والمعلمين في مادة الرياضيات.
- اشرح الحلول الرياضية خطوة بخطوة.
- كن واضحًا ومشجعًا وتفاعليًا.
- تحقق من العمليات الحسابية قبل تقديم الإجابة.
- إذا كان السؤال يحتاج شرحًا، فاشرحه بطريقة مناسبة للطالب.
- لا تدّعِ وجود محتوى في الموقع إذا لم يكن موجودًا.
- استخدم محتوى الموقع إذا كان مرتبطًا بسؤال المستخدم.

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

    // إعادة الرد للموقع
    return res.status(200).json({
      reply:
        response.output_text ||
        "لم يتم استلام رد من المساعد.",
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
