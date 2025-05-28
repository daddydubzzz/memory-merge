import { NextRequest, NextResponse } from 'next/server';
import { processUserInput, generateResponse } from '@/lib/openai';

export async function POST(request: NextRequest) {
  try {
    const { action, input, searchResults } = await request.json();

    if (!input) {
      return NextResponse.json(
        { error: 'Input is required' },
        { status: 400 }
      );
    }

    if (action === 'process') {
      // Process user input to determine intent and categorization
      const result = await processUserInput(input);
      return NextResponse.json(result);
    } else if (action === 'generate') {
      // Generate response based on search results
      const response = await generateResponse(input, searchResults || []);
      return NextResponse.json(response);
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "process" or "generate"' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error processing AI request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
} 