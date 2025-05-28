import { NextRequest, NextResponse } from 'next/server';
import { searchKnowledgeVector, hybridSearch, getRecentKnowledgeVectors, getKnowledgeVectorsByCategory } from '@/lib/vector-search';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, accountId, query, categories, options } = body;

    switch (action) {
      case 'search': {
        if (!accountId || !query) {
          return NextResponse.json(
            { error: 'Missing required fields: accountId and query' },
            { status: 400 }
          );
        }

        // Use hybrid search for better results
        const results = await hybridSearch(accountId, query, options);
        
        // Filter by categories if specified
        let filteredResults = results;
        if (categories && categories.length > 0) {
          filteredResults = results.filter(result => 
            categories.includes(result.category)
          );
        }

        return NextResponse.json({ success: true, results: filteredResults });
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

      case 'category': {
        if (!accountId || !query) {
          return NextResponse.json(
            { error: 'Missing required fields: accountId and category (in query field)' },
            { status: 400 }
          );
        }

        const results = await getKnowledgeVectorsByCategory(accountId, query);
        return NextResponse.json({ success: true, results });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: search, recent, or category' },
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