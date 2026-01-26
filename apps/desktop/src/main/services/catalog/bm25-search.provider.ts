import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type { ILogger, CatalogTool } from '@main/core/interfaces';

/**
 * BM25 search result with relevance score.
 */
export interface SearchResult {
  tool: CatalogTool;
  score: number;
  highlights: string[];
}

/**
 * BM25 configuration parameters.
 */
export interface BM25Config {
  /** Term frequency saturation parameter (default: 1.2) */
  k1: number;
  /** Document length normalization parameter (default: 0.75) */
  b: number;
}

/**
 * Search provider interface for tool discovery.
 */
export interface ISearchProvider {
  index(tools: CatalogTool[]): void;
  search(query: string, limit?: number): SearchResult[];
  reindex(): void;
  getConfig(): BM25Config;
  setConfig(config: Partial<BM25Config>): void;
}

/**
 * Document representation for BM25 indexing.
 */
interface IndexedDocument {
  tool: CatalogTool;
  terms: Map<string, number>; // term -> frequency
  length: number; // total term count
}

/**
 * BM25 Search Provider for tool catalog.
 * Implements the Okapi BM25 ranking function for full-text search.
 * 
 * BM25 Score = Σ IDF(qi) * (f(qi, D) * (k1 + 1)) / (f(qi, D) + k1 * (1 - b + b * |D|/avgdl))
 * 
 * Where:
 * - IDF(qi) = inverse document frequency of term qi
 * - f(qi, D) = term frequency of qi in document D
 * - |D| = document length
 * - avgdl = average document length
 * - k1, b = tuning parameters
 */
@injectable()
export class BM25SearchProvider implements ISearchProvider {
  private config: BM25Config = {
    k1: 1.2,  // Term frequency saturation
    b: 0.75,  // Document length normalization
  };

  private documents: IndexedDocument[] = [];
  private documentFrequency: Map<string, number> = new Map(); // term -> doc count
  private avgDocLength: number = 0;
  private totalDocs: number = 0;

  constructor(@inject(TYPES.Logger) private logger: ILogger) {}

  /**
   * Index a collection of tools for searching.
   */
  index(tools: CatalogTool[]): void {
    this.documents = [];
    this.documentFrequency.clear();
    this.totalDocs = tools.length;

    if (tools.length === 0) {
      this.avgDocLength = 0;
      return;
    }

    let totalLength = 0;

    // First pass: tokenize and count document frequencies
    for (const tool of tools) {
      const doc = this.tokenizeDocument(tool);
      this.documents.push(doc);
      totalLength += doc.length;

      // Update document frequency for each unique term
      const uniqueTerms = new Set(doc.terms.keys());
      for (const term of uniqueTerms) {
        this.documentFrequency.set(
          term,
          (this.documentFrequency.get(term) ?? 0) + 1
        );
      }
    }

    this.avgDocLength = totalLength / tools.length;

    this.logger.debug('BM25 index built', {
      documentCount: this.totalDocs,
      uniqueTerms: this.documentFrequency.size,
      avgDocLength: this.avgDocLength.toFixed(2),
    });
  }

