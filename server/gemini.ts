import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";

const MODEL_FAST = "gemini-4-hydrogen";
const MODEL_DEEP = "gemini-4-carbon";

export function getAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error(
      "GEMINI_API_KEY is missing. Please add your Gemini API key in Settings > Secrets."
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        msg.includes("503") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("500") ||
        msg.toLowerCase().includes("high demand");
      if (!isTransient || attempt === maxAttempts) {
        throw err;
      }
      const delayMs = 1000 * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

function handleAIError(err: unknown): never {
  const message = err instanceof Error ? err.message : "AI request failed";
  if (message.includes("403") || message.includes("PERMISSION_DENIED") || message.includes("API_KEY_INVALID")) {
    throw new Error(
      "Gemini API key error (403/400). Please verify your selected API key in Settings > Secrets."
    );
  }
  if (message.includes("429") || message.includes("RESOURCE_EXHAUSTED") || message.toLowerCase().includes("quota")) {
    throw new Error(
      "Gemini API rate or quota limit reached (429). Please wait briefly or verify billing/quota in Settings > Secrets."
    );
  }
  if (message.includes("503") || message.includes("UNAVAILABLE") || message.toLowerCase().includes("high demand")) {
    throw new Error(
      "The Gemini model is temporarily experiencing high demand (503). Please try again in a few seconds."
    );
  }
  if (message.includes("404") || message.includes("NOT_FOUND")) {
    throw new Error(`Gemini model not available: ${message}`);
  }
  throw new Error(`AI Error: ${message}`);
}

export interface StructuredExplanation {
  detectedLanguage: string;
  chatTitle: string;
  simpleDefinition: string;
  easyExplanation: string;
  detailedSteps: string[];
  realLifeExamples: string[];
  applications: string[];
  advantages: string[];
  disadvantages: string[];
  importantPoints: string[];
  summary: string;
  keyTerms: { term: string; meaning: string }[];
  examQuestions: { question: string; answerHint: string }[];
  revisionNotes: string[];
  relatedTopics: string[];
}

export async function generateLearningExplanation(params: {
  prompt: string;
  language: string;
  mode: string;
  deepThinking?: boolean;
  history: { role: string; content: string }[];
  documentContext?: string;
  followUpAction?: string;
}): Promise<{ structured: StructuredExplanation; modelUsed: string }> {
  const ai = getAIClient();

  const useDeepThinking =
    Boolean(params.deepThinking) ||
    params.mode === "Advanced" ||
    params.mode === "Exam Preparation" ||
    Boolean(params.documentContext);

  const model = useDeepThinking ? MODEL_DEEP : MODEL_FAST;
  const thinkingLevel = useDeepThinking ? ThinkingLevel.HIGH : ThinkingLevel.MEDIUM;

  const langInstruction =
    params.language === "Auto-Detect"
      ? "Automatically detect the language of the student's question (supports English, Tamil, Tanglish, Hindi, Telugu, Malayalam, Kannada, Bengali, Marathi, French, Spanish, German, Arabic, Chinese, Japanese). If the user uses Tamil words written in English letters, reply in clear, natural Tanglish. Otherwise reply completely in the detected language."
      : `Write the entire explanation, examples, key terms, exam questions, and notes strictly in ${params.language}. (If Tanglish, write natural Tamil+English mixed explanations using English script.)`;

  const historyText = params.history
    .slice(-6)
    .map((h) => `${h.role.toUpperCase()}: ${h.content.slice(0, 700)}`)
    .join("\n");

  const systemInstruction = `You are LearnMate AI, a patient, crystal-clear multilingual tutor for students.
Learning Mode: ${params.mode}
${langInstruction}
${params.followUpAction ? `Follow-up Action Requested: ${params.followUpAction}` : ""}
${params.documentContext ? `Reference Study Document Content:\n${params.documentContext.slice(0, 20000)}` : ""}

Return strictly valid JSON matching the schema. Make every section rich, student-friendly, accurate, and tailored to the ${params.mode} level.`;

  try {
    const response = await withRetry(() =>
      ai.models.generateContent({
        model,
        contents: `Conversation History:\n${historyText || "None"}\n\nStudent Question/Topic:\n${params.prompt}`,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel },
          responseMimeType: "application/json",
          responseSchema: {
          type: Type.OBJECT,
          properties: {
            detectedLanguage: { type: Type.STRING },
            chatTitle: { type: Type.STRING },
            simpleDefinition: { type: Type.STRING },
            easyExplanation: { type: Type.STRING },
            detailedSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
            realLifeExamples: { type: Type.ARRAY, items: { type: Type.STRING } },
            applications: { type: Type.ARRAY, items: { type: Type.STRING } },
            advantages: { type: Type.ARRAY, items: { type: Type.STRING } },
            disadvantages: { type: Type.ARRAY, items: { type: Type.STRING } },
            importantPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
            summary: { type: Type.STRING },
            keyTerms: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  term: { type: Type.STRING },
                  meaning: { type: Type.STRING },
                },
              },
            },
            examQuestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  answerHint: { type: Type.STRING },
                },
              },
            },
            revisionNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
            relatedTopics: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
        },
        },
      })
    );

    const structured = JSON.parse((response.text ?? "{}").trim()) as StructuredExplanation;
    return { structured, modelUsed: model };
  } catch (err) {
    handleAIError(err);
  }
}

