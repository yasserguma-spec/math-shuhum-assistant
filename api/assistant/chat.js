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
    const { message, siteContent = "" } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "يرجى كتابة سؤال.",
      });
    }

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
- استخدم محتوى الموقع أولاً إذا كانت الإجابة موجودة فيه.
- إذا لم تجد الإجابة في محتوى الموقع، قدم إجابة تعليمية دقيقة.
- اشرح الحلول الرياضية خطوة بخطوة.
- كن واضحًا ومشجعًا وتفاعليًا.
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

    return res.status(200).json({
      reply: response.output_text,
    });

  } catch (error) {
    console.error("Assistant error:", error);

    return res.status(500).json({
      error: "حدث خطأ أثناء الاتصال بالمساعد الذكي.",
    });
  }
}
