/**
 * GET /api/admin/question-bank — list question bank items for admin review.
 * PATCH /api/admin/question-bank — update Bloom's level for a question.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { isServerPersistenceConfigured } from '@/lib/config/feature-flags';
import {
  BLOOMS_LEVELS,
  type BloomsLevel,
  loadQuestionBank,
  type QuestionBankItem,
  saveQuestionBank,
} from '@/lib/ground-school/question-bank';
import { adminForbiddenResponse, isAdminPrincipal } from '@/lib/server/identity/require-admin';
import { withRequestOwner } from '@/lib/server/identity/with-owner';

export const runtime = 'nodejs';

export interface QuestionBankListResponse {
  questions: QuestionBankItem[];
  total: number;
  bloomsStats: {
    remember: number;
    understand: number;
    apply: number;
    analyze: number;
    evaluate: number;
    create: number;
    unclassified: number;
  };
}

export async function GET(req: NextRequest) {
  if (!isServerPersistenceConfigured()) return new Response('Not found', { status: 404 });

  return withRequestOwner(req, async (principal, responseHeaders) => {
    if (!isAdminPrincipal(principal)) {
      return adminForbiddenResponse(responseHeaders);
    }

    const url = new URL(req.url);
    const topicFilter = url.searchParams.get('topic') ?? undefined;
    const bloomsFilter = url.searchParams.get('bloomsLevel') ?? undefined;
    const limit = Number(url.searchParams.get('limit') ?? '100');
    const offset = Number(url.searchParams.get('offset') ?? '0');

    let questions = loadQuestionBank();

    // Filter by topic
    if (topicFilter) {
      questions = questions.filter((q) => q.topic === topicFilter);
    }

    // Filter by Bloom's level
    if (bloomsFilter) {
      if (bloomsFilter === 'unclassified') {
        questions = questions.filter((q) => !q.bloomsLevel);
      } else {
        questions = questions.filter((q) => q.bloomsLevel === bloomsFilter);
      }
    }

    // Calculate stats before pagination
    const bloomsStats = {
      remember: 0,
      understand: 0,
      apply: 0,
      analyze: 0,
      evaluate: 0,
      create: 0,
      unclassified: 0,
    };

    for (const q of questions) {
      if (q.bloomsLevel) {
        bloomsStats[q.bloomsLevel]++;
      } else {
        bloomsStats.unclassified++;
      }
    }

    const total = questions.length;
    const paged = questions.slice(offset, offset + limit);

    const response: QuestionBankListResponse = {
      questions: paged,
      total,
      bloomsStats,
    };

    return NextResponse.json(response, { status: 200, headers: responseHeaders });
  });
}

export interface QuestionBankUpdateRequest {
  questionId: string;
  bloomsLevel: BloomsLevel | null;
}

export async function PATCH(req: NextRequest) {
  if (!isServerPersistenceConfigured()) return new Response('Not found', { status: 404 });

  return withRequestOwner(req, async (principal, responseHeaders) => {
    if (!isAdminPrincipal(principal)) {
      return adminForbiddenResponse(responseHeaders);
    }

    let body: QuestionBankUpdateRequest;
    try {
      body = (await req.json()) as QuestionBankUpdateRequest;
    } catch {
      return NextResponse.json(
        { error: 'invalid_body' },
        { status: 400, headers: responseHeaders },
      );
    }

    const { questionId, bloomsLevel } = body;

    if (!questionId || typeof questionId !== 'string') {
      return NextResponse.json(
        { error: 'missing_question_id' },
        { status: 400, headers: responseHeaders },
      );
    }

    if (bloomsLevel !== null && !BLOOMS_LEVELS.includes(bloomsLevel)) {
      return NextResponse.json(
        { error: 'invalid_blooms_level', valid: BLOOMS_LEVELS },
        { status: 400, headers: responseHeaders },
      );
    }

    const questions = loadQuestionBank();
    const index = questions.findIndex((q) => q.id === questionId);

    if (index < 0) {
      return NextResponse.json(
        { error: 'question_not_found' },
        { status: 404, headers: responseHeaders },
      );
    }

    questions[index] = { ...questions[index]!, bloomsLevel };
    saveQuestionBank(questions);

    return NextResponse.json(
      { success: true, question: questions[index] },
      { status: 200, headers: responseHeaders },
    );
  });
}
