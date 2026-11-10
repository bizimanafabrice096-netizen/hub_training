import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

export interface CoachMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamCoachParams {
  courseTitle: string;
  lessonTitle: string;
  lessonContent: string;
  studentPrompt: string;
  history?: CoachMessage[];
  onChunk: (markdownChunk: string) => void;
}

export async function streamAiCoachResponse({
  courseTitle,
  lessonTitle,
  lessonContent,
  studentPrompt,
  history = [],
  onChunk,
}: StreamCoachParams): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const systemInstruction = [
    'You are an academic tutor and engineering coach inside Meridian Academy.',
    `Course: ${courseTitle}`,
    `Current Lesson: ${lessonTitle}`,
    'Lesson Context:',
    lessonContent.slice(0, 8000),
    '',
    'Response rules:',
    '- Answer directly using the lesson context and rigorous first-principles reasoning.',
    '- Format responses in clean structured Markdown (concise headings, bullet points, formulas or code snippets when relevant, and a short check-for-understanding question at the end).',
    '- Keep responses focused, accurate, and practical for a university-level learner.',
  ].join('\n');

  const recentHistory = history
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'Student' : 'Coach'}: ${m.content}`)
    .join('\n\n');

  const composedPrompt = recentHistory
    ? `Recent conversation:\n${recentHistory}\n\nStudent question:\n${studentPrompt}`
    : studentPrompt;

  const responseStream = await ai.models.generateContentStream({
    model: 'gemini-3.8-flash',
    contents: composedPrompt,
    config: {
      systemInstruction,
    },
  });

  let fullText = '';
  for await (const chunk of responseStream) {
    const text = chunk.text ?? '';
    if (text) {
      fullText += text;
      onChunk(text);
    }
  }

  return fullText;
}
