import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  // السماح بطلبات POST فقط
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed. استخدم طلب POST فقط.",
    });
  }

  try {
    // معلومات تشخيصية تظهر في Vercel Logs
    console.log("=== NEW REQUEST ===");
    console.log("Request method:", req.method);
    console.log("Request body type:", typeof req.body);
    console.log("Request body:", req.body);

    let body = req.body;

    // التحقق من وصول البيانات
    if (!body) {
      console.error("DEBUG: req.body is empty");

      return res.status(400).json({
        error: "DEBUG: req.body فارغ تمامًا. لم تصل بيانات السؤال إلى الخادم.",
      });
    }

    // إذا كانت البيانات نصًا، نحاول تحويلها إلى JSON
    if (typeof body === "string") {
      console.log("DEBUG: body is string, trying JSON.parse...");

      try {
        body = JSON.parse(body);
      } catch (parseError) {
        console.error("DEBUG: JSON parse failed:", parseError);

        return res.status(400).json({
          error:
            "DEBUG: تعذر تحويل البيانات إلى JSON. البيانات المستلمة: " +
            body,
        });
      }
    }

    console.log("DEBUG: processed body:", body);

    // استخراج السؤال
    const message =
      body &&
      typeof body.message === "string"
        ? body.message.trim()
        : "";

    // استخراج محتوى الموقع
    const siteContent =
      body &&
      typeof body.siteContent === "string"
        ? body.siteContent
        : "";

    console.log("DEBUG: message:", message);
    console.log("DEBUG: message type:", typeof message);

    // التأكد من وجود السؤال
    if (!message) {
      console.error("DEBUG: message is missing or empty");
      console.error("DEBUG: received body:", body);

      return res.status(400).json({
        error:
          "DEBUG: لم يتم العثور على message أو أنها فارغة. نوع البيانات: " +
          typeof body +
          " | البيانات المستلمة: " +
          JSON.stringify(body),
      });
    }

    // التأكد من وجود مفتاح OpenAI
    if (!process.env.OPENAI_API_KEY) {
      console.error("DEBUG: OPENAI_API_KEY is missing");

      return res.status(500).json({
        error:
          "DEBUG: مفتاح OPENAI_API_KEY غير موجود في إعدادات Vercel.",
      });
    }

    console.log("DEBUG: OPENAI_API_KEY exists");
    console.log("DEBUG: Sending request to OpenAI...");
    console.log("DEBUG: User question:", message);

    // الاتصال بـ OpenAI
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
- تحقق من العمليات الحسابية قبل تقديم الإجابة.
- كن واضحًا ومشجعًا وتفاعليًا.
- استخدم أسلوبًا تعليميًا مناسبًا للطلاب.
- إذا كان السؤال بسيطًا، أجب بإيجاز ووضوح.
- إذا طلب المستخدم شرحًا، قدم شرحًا تفصيليًا خطوة بخطوة.
- استخدم محتوى الموقع إذا كان مرتبطًا بسؤال المستخدم.
- لا تدّعِ وجود محتوى في الموقع إذا لم يكن موجودًا.

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

    console.log("DEBUG: OpenAI response received successfully");

    const reply =
      response.output_text ||
      "عذرًا، لم يتم استلام رد من المساعد.";

    return res.status(200).json({
      reply: reply,
    });

  } catch (error) {
    console.error("=== ASSISTANT ERROR ===");
    console.error(error);

    return res.status(500).json({
      error:
        "DEBUG: " +
        (
          error?.message ||
          "حدث خطأ غير معروف أثناء الاتصال بالمساعد الذكي."
        ),
    });
  }
}
