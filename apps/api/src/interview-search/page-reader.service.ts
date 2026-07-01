import { Injectable } from '@nestjs/common';
import { ReadPage, SearchResult } from './types/interview-search.types';

@Injectable()
export class PageReaderService {
  async read(result: SearchResult): Promise<ReadPage> {
    try {
      if (result.url.includes('example.com/mock-interview')) {
        const mock = this.mockContent(result.query);
        return {
          url: result.url,
          title: result.title,
          content: mock,
          sourceDomain: result.sourceDomain,
          readable: true,
          contentLength: mock.length,
        };
      }

      const jinaEnabled = String(process.env.JINA_READER_ENABLED ?? '').toLowerCase() === 'true';
      const readUrl = jinaEnabled ? this.toJinaUrl(result.url) : result.url;
      const resp = await fetch(readUrl, {
        headers: jinaEnabled ? {} : { 'User-Agent': 'resume-agent/1.0' },
      });
      if (!resp.ok) {
        return this.failPage(result, '');
      }
      const raw = await resp.text();
      const content = this.normalizeContent(raw).slice(0, 12000);
      if (content.length < 120) return this.failPage(result, content);
      return {
        url: result.url,
        title: result.title,
        content,
        sourceDomain: result.sourceDomain,
        readable: true,
        contentLength: content.length,
      };
    } catch {
      return this.failPage(result, '');
    }
  }

  private toJinaUrl(url: string): string {
    const pure = url.replace(/^https?:\/\//, '');
    return `https://r.jina.ai/http://${pure}`;
  }

  private normalizeContent(input: string): string {
    return input
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private failPage(result: SearchResult, content: string): ReadPage {
    return {
      url: result.url,
      title: result.title,
      content,
      sourceDomain: result.sourceDomain,
      readable: false,
      contentLength: content.length,
    };
  }

  private mockContent(query: string): string {
    return [
      `面经记录：面试官问了项目中如何做数据清洗与去重。`,
      `问题：Tokenizer 如何评估词表质量？`,
      `问题：为什么选择 Python/Spark 做大规模语料处理？`,
      `问题：介绍一个你做过的项目，并说明优化指标。`,
      `来源关键词：${query}`,
    ].join('\n');
  }
}
