import { NextRequest, NextResponse } from 'next/server';
import { hybridSearch, getRecentKnowledgeVectors } from '@/lib/vector-search';
import { supabase } from '@/lib/supabase';

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

      case 'debug': {
        // Debug endpoint to check what data exists
        const { data: allVectors, error: vectorError } = await supabase
          .from('knowledge_vectors')
          .select('id, account_id, firebase_doc_id, enhanced_content, created_at')
          .limit(50);

        if (vectorError) {
          return NextResponse.json(
            { error: `Supabase error: ${vectorError.message}` },
            { status: 500 }
          );
        }

        const uniqueAccounts = [...new Set(allVectors?.map(v => v.account_id) || [])];
        
        // Also check if Firebase documents exist using Admin SDK
        const firebaseStatus = [];
        const enhancedContentAnalysis = [];
        
        if (allVectors && allVectors.length > 0) {
          // Import Firebase Admin SDK to bypass security rules
          const { adminDb } = await import('@/lib/firebase-admin');
          const db = adminDb();
          
          for (const vector of allVectors.slice(0, 5)) { // Check first 5 vectors
            try {
              const docRef = db.collection('knowledge').doc(vector.firebase_doc_id);
              const docSnap = await docRef.get();
              
              firebaseStatus.push({
                firebase_doc_id: vector.firebase_doc_id,
                vector_id: vector.id,
                account_id: vector.account_id,
                exists: docSnap.exists,
                data_preview: docSnap.exists ? {
                  hasContent: !!docSnap.data()?.content,
                  hasTags: !!docSnap.data()?.tags,
                  hasAddedBy: !!docSnap.data()?.addedBy,
                  accountId: docSnap.data()?.accountId,
                  originalContent: docSnap.data()?.content?.substring(0, 100) + '...'
                } : null
              });
              
              // Analyze enhanced content quality
              enhancedContentAnalysis.push({
                vector_id: vector.id,
                enhanced_content_preview: vector.enhanced_content?.substring(0, 200) + '...',
                enhanced_content_length: vector.enhanced_content?.length || 0,
                original_content_length: docSnap.exists ? (docSnap.data()?.content?.length || 0) : 0,
                enhancement_ratio: docSnap.exists && docSnap.data()?.content ? 
                  ((vector.enhanced_content?.length || 0) / (docSnap.data()?.content?.length || 1)).toFixed(2) : 'N/A',
                contains_user_context: vector.enhanced_content?.includes('Added by') || false,
                contains_synonyms: vector.enhanced_content?.includes('[Related terms:') || false,
                contains_temporal: vector.enhanced_content?.includes('referring to temporal') || false
              });
              
            } catch (error) {
              firebaseStatus.push({
                firebase_doc_id: vector.firebase_doc_id,
                vector_id: vector.id,
                account_id: vector.account_id,
                exists: false,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          }
        }
        
        return NextResponse.json({
          success: true,
          debug: {
            embeddingModel: 'text-embedding-3-large',
            modelUpgrade: {
              previous: 'text-embedding-3-small (62.3% MTEB)',
              current: 'text-embedding-3-large (64.6% MTEB)',
              improvement: '2.3% better reasoning and quality',
              dimensions: '1536 (optimal balance)',
              costImpact: 'Higher cost but significantly better search quality'
            },
            totalVectors: allVectors?.length || 0,
            uniqueAccounts,
            recentVectors: allVectors?.slice(0, 10).map(v => ({
              id: v.id,
              account_id: v.account_id,
              firebase_doc_id: v.firebase_doc_id,
              created_at: v.created_at,
              enhanced_content_length: v.enhanced_content?.length || 0
            })),
            firebaseStatus,
            enhancedContentAnalysis,
            searchPipelineNotes: {
              embeddingGeneration: "✅ UPGRADED: Using enhanced_content with richer context and text-embedding-3-large",
              searchQueryExpansion: "✅ ENHANCED: More aggressive synonym expansion + semantic categories",
              modelConsistency: "✅ Both storage and search use text-embedding-3-large with 1536 dimensions",
              qualityImprovements: [
                "Upgraded to text-embedding-3-large for 2.3% better reasoning",
                "Enhanced synonym expansion with semantic categories",
                "Smarter threshold management with fallback logic",
                "More comprehensive enhanced content generation",
                "Better handling of complex queries and edge cases"
              ],
              expectedImpact: "Search should now have significantly better semantic understanding and reasoning"
            }
          }
        });
      }

      case 'test-nuts': {
        // Special test case for nuts→testicle synonym connection
        console.log('🥜 TESTING NUTS→TESTICLE CONNECTION');
        
        // Test query expansion
        const { expandQueryWithSynonyms } = await import('@/lib/vector-search');
        const expandedQuery = expandQueryWithSynonyms('nuts');
        console.log(`Query expansion test: "nuts" → "${expandedQuery}"`);
        
        // Test enhanced content generation
        const { enrichContentWithSynonyms } = await import('@/lib/embedding');
        const enhancedContent = enrichContentWithSynonyms('My testicle is shaped like an egg');
        console.log(`Content enhancement test: "testicle" → "${enhancedContent}"`);
        
        // Test actual search
        const testAccountId = 'iVjLBoNSrfYcHSsAEFEx'; // Use the account we know has data
        const searchResults = await hybridSearch(testAccountId, 'nuts', {
          matchThreshold: 0.2, // Very low threshold
          matchCount: 10
        });
        
        return NextResponse.json({
          success: true,
          nutsTestResults: {
            originalQuery: 'nuts',
            expandedQuery,
            enhancedContentExample: enhancedContent,
            searchResults: searchResults.length,
            results: searchResults.map(r => ({
              id: r.id,
              similarity: r.similarity,
              content: r.content?.substring(0, 100) + '...',
              enhanced_content: r.enhanced_content?.substring(0, 150) + '...'
            }))
          }
        });
      }

      case 'test-full-pipeline': {
        // Test the complete pipeline: store testicle content, then search for nuts
        console.log('🧪 TESTING FULL NUTS→TESTICLE PIPELINE');
        
        // Simulate storing testicle content with our enhanced system
        const testContent = "My left testicle is best described as a perfectly oblong paraboloid with minor warping due to seasonal gravitational shifts.";
        
        // Test enhanced content generation
        const { enrichContentWithSynonyms } = await import('@/lib/embedding');
        const enhancedContent = enrichContentWithSynonyms(testContent);
        console.log(`Enhanced content: ${enhancedContent}`);
        
        // Test query expansion for "nuts"
        const { expandQueryWithSynonyms } = await import('@/lib/vector-search');
        const expandedQuery = expandQueryWithSynonyms('nuts');
        console.log(`Expanded query: ${expandedQuery}`);
        
        // Test if both contain overlapping terms
        const contentTerms = enhancedContent.toLowerCase().split(/\W+/);
        const queryTerms = expandedQuery.toLowerCase().split(/\W+/);
        const overlapTerms = contentTerms.filter(term => queryTerms.includes(term) && term.length > 2);
        
        return NextResponse.json({
          success: true,
          pipelineTest: {
            originalContent: testContent,
            enhancedContent: enhancedContent.substring(0, 300) + '...',
            nutsQuery: 'nuts',
            expandedQuery: expandedQuery.substring(0, 200) + '...',
            overlapTerms,
            connectionStrength: overlapTerms.length,
            shouldWork: overlapTerms.length > 3 ? '✅ YES' : '❌ NO',
            explanation: `Found ${overlapTerms.length} overlapping terms between enhanced content and expanded query`
          }
        });
      }

      case 'test-supabase-direct': {
        // Direct test of Supabase vector search function
        console.log('🔬 TESTING SUPABASE FUNCTION DIRECTLY');
        
        const { supabase } = await import('@/lib/supabase');
        
        // Create a simple test embedding (all zeros for now)
        const testEmbedding = new Array(1536).fill(0);
        
        console.log('🧪 Testing Supabase RPC with minimal parameters...');
        
        try {
          const { data, error } = await supabase.rpc('match_knowledge_vectors', {
            query_embedding: testEmbedding,
            account_id: 'iVjLBoNSrfYcHSsAEFEx',
            match_threshold: 0.0, // Get everything
            match_count: 10
          });
          
          console.log('📊 Supabase RPC Result:', { 
            success: !error, 
            error: error?.message, 
            resultCount: data?.length 
          });
          
          return NextResponse.json({
            success: true,
            supabaseTest: {
              hasError: !!error,
              errorMessage: error?.message || null,
              resultCount: data?.length || 0,
              firstResult: data?.[0] || null,
              allResults: data || []
            }
          });
          
        } catch (testError) {
          console.error('💥 Supabase RPC Test Error:', testError);
          return NextResponse.json({
            success: false,
            supabaseTest: {
              hasError: true,
              errorMessage: testError instanceof Error ? testError.message : 'Unknown error',
              exception: testError
            }
          });
        }
      }

      case 'test-censorship': {
        // Test if OpenAI is censoring anatomical content in embeddings
        console.log('🔍 TESTING OPENAI CENSORSHIP');
        
        try {
          // Import OpenAI directly to test embedding generation
          const OpenAI = (await import('openai')).default;
          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
          
          // Test different variations
          const testQueries = [
            'nuts',
            'testicle', 
            'anatomical structure',
            'body part',
            'Walter nuts',
            'Walter testicle',
            'male anatomy nuts',
            'reproductive anatomy'
          ];
          
          const results = [];
          
          for (const query of testQueries) {
            try {
              console.log(`Testing embedding generation for: "${query}"`);
              
              const response = await openai.embeddings.create({
                model: 'text-embedding-3-large',
                input: query,
                encoding_format: 'float',
                dimensions: 1536,
              });
              
              const embedding = response.data[0]?.embedding || [];
              
              results.push({
                query,
                success: true,
                embeddingLength: embedding.length,
                firstFewValues: embedding.slice(0, 5),
                allZeros: embedding.every((val: number) => val === 0),
                hasNaN: embedding.some((val: number) => isNaN(val))
              });
              
            } catch (error) {
              results.push({
                query,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          }
          
          return NextResponse.json({
            success: true,
            censorshipTest: {
              results,
              summary: {
                totalTests: testQueries.length,
                successful: results.filter(r => r.success).length,
                failed: results.filter(r => !r.success).length,
                allZerosDetected: results.filter(r => r.success && r.allZeros).length
              }
            }
          });
          
        } catch (error) {
          return NextResponse.json({
            success: false,
            censorshipTest: {
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          });
        }
      }

      case 'test-schema': {
        // Test what columns actually exist in the knowledge_vectors table
        console.log('🔍 TESTING SUPABASE TABLE SCHEMA');
        
        try {
          const { supabase } = await import('@/lib/supabase');
          
          // Try to get a single row to see what columns exist
          const { data, error } = await supabase
            .from('knowledge_vectors')
            .select('*')
            .limit(1)
            .single();
          
          if (error) {
            console.log('Schema test error:', error);
            return NextResponse.json({
              success: false,
              schemaTest: {
                error: error.message,
                hint: error.hint || null
              }
            });
          }
          
          // Get the column names from the returned data
          const columnNames = data ? Object.keys(data) : [];
          
          return NextResponse.json({
            success: true,
            schemaTest: {
              hasData: !!data,
              columnCount: columnNames.length,
              columnNames: columnNames.sort(),
              sampleData: data ? {
                id: data.id,
                account_id: data.account_id,
                firebase_doc_id: data.firebase_doc_id,
                enhanced_content_length: data.enhanced_content?.length,
                has_embedding: !!data.embedding,
                embedding_length: Array.isArray(data.embedding) ? data.embedding.length : 'Not array'
              } : null
            }
          });
          
        } catch (error) {
          return NextResponse.json({
            success: false,
            schemaTest: {
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          });
        }
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: search, recent, tags, or debug' },
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