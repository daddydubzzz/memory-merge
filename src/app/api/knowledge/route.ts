import { NextRequest, NextResponse } from 'next/server';
import { storeWithEmbedding, updateWithEmbedding, deleteKnowledgeVector } from '@/lib/embedding';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, accountId, entry, updates, firebaseDocId, vectorId } = body;

    switch (action) {
      case 'store': {
        if (!accountId || !entry || !firebaseDocId) {
          return NextResponse.json(
            { error: 'Missing required fields: accountId, entry, and firebaseDocId' },
            { status: 400 }
          );
        }

        console.log(`🔄 API: Storing vector data for Firebase doc: ${firebaseDocId}`);
        const vectorIdResult = await storeWithEmbedding(accountId, entry, firebaseDocId);
        
        return NextResponse.json({ 
          success: true, 
          id: vectorIdResult,
          firebaseDocId: firebaseDocId,
          message: 'Vector data stored successfully (Firebase document referenced)'
        });
      }

      case 'update': {
        if (!vectorId || !updates) {
          return NextResponse.json(
            { error: 'Missing required fields: vectorId and updates' },
            { status: 400 }
          );
        }

        console.log(`🔄 API: Updating vector: ${vectorId}${firebaseDocId ? ` (Firebase doc: ${firebaseDocId})` : ''}`);
        await updateWithEmbedding(vectorId, updates, firebaseDocId);
        
        return NextResponse.json({ 
          success: true,
          message: 'Vector data updated successfully'
        });
      }

      case 'delete': {
        if (!vectorId) {
          return NextResponse.json(
            { error: 'Missing required field: vectorId' },
            { status: 400 }
          );
        }

        console.log(`🔄 API: Deleting vector: ${vectorId}`);
        await deleteKnowledgeVector(vectorId);
        
        return NextResponse.json({ 
          success: true,
          message: 'Vector data deleted successfully (Firebase document preserved)'
        });
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