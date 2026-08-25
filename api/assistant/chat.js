export default async function handler(req, res) {
  // السماح بطلبات POST فقط
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    // استقبال البيانات
    let body = req.body;

    // إذا وصلت البيانات كنص نحولها إلى JSON
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (parseError) {
        return res.status(400).json({
          error: "تعذر قراءة بيانات السؤال المرسلة إلى الخادم.",
        });
      }
    }

    // التأكد من وجود البيانات
    body = body || {};

    // استقبال السؤال من message أو query
    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : typeof body.query === "string"
        ? body.query.trim()
        : "";

    // استقبال محتوى الموقع إن وجد
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
      });
    }

    // التحقق من وجود مفتاح Gemini
    if (!process.env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is missing");

      return res.status(500).json({
        error:
          "مفتاح GEMINI_API_KEY غير موجود في إعدادات Vercel.",
      });
    }

    // التعليمات الأساسية للمساعد
    const systemInstruction = `
أنت مساعد رياضيات ذكي تابع لموقع "رياضيات بلاد الشحوم".

مهمتك هي مساعدة الطلاب والمعلمين في مادة الرياضيات.

التعليمات:

- أجب دائمًا باللغة العربية.
- اشرح المسائل الرياضية خطوة بخطوة.
- لا تعطِ الإجابة النهائية فقط.
- اشرح طريقة التفكير والحل بصورة تعليمية واضحة.
- استخدم لغة مناسبة للطلاب.
- كن دقيقًا في العمليات الحسابية.
- عند وجود معادلة، اكتب خطوات الحل بشكل منظم.
- عند وجود خطأ في السؤال أو غموض، اطلب توضيحًا بطريقة لطيفة.
- شجع الطالب على التعلم والفهم.
- يمكنك استخدام الرموز الرياضية بشكل واضح.
- إذا كان السؤال بسيطًا، اجعل الإجابة مختصرة وواضحة.
- إذا كان السؤال يحتاج شرحًا، قدم شرحًا تفصيليًا خطوة بخطوة.
- لا تدّعِ وجود معلومات في الموقع إذا لم تكن موجودة.

محتوى إضافي من الموقع:

${siteContent || "لا يوجد محتوى إضافي للموقع حاليًا."}
`;

    // إعداد محتوى الطلب إلى Gemini
    const requestBody = {
      system_instruction: {
        parts: [
          {
            text: systemInstruction,
          },
        ],
      },

      contents: [
        {
          role: "user",
          parts: [
            {
              text: message,
            },
          ],
        },
      ],

      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 2048,
      },
    };

    // الاتصال بـ Gemini
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify(requestBody),
      }
    );

    // قراءة الاستجابة
    let data;

    try {
      data = await response.json();
    } catch (jsonError) {
      console.error("Gemini JSON error:", jsonError);

      return res.status(500).json({
        error: "تعذر قراءة استجابة Gemini.",
      });
    }

    // معالجة أخطاء Gemini
    if (!response.ok) {
      console.error(
        "Gemini API error:",
        JSON.stringify(data, null, 2)
      );

      const errorMessage =
        data?.error?.message ||
        "حدث خطأ أثناء الاتصال بخدمة Gemini.";

      return res.status(response.status).json({
        error: errorMessage,
      });
    }

    // استخراج الإجابة من Gemini
    const reply =
      data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("")
        .trim() ||
      "لم يتمكن المساعد من إنشاء إجابة.";

    // إرسال الإجابة إلى الموقع
    return res.status(200).json({
      success: true,
      reply: reply,
    });

  } catch (error) {
    console.error("Assistant error:", error);

    return res.status(500).json({
      error: "حدث خطأ أثناء الاتصال بالمساعد الذكي.",
      details: error?.message || "خطأ غير معروف.",
    });
  }
}
