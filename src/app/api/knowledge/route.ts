import { NextRequest, NextResponse } from 'next/server';
import { storeWithEmbedding, updateWithEmbedding, deleteKnowledgeVector } from '@/lib/embedding';
import type { KnowledgeEntry } from '@/lib/constants';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, accountId, entry, id, updates } = body;

    switch (action) {
      case 'store': {
        if (!accountId || !entry) {
          return NextResponse.json(
            { error: 'Missing required fields: accountId and entry' },
            { status: 400 }
          );
        }

        const vectorId = await storeWithEmbedding(accountId, entry);
        return NextResponse.json({ success: true, id: vectorId });
      }

      case 'update': {
        if (!id || !updates) {
          return NextResponse.json(
            { error: 'Missing required fields: id and updates' },
            { status: 400 }
          );
        }

        await updateWithEmbedding(id, updates);
        return NextResponse.json({ success: true });
      }

      case 'delete': {
        if (!id) {
          return NextResponse.json(
            { error: 'Missing required field: id' },
            { status: 400 }
          );
        }

        await deleteKnowledgeVector(id);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: store, update, or delete' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Knowledge API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
} 