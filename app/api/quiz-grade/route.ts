/**
 * Quiz Grading API
 *
 * POST: Receives a text question + user answer, calls LLM for scoring and feedback.
 * Used for short-answer (text) questions that cannot be graded locally.
 */
import { modelAuthorizationResponse } from '@/lib/server/api-response';

import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { withGenerationSystemPrompt } from '@/lib/ground-school/generation-system-prompt';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
const log = createLogger('Quiz Grade');

interface GradeRequest {
  question: string;
  userAnswer: string;
  points: number;
  commentPrompt?: string;
  language?: string;
}

interface GradeResponse {
  score: number;
  comment: string;
}

export async function POST(req: NextRequest) {
  let questionSnippet: string | undefined;
  let resolvedPoints: number | undefined;
  try {
    const body = (await req.json()) as GradeRequest;
    const { question, userAnswer, points, commentPrompt, language } = body;
    questionSnippet = question?.substring(0, 60);
    resolvedPoints = points;

    if (!question || !userAnswer) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'question and userAnswer are required');
    }

    // Validate points is a positive finite number
    if (!points || !Number.isFinite(points) || points <= 0) {
      return apiError('INVALID_REQUEST', 400, 'points must be a positive number');
    }

    // Resolve model from request headers/body
    const {
      model: languageModel,
      thinkingConfig,
      serverManaged,
    } = await resolveModelFromRequest(req, body, 'quiz-grade');

    const isZh = language === 'zh-CN';

    // Domain brief (§9): RSAF Commands quiz is an actual assessment; explain,
    // do not just mark.
    const systemPrompt = withGenerationSystemPrompt(
      isZh
        ? `你是一位专业的教育评估专家，正在为正式测验题目评分并给出反馈。
说明为什么正确选项正确，以及所选干扰项为何有吸引力；错误是信息，不是失败。
必须以如下 JSON 格式回复（不要包含其他内容）：
{"score": <0到${points}的整数>, "comment": "<一两句说明对错原因的评语>"}`
        : `You are a professional educational assessor grading a quiz assessment item.
Explain why the correct answer is correct, and why a chosen distractor was attractive. An error is information, not a failure — no praise inflation, no admonishment.
You must reply in the following JSON format only (no other content):
{"score": <integer from 0 to ${points}>, "comment": "<one or two sentences naming what was wrong or right and why>"}`,
    );

    const userPrompt = isZh
      ? `题目：${question}
满分：${points}分
${commentPrompt ? `评分要点：${commentPrompt}\n` : ''}学生答案：${userAnswer}`
      : `Question: ${question}
Full marks: ${points} points
${commentPrompt ? `Grading guidance: ${commentPrompt}\n` : ''}Student answer: ${userAnswer}`;

    const result = await callLLM(
      {
        model: languageModel,
        system: systemPrompt,
        prompt: userPrompt,
      },
      'quiz-grade',
      undefined,
      thinkingConfig,
      { serverManaged },
    );

    // Parse the LLM response as JSON
    const text = result.text.trim();
    let gradeResult: GradeResponse;

    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      const parsed = JSON.parse(jsonMatch[0]);
      gradeResult = {
        score: Math.max(0, Math.min(points, Math.round(Number(parsed.score)))),
        comment: String(parsed.comment || ''),
      };
    } catch {
      // Fallback: give partial credit with a generic comment
      gradeResult = {
        score: Math.round(points * 0.5),
        comment: isZh
          ? '已作答，请参考标准答案。'
          : 'Answer received. Please refer to the standard answer.',
      };
    }

    return apiSuccess({ ...gradeResult });
  } catch (error) {
    const authorization = modelAuthorizationResponse(error);
    if (authorization) return authorization;
    log.error(
      `Quiz grading failed [question="${questionSnippet ?? 'unknown'}...", points=${resolvedPoints ?? 'unknown'}]:`,
      error,
    );
    return apiError('INTERNAL_ERROR', 500, 'Failed to grade answer');
  }
}
