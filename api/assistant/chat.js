import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  // السماح بطلبات POST فقط
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "هذه الطريقة غير مسموح بها. استخدم POST.",
    });
  }

  try {
    // طباعة نوع البيانات للتشخيص في Vercel Logs
    console.log("Request body type:", typeof req.body);
    console.log("Request body:", req.body);

    let body = req.body;

    // إذا لم تصل البيانات
    if (!body) {
      return res.status(400).json({
        error: "لم يتم استلام بيانات السؤال.",
      });
    }

    // إذا وصلت البيانات على شكل نص
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (error) {
        console.error("JSON parse error:", error);

        return res.status(400).json({
          error: "البيانات المرسلة ليست بصيغة JSON صحيحة.",
        });
      }
    }

    // استخراج الرسالة
    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : "";

    // استخراج محتوى الموقع
    const siteContent =
      typeof body.siteContent === "string"
        ? body.siteContent
        : "";

    // التأكد من السؤال
    if (!message) {
      console.error("Message is missing or empty:", body);

      return res.status(400).json({
        error: "لم يتم استلام سؤال صحيح. يرجى كتابة سؤال في الرياضيات.",
      });
    }

    // التأكد من مفتاح API
    if (!process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is missing");

      return res.status(500).json({
        error: "مفتاح OPENAI_API_KEY غير موجود في إعدادات Vercel.",
      });
    }

    console.log("Sending request to OpenAI...");
    console.log("User message:", message);

    // الاتصال بـ OpenAI
    const response = await client.responses.create({
      model: "gpt-5.6",
      input: [
        {
          role: "system",
          content: `
أنت مساعد رياضيات ذكي تابع لموقع "رياضيات بلاد الشحوم".

تعليماتك الأساسية:
- أجب باللغة العربية.
- ساعد الطلاب والمعلمين في مادة الرياضيات.
- اشرح الحل خطوة بخطوة.
- تحقق من العمليات الحسابية قبل تقديم النتيجة.
- استخدم أسلوبًا تعليميًا واضحًا ومناسبًا للطلاب.
- كن مشجعًا وتفاعليًا.
- إذا كان السؤال بسيطًا، قدم الإجابة بشكل مختصر وواضح.
- إذا طلب المستخدم شرحًا، قدم شرحًا تفصيليًا.
- استخدم محتوى الموقع عند ارتباطه بالسؤال.
- لا تدّعِ وجود معلومات في محتوى الموقع إذا لم تكن موجودة.

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

    const reply =
      response.output_text ||
      "عذرًا، لم يتمكن المساعد من إنشاء إجابة.";

    console.log("OpenAI response received successfully.");

    return res.status(200).json({
      reply: reply,
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
