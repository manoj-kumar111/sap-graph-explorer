import { NextResponse } from 'next/server';
import { buildGraph, getNodeNeighbors } from '@/lib/graph-builder';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const nodeId = searchParams.get('nodeId');

    if (nodeId) {
      const result = getNodeNeighbors(nodeId);
      return NextResponse.json(result);
    }

    const graph = buildGraph();
    return NextResponse.json(graph);
  } catch (error) {
    console.error('Graph API Error:', error);
    return NextResponse.json(
      { error: 'Failed to build graph', details: error.message },
      { status: 500 }
    );
  }
}
