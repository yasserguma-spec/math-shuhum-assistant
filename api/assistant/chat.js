import OpenAI from "openai";

export default async function handler(req, res) {
  // السماح بطلبات POST فقط
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "الطريقة غير مسموح بها. استخدم POST.",
    });
  }

  // التأكد من وجود مفتاح OpenAI في Vercel
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is missing");

    return res.status(500).json({
      error: "مفتاح OPENAI_API_KEY غير موجود في إعدادات المشروع.",
    });
  }

  try {
    // استقبال البيانات القادمة من index.html
    const { message, siteContent = "" } = req.body || {};

    // التحقق من وجود السؤال
    if (!message || !String(message).trim()) {
      return res.status(400).json({
        error: "يرجى كتابة سؤال.",
      });
    }

    // إنشاء عميل OpenAI داخل الطلب
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // إرسال الطلب إلى OpenAI
    const response = await client.responses.create({
      model: "gpt-5.6",

      input: [
        {
          role: "system",
          content: `
أنت مساعد رياضيات ذكي تابع لموقع "رياضيات بلاد الشحوم".

تعليماتك الأساسية:
- أجب باللغة العربية دائمًا، إلا إذا طلب المستخدم لغة أخرى.
- ساعد الطلاب والمعلمين في جميع موضوعات الرياضيات.
- اشرح الحلول الرياضية خطوة بخطوة.
- اكتب العمليات والمعادلات بصورة واضحة ومنظمة.
- تحقق من صحة الحسابات قبل تقديم الإجابة.
- كن واضحًا ومشجعًا وتفاعليًا.
- إذا كان السؤال غامضًا، اطلب توضيحًا مناسبًا.
- استخدم محتوى الموقع أولًا إذا كانت الإجابة موجودة فيه.
- إذا لم تجد الإجابة في محتوى الموقع، قدم إجابة تعليمية دقيقة.
- لا تدّعِ وجود محتوى في الموقع إذا لم يكن موجودًا.
- لا تكتفِ بإعطاء الناتج النهائي في المسائل التعليمية، بل وضح طريقة الحل.
- استخدم أمثلة مبسطة عند الحاجة.

محتوى الموقع المتاح:
${siteContent || "لا يوجد محتوى إضافي متاح حاليًا."}
          `,
        },
        {
          role: "user",
          content: String(message).trim(),
        },
      ],
    });

    // استخراج إجابة المساعد
    const answer =
      response.output_text ||
      "لم يتم استلام إجابة من المساعد.";

    // إرسال الإجابة إلى index.html
    return res.status(200).json({
      reply: answer,
    });

  } catch (error) {
    // تسجيل الخطأ الكامل في Vercel Logs
    console.error("Assistant error:", {
      name: error?.name,
      message: error?.message,
      status: error?.status,
      code: error?.code,
    });

    // معالجة خطأ المصادقة
    if (error?.status === 401) {
      return res.status(500).json({
        error:
          "تعذر الاتصال بخدمة الذكاء الاصطناعي بسبب مشكلة في مفتاح OPENAI_API_KEY.",
      });
    }

    // معالجة مشكلة الصلاحية أو الوصول
    if (error?.status === 403) {
      return res.status(500).json({
        error:
          "مفتاح OpenAI لا يملك الصلاحية المطلوبة لاستخدام هذه الخدمة.",
      });
    }

    // معالجة مشكلة النموذج
    if (error?.status === 404) {
      return res.status(500).json({
        error:
          "تعذر العثور على نموذج الذكاء الاصطناعي المطلوب.",
      });
    }

    // معالجة تجاوز الحد
    if (error?.status === 429) {
      return res.status(500).json({
        error:
          "تم تجاوز الحد المسموح مؤقتًا. يرجى المحاولة بعد قليل.",
      });
    }

    // خطأ عام
    return res.status(500).json({
      error:
        error?.message ||
        "حدث خطأ أثناء الاتصال بالمساعد الذكي.",
    });
  }
}

    return res.status(500).json({
      error: "حدث خطأ أثناء الاتصال بالمساعد الذكي.",
    });
  }
}