  /**
   * Search for tools matching the query.
   */
  search(query: string, limit: number = 20): SearchResult[] {
    if (this.documents.length === 0) {
      return [];
    }

    const queryTerms = this.tokenize(query);
    if (queryTerms.length === 0) {
      return [];
    }

    const results: SearchResult[] = [];

    for (const doc of this.documents) {
      const { score, matchedTerms } = this.calculateScore(doc, queryTerms);

      if (score > 0) {
        results.push({
          tool: doc.tool,
          score,
          highlights: matchedTerms,
        });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
  }

  /**
   * Rebuild the index (call after tools change).
   */
  reindex(): void {
    const tools = this.documents.map(d => d.tool);
    this.index(tools);
  }

  /**
   * Get current BM25 configuration.
   */
  getConfig(): BM25Config {
    return { ...this.config };
  }

  /**
   * Update BM25 configuration parameters.
   */
  setConfig(config: Partial<BM25Config>): void {
    if (config.k1 !== undefined) {
      this.config.k1 = Math.max(0, config.k1);
    }
    if (config.b !== undefined) {
      this.config.b = Math.max(0, Math.min(1, config.b));
    }
  }

  /**
   * Tokenize text into normalized terms.
   */
  private tokenize(text: string): string[] {
    if (!text) return [];

    return text
      .toLowerCase()
      // Split on non-alphanumeric characters
      .split(/[^a-z0-9]+/)
      // Remove empty strings and very short terms
      .filter(term => term.length >= 2)
      // Apply stemming (simple suffix removal)
      .map(term => this.stem(term));
  }

  /**
   * Simple stemming function (Porter-like suffix removal).
   */
  private stem(word: string): string {
    // Simple suffix removal for common English suffixes
    const suffixes = ['ing', 'ed', 'es', 's', 'er', 'est', 'ly', 'tion', 'ness'];
    
    for (const suffix of suffixes) {
      if (word.length > suffix.length + 2 && word.endsWith(suffix)) {
        return word.slice(0, -suffix.length);
      }
    }
    
    return word;
  }

  /**
   * Tokenize a tool into an indexed document.
   */
  private tokenizeDocument(tool: CatalogTool): IndexedDocument {
    // Combine all searchable fields with different weights
    const nameTerms = this.tokenize(tool.name);
    const descTerms = this.tokenize(tool.description ?? '');
    const serverTerms = this.tokenize(tool.serverId);

    // Create term frequency map with field boosting
    const terms = new Map<string, number>();

    // Name terms get 3x weight
    for (const term of nameTerms) {
      terms.set(term, (terms.get(term) ?? 0) + 3);
    }

    // Description terms get 1x weight
    for (const term of descTerms) {
      terms.set(term, (terms.get(term) ?? 0) + 1);
    }

    // Server terms get 0.5x weight
    for (const term of serverTerms) {
      terms.set(term, (terms.get(term) ?? 0) + 0.5);
    }

    // Calculate effective document length
    const length = nameTerms.length * 3 + descTerms.length + serverTerms.length * 0.5;

    return {
      tool,
      terms,
      length,
    };
  }

  /**
   * Calculate BM25 score for a document against query terms.
   */
  private calculateScore(
    doc: IndexedDocument,
    queryTerms: string[]
  ): { score: number; matchedTerms: string[] } {
    let score = 0;
    const matchedTerms: string[] = [];
    const { k1, b } = this.config;

    for (const term of queryTerms) {
      const termFreq = doc.terms.get(term) ?? 0;

      if (termFreq === 0) {
        // Check for partial matches
        let partialScore = 0;
        for (const [docTerm, freq] of doc.terms) {
          if (docTerm.startsWith(term) || term.startsWith(docTerm)) {
            // Partial match gets reduced weight
            const idf = this.calculateIDF(docTerm);
            const tfNorm = this.calculateTFNorm(freq, doc.length, k1, b);
            partialScore += idf * tfNorm * 0.5;
            matchedTerms.push(docTerm);
          }
        }
        score += partialScore;
        continue;
      }

      matchedTerms.push(term);

      // Calculate IDF (Inverse Document Frequency)
      const idf = this.calculateIDF(term);

      // Calculate normalized term frequency
      const tfNorm = this.calculateTFNorm(termFreq, doc.length, k1, b);

      // BM25 score component
      score += idf * tfNorm;
    }

    return { score, matchedTerms: [...new Set(matchedTerms)] };
  }

  /**
   * Calculate Inverse Document Frequency (IDF).
   * IDF = log((N - n + 0.5) / (n + 0.5) + 1)
   */
  private calculateIDF(term: string): number {
    const docFreq = this.documentFrequency.get(term) ?? 0;
    const N = this.totalDocs;

    // Robertson-Sparck Jones IDF formula with smoothing
    return Math.log((N - docFreq + 0.5) / (docFreq + 0.5) + 1);
  }

  /**
   * Calculate normalized term frequency.
   * TF_norm = (f * (k1 + 1)) / (f + k1 * (1 - b + b * |D|/avgdl))
   */
  private calculateTFNorm(
    termFreq: number,
    docLength: number,
    k1: number,
    b: number
  ): number {
    const lengthNorm = 1 - b + b * (docLength / this.avgDocLength);
    return (termFreq * (k1 + 1)) / (termFreq + k1 * lengthNorm);
  }
}

export default BM25SearchProvider;
