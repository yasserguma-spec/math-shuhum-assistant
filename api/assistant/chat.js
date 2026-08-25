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
      });
    }

    // التحقق من وجود مفتاح Gemini
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing");

      return res.status(500).json({
        error: "مفتاح GEMINI_API_KEY غير موجود في إعدادات Vercel.",
      });
    }

    // إعداد التعليمات الأساسية للمساعد
    const systemPrompt = `
أنت مساعد رياضيات ذكي تابع لموقع "رياضيات بلاد الشحوم".

التعليمات:
- أجب باللغة العربية.
- ساعد الطلاب والمعلمين في مادة الرياضيات.
- اشرح الحلول الرياضية خطوة بخطوة.
- كن واضحًا ودقيقًا ومشجعًا.
- استخدم محتوى الموقع إذا كان يحتوي على معلومات مرتبطة بالسؤال.
- إذا لم تجد الإجابة في محتوى الموقع، قدم إجابة تعليمية دقيقة.
- لا تدّعِ وجود معلومات في الموقع إذا لم تكن موجودة.
- اكتب الإجابة النهائية بشكل واضح.
- استخدم الرموز والمعادلات الرياضية بصورة منظمة.

محتوى الموقع:
${siteContent || "لا يوجد محتوى إضافي للموقع حاليًا."}
    `;

    // إعداد سجل المحادثة إن وجد
    const history = Array.isArray(body.history)
      ? body.history.slice(-10)
      : [];

    const contents = [];

    // إضافة سجل المحادثة بصيغة Gemini
    history.forEach((item) => {
      if (
        item &&
        typeof item.text === "string" &&
        item.text.trim()
      ) {
        contents.push({
          role: item.role === "assistant" ? "model" : "user",
          parts: [
            {
              text: item.text.trim(),
            },
          ],
        });
      }
    });

    // إضافة السؤال الحالي إذا لم يكن موجودًا في نهاية السجل
    const lastMessage = contents[contents.length - 1];

    if (
      !lastMessage ||
      lastMessage.role !== "user" ||
      lastMessage.parts?.[0]?.text !== message
    ) {
      contents.push({
        role: "user",
        parts: [
          {
            text: message,
          },
        ],
      });
    }

    // إرسال السؤال إلى Gemini
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },

        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: systemPrompt,
              },
            ],
          },

          contents: contents,

          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1500,
          },
        }),
      }
    );

    // قراءة استجابة Gemini
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
      console.error("Gemini API error:", data);

      const errorMessage =
        data?.error?.message ||
        "حدث خطأ أثناء الاتصال بـ Gemini.";

      return res.status(response.status).json({
        error: errorMessage,
      });
    }

    // استخراج الإجابة
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

      // للتوافق مع أي نسخة أخرى من الواجهة
      answer: reply,
    });

  } catch (error) {
    console.error("Assistant error:", error);

    return res.status(500).json({
      error: "حدث خطأ أثناء الاتصال بالمساعد الذكي.",
      details: error?.message || "خطأ غير معروف.",
    });
  }
}
