import { Injectable } from '@nestjs/common';
import { SearchQuery, SearchResult } from './types/interview-search.types';

@Injectable()
export class WebSearchService {
  getProviderName(): 'tavily' | 'mock' {
    return process.env.TAVILY_API_KEY?.trim() ? 'tavily' : 'mock';
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const tavilyKey = process.env.TAVILY_API_KEY?.trim();
    if (!tavilyKey) return this.mockSearch(query);
    try {
      const resp = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: tavilyKey,
          query: query.query,
          search_depth: 'advanced',
          max_results: 5,
          include_answer: false,
          include_raw_content: false,
          include_domains: this.includeDomains(query.platform),
        }),
      });
      if (!resp.ok) {
        const err = await resp.text().catch(() => '');
        console.warn(
          `[interview-search] Tavily search failed (${resp.status}) for query="${query.query}": ${err.slice(
            0,
            180,
          )}`,
        );
        return [];
      }
      const data = (await resp.json()) as {
        results?: Array<{ title?: string; url?: string; content?: string }>;
      };
      const rows = Array.isArray(data.results) ? data.results : [];
      return this.uniqueByUrl(
        rows
          .map((row, idx) => {
            const url = String(row.url ?? '').trim();
            if (!url || this.isJunkUrl(url)) return null;
            return {
              title: String(row.title ?? 'Untitled').trim(),
              url,
              snippet: String(row.content ?? '').trim().slice(0, 220),
              query: query.query,
              sourceDomain: this.domainOf(url),
              rank: idx + 1,
            } satisfies SearchResult;
          })
          .filter((x): x is SearchResult => Boolean(x)),
      ).slice(0, 5);
    } catch (e) {
      console.warn(
        `[interview-search] Tavily search exception for query="${query.query}": ${
          e instanceof Error ? e.message : 'unknown'
        }`,
      );
      return [];
    }
  }

  private mockSearch(query: SearchQuery): SearchResult[] {
    const base = encodeURIComponent(query.query.slice(0, 60));
    const urls = [
      `https://example.com/mock-interview/${base}/1`,
      `https://example.com/mock-interview/${base}/2`,
      `https://example.com/mock-interview/${base}/3`,
    ];
    return urls.map((url, idx) => ({
      title: `Mock 面经结果 ${idx + 1}`,
      url,
      snippet: `Mock snippet for ${query.query}`,
      query: query.query,
      sourceDomain: 'example.com',
      rank: idx + 1,
    }));
  }

  private uniqueByUrl(list: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    const out: SearchResult[] = [];
    for (const item of list) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      out.push(item);
    }
    return out;
  }

  private domainOf(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return 'unknown';
    }
  }

  private isJunkUrl(url: string): boolean {
    const u = url.toLowerCase();
    return (
      u.includes('utm_') ||
      u.includes('/ads') ||
      u.includes('doubleclick') ||
      u.includes('googleadservices')
    );
  }

  private includeDomains(platform?: SearchQuery['platform']): string[] | undefined {
    if (!platform || platform === 'general') return undefined;
    if (platform === 'nowcoder') return ['nowcoder.com'];
    if (platform === 'zhihu') return ['zhihu.com'];
    if (platform === 'xiaohongshu') return ['xiaohongshu.com'];
    if (platform === 'csdn') return ['csdn.net'];
    if (platform === 'github') return ['github.com'];
    if (platform === 'blog') return ['juejin.cn', 'cnblogs.com', 'medium.com'];
    return undefined;
  }
}
