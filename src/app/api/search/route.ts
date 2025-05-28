import { NextRequest, NextResponse } from 'next/server';
import { searchKnowledgeVector, hybridSearch, getRecentKnowledgeVectors, getKnowledgeVectorsByTags } from '@/lib/vector-search';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, accountId, query, tags, options } = body;

    switch (action) {
      case 'search': {
        if (!accountId || !query) {
          return NextResponse.json(
            { error: 'Missing required fields: accountId and query' },
            { status: 400 }
          );
        }

        // Use hybrid search with tag filtering
        const results = await hybridSearch(accountId, query, {
          ...options,
          tags // Pass tag filtering
        });

        return NextResponse.json({ success: true, results });
      }

      case 'recent': {
        if (!accountId) {
          return NextResponse.json(
            { error: 'Missing required field: accountId' },
            { status: 400 }
          );
        }

        const limit = options?.limit || 20;
        const results = await getRecentKnowledgeVectors(accountId, limit);
        return NextResponse.json({ success: true, results });
      }

      case 'tags': {
        if (!accountId || !tags || !Array.isArray(tags)) {
          return NextResponse.json(
            { error: 'Missing required fields: accountId and tags array' },
            { status: 400 }
          );
        }

        // Get all entries matching any of the provided tags
        const results = await hybridSearch(accountId, '', {
          matchThreshold: 0,
          matchCount: 100,
          tags
        });
        return NextResponse.json({ success: true, results });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: search, recent, or tags' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
} 