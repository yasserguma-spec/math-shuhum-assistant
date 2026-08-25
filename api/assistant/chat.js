export default async function handler(req, res) {
  // السماح بطلبات POST فقط
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    let body = req.body;

    // إذا وصل الطلب كنص نحوله إلى JSON
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (error) {
        return res.status(400).json({
          error: "تعذر قراءة بيانات السؤال المرسلة إلى الخادم.",
        });
      }
    }

    // ضمان وجود بيانات
    body = body || {};

    // استقبال السؤال سواء باسم query أو message
    const message =
      typeof body.query === "string"
        ? body.query.trim()
        : typeof body.message === "string"
        ? body.message.trim()
        : "";

    // التحقق من وجود السؤال
    if (!message) {
      return res.status(400).json({
        error: "لم يتم استلام السؤال. يرجى كتابة سؤال في الرياضيات.",
      });
    }

    // التحقق من مفتاح Gemini
    if (!process.env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is missing");

      return res.status(500).json({
        error: "مفتاح GEMINI_API_KEY غير موجود في إعدادات Vercel.",
      });
    }

    // محتوى الموقع - اختياري
    let siteContent = "";

    if (typeof body.siteContent === "string") {
      siteContent = body.siteContent;
    } else if (Array.isArray(body.siteContext)) {
      siteContent = body.siteContext.join("\n");
    }

    // التعليمات الخاصة بالمساعد
    const systemPrompt = `
أنت مساعد رياضيات ذكي تابع لموقع "مساعد شحوم للرياضيات".

مهمتك هي مساعدة الطلاب والمعلمين في فهم وحل مسائل الرياضيات.

اتبع التعليمات التالية بدقة:

1. أجب باللغة العربية دائمًا.
2. اشرح الحل خطوة بخطوة بطريقة تعليمية واضحة.
3. اكتب العمليات الرياضية بشكل بسيط وواضح.
4. استخدم الرموز الرياضية المباشرة مثل:
   × للقسمة؟ لا، استخدم × للضرب.
   ÷ للقسمة.
   + للجمع.
   − أو - للطرح.
   = للمساواة.
5. لا تستخدم لغة Markdown.
6. لا تستخدم النجمتين ** للنص العريض.
7. لا تستخدم الرموز البرمجية مثل \`\`\`.
8. لا تستخدم LaTeX.
9. لا تستخدم الرموز $ أو \\ أو الأقواس الخاصة بـ LaTeX.
10. لا تكتب كلمة "times" باللغة الإنجليزية، بل استخدم رمز الضرب ×.
11. عند حل مسألة، استخدم هذا الشكل:

الخطوة الأولى:
...

الخطوة الثانية:
...

الخطوة الثالثة:
...

الإجابة النهائية:
...

12. كن مشجعًا وواضحًا ومناسبًا للطلاب.
13. إذا كان السؤال غير واضح، اطلب من الطالب كتابة السؤال بصورة أوضح.
14. تحقق من الحسابات قبل إرسال الإجابة.

مثال صحيح للتنسيق:

السؤال:
25 × 4

الخطوة الأولى:
نضرب العدد 25 في العدد 4.

25 × 4 = 100

الإجابة النهائية:
100

محتوى إضافي من الموقع:
${siteContent || "لا يوجد محتوى إضافي حاليًا."}
`;

    // تجهيز الطلب لـ Gemini
    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${systemPrompt}

سؤال الطالب:
${message}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 1500,
      },
    };

    // الاتصال بـ Gemini
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=" +
        encodeURIComponent(process.env.GEMINI_API_KEY),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );

    // قراءة الاستجابة
    const data = await response.json();

    // في حالة حدوث خطأ من Gemini
    if (!response.ok) {
      console.error("Gemini API error:", data);

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "حدث خطأ أثناء الاتصال بمساعد Gemini.",
      });
    }

    // استخراج الإجابة
    const reply =
      data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("")
        .trim() ||
      "لم يتمكن المساعد من إنشاء إجابة.";

    // إعادة الإجابة للموقع
    return res.status(200).json({
      success: true,
      reply: reply,
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