export interface DocumentStudyPack {
  summary: string;
  chapters: { title: string; explanation: string }[];
  importantQuestions: { question: string; answer: string }[];
  shortNotes: string;
  detailedNotes: string;
  mcqs: { question: string; options: string[]; answer: string; explanation: string }[];
  revisionPoints: string[];
}

export async function generateDocumentStudyPack(params: {
  fileName: string;
  text: string;
  language: string;
}): Promise<DocumentStudyPack> {
  const ai = getAIClient();
  const langRule =
    params.language === "Auto-Detect"
      ? "Detect the primary language of the document and write all study materials in that language."
      : `Write all summaries, chapters, notes, questions, and MCQs in ${params.language}.`;

  try {
    const response = await withRetry(() =>
      ai.models.generateContent({
        model: MODEL_DEEP,
        contents: `Analyze this uploaded study document (${params.fileName}):\n\n${params.text.slice(0, 32000)}`,
        config: {
          systemInstruction: `You are LearnMate AI Document Study Assistant. ${langRule} Extract thorough, accurate study materials directly grounded in the document.`,
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          responseMimeType: "application/json",
          responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            chapters: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                },
              },
            },
            importantQuestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  answer: { type: Type.STRING },
                },
              },
            },
            shortNotes: { type: Type.STRING },
            detailedNotes: { type: Type.STRING },
            mcqs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  answer: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                },
              },
            },
            revisionPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
        },
        },
      })
    );
    return JSON.parse((response.text ?? "{}").trim()) as DocumentStudyPack;
  } catch (err) {
    handleAIError(err);
  }
}

export interface QuizQuestion {
  id: string;
  type: "MCQ" | "True or False" | "Fill in the Blanks" | "Short Answer" | "Match the Following";
  topicTag: string;
  question: string;
  options?: string[];
  leftItems?: string[];
  rightItems?: string[];
  correctAnswer: string | { left: string; right: string }[] | Record<string, string>;
  explanation: string;
}

export async function generateQuizQuestions(params: {
  topic: string;
  count: number;
  difficulty: string;
  language: string;
  questionTypes: string[];
  documentText?: string;
}): Promise<{ title: string; questions: QuizQuestion[] }> {
  const ai = getAIClient();
  const safeCount = Math.min(Math.max(params.count, 1), 50);
  const useDeep = params.difficulty === "Hard" || safeCount >= 20 || Boolean(params.documentText);
  const model = useDeep ? MODEL_DEEP : MODEL_FAST;
  const thinkingLevel = useDeep ? ThinkingLevel.HIGH : ThinkingLevel.MEDIUM;

  try {
    const response = await withRetry(() =>
      ai.models.generateContent({
        model,
        contents: `Create a ${params.difficulty} difficulty quiz on "${params.topic}" with exactly ${safeCount} questions.
Allowed question types (distribute across these): ${params.questionTypes.join(", ")}.
${params.documentText ? `Base the quiz strictly on this document:\n${params.documentText.slice(0, 24000)}` : ""}`,
        config: {
        systemInstruction: `You are LearnMate AI Quiz Generator. Write all questions, options, answers, and explanations in ${params.language === "Auto-Detect" ? "English" : params.language}.
For MCQ: provide 4 options and correctAnswer must exactly equal one option.
For True or False: options must be ["True", "False"] (or localized equivalent) and correctAnswer must equal one of them.
For Fill in the Blanks: include ___ in question and concise string in correctAnswer.
For Short Answer: concise expected answer in correctAnswer.
For Match the Following: provide leftItems (3-4 items), rightItems (shuffled 3-4 items), and matchPairs array of {left, right}.`,
        thinkingConfig: { thinkingLevel },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  type: { type: Type.STRING },
                  topicTag: { type: Type.STRING },
                  question: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  leftItems: { type: Type.ARRAY, items: { type: Type.STRING } },
                  rightItems: { type: Type.ARRAY, items: { type: Type.STRING } },
                  matchPairs: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        left: { type: Type.STRING },
                        right: { type: Type.STRING },
                      },
                    },
                  },
                  correctAnswer: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                },
              },
            },
          },
        },
        },
      })
    );

    const parsed = JSON.parse((response.text ?? "{}").trim()) as {
      title: string;
      questions: (QuizQuestion & { matchPairs?: { left: string; right: string }[] })[];
    };

    const normalizedQuestions: QuizQuestion[] = (parsed.questions || []).map((q, idx) => {
      if (q.type === "Match the Following" && Array.isArray(q.matchPairs) && q.matchPairs.length > 0) {
        const map: Record<string, string> = {};
        for (const pair of q.matchPairs) {
          map[pair.left] = pair.right;
        }
        return {
          id: q.id || `q${idx + 1}`,
          type: q.type,
          topicTag: q.topicTag || params.topic,
          question: q.question,
          leftItems: q.leftItems,
          rightItems: q.rightItems,
          correctAnswer: map,
          explanation: q.explanation,
        };
      }
      return {
        id: q.id || `q${idx + 1}`,
        type: q.type,
        topicTag: q.topicTag || params.topic,
        question: q.question,
        options: q.options,
        leftItems: q.leftItems,
        rightItems: q.rightItems,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
      };
    });

    return {
      title: parsed.title || `${params.topic} Quiz`,
      questions: normalizedQuestions,
    };
  } catch (err) {
    handleAIError(err);
  }
}

export async function evaluateShortAnswersAndFeedback(params: {
  topic: string;
  language: string;
  shortAnswers: { id: string; question: string; expected: string; userAnswer: string }[];
  wrongTopics: string[];
  percentage: number;
}): Promise<{
  shortResults: { id: string; isCorrect: boolean }[];
  improvementSuggestions: string[];
}> {
  const ai = getAIClient();
  try {
    const response = await withRetry(() =>
      ai.models.generateContent({
        model: MODEL_DEEP,
        contents: JSON.stringify(params),
        config: {
          systemInstruction: `Evaluate each student short answer generously for conceptual correctness (true/false), and give 3 actionable, personalized study improvement suggestions in ${params.language === "Auto-Detect" ? "English" : params.language}.`,
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
          responseMimeType: "application/json",
          responseSchema: {
          type: Type.OBJECT,
          properties: {
            shortResults: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  isCorrect: { type: Type.BOOLEAN },
                },
              },
            },
            improvementSuggestions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
        },
        },
      })
    );
    return JSON.parse((response.text ?? "{}").trim());
  } catch (err) {
    handleAIError(err);
  }
}

export async function generateOrEditStudyImage(params: {
  prompt: string;
  aspectRatio?: string;
  imageSize?: string;
  useGoogleSearch?: boolean;
  sourceImageBase64?: string;
  sourceImageMimeType?: string;
}): Promise<{
  imageBase64: string;
  mimeType: string;
  caption: string;
}> {
  const ai = getAIClient();
  const parts: Array<
    | { text: string }
    | { inlineData: { data: string; mimeType: string } }
  > = [];

  if (params.sourceImageBase64 && params.sourceImageMimeType) {
    parts.push({
      inlineData: {
        data: params.sourceImageBase64,
        mimeType: params.sourceImageMimeType,
      },
    });
  }
  parts.push({ text: params.prompt });

  const config: Record<string, unknown> = {
    imageConfig: {
      aspectRatio: params.aspectRatio || "1:1",
      imageSize: params.imageSize || "1K",
    },
  };

  if (params.useGoogleSearch) {
    config.tools = [
      {
        googleSearch: {
          searchTypes: {
            webSearch: {},
            imageSearch: {},
          },
        },
      },
    ];
  }

  try {
    const response = await withRetry(() =>
      ai.models.generateContent({
        model: "gemini-nano-banana-2.1",
        contents: { parts },
        config: config as any,
      })
    );

    let imageBase64 = "";
    let mimeType = "image/png";
    const textParts: string[] = [];

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data && !imageBase64) {
        imageBase64 = part.inlineData.data;
        mimeType = part.inlineData.mimeType ?? "image/png";
      } else if (part.text) {
        textParts.push(part.text);
      }
    }

    if (!imageBase64) {
      throw new Error(
        textParts.join(" ").trim() || "The model did not return an image. Please adjust your prompt."
      );
    }

    return {
      imageBase64,
      mimeType,
      caption: textParts.join("\n").trim(),
    };
  } catch (err) {
    handleAIError(err);
  }
}

export async function generateStudyVideo(params: {
  prompt: string;
  aspectRatio: "16:9" | "9:16";
  duration?: string;
  resolution?: "360p" | "720p" | "1080p";
  previousInteractionId?: string;
  referenceImageBase64?: string;
  referenceImageMimeType?: string;
}): Promise<{
  videoBuffer: Buffer;
  mimeType: string;
  interactionId: string;
}> {
  const ai = getAIClient();

  const inputPayload: any =
    params.referenceImageBase64 && params.referenceImageMimeType
      ? [
          {
            type: "image",
            mime_type: params.referenceImageMimeType,
            data: params.referenceImageBase64,
          },
          {
            type: "text",
            text: params.prompt,
          },
        ]
      : params.prompt;

  try {
    const interaction: any = await ai.interactions.create(
      {
        model: "gemini-omni-1.2-flash",
        input: inputPayload,
        ...(params.previousInteractionId
          ? { previous_interaction_id: params.previousInteractionId }
          : {}),
        background: false,
        store: true,
        stream: false,
        response_format: {
          type: "video",
          aspect_ratio: params.aspectRatio,
          duration: params.duration || "8s",
          resolution: params.resolution || "720p",
        },
      } as any,
      { timeout: 300000 }
    );

    const videoPart =
      interaction.output_video ||
      (() => {
        for (const step of interaction.steps || []) {
          if (step.type === "model_output") {
            const found = step.content?.find((c: any) => c.type === "video");
            if (found) return found;
          }
        }
        return null;
      })();

    if (videoPart?.data) {
      return {
        videoBuffer: Buffer.from(videoPart.data, "base64"),
        mimeType: videoPart.mime_type || "video/mp4",
        interactionId: interaction.id || "",
      };
    }

    if (videoPart?.uri) {
      const apiKey = process.env.GEMINI_API_KEY || "";
      const sep = videoPart.uri.includes("?") ? "&" : "?";
      const res = await fetch(`${videoPart.uri}${sep}key=${encodeURIComponent(apiKey)}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch generated video (${res.status}).`);
      }
      const arrBuf = await res.arrayBuffer();
      return {
        videoBuffer: Buffer.from(arrBuf),
        mimeType: videoPart.mime_type || "video/mp4",
        interactionId: interaction.id || "",
      };
    }

    throw new Error("Video generation completed without returning video data.");
  } catch (err) {
    handleAIError(err);
  }
}

