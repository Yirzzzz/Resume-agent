import { Injectable } from '@nestjs/common';
import {
  ExtractedQuestion,
  QuestionCluster,
} from './types/interview-search.types';

@Injectable()
export class DedupClusterService {
  normalizeQuestion(question: string): string {
    return question
      .toLowerCase()
      .replace(/[，。！？?、,.!;；:："'`~()\[\]{}<>]/g, '')
      .replace(/(讲一下|说一下|介绍一下|请解释)/g, '')
      .trim();
  }

  dedupAndCluster(items: ExtractedQuestion[]): {
    deduped: ExtractedQuestion[];
    clusters: QuestionCluster[];
  } {
    const grouped = new Map<string, ExtractedQuestion[]>();
    for (const item of items) {
      const key = this.normalizeQuestion(item.question);
      const row = { ...item, normalizedQuestion: key };
      const prev = grouped.get(key) ?? [];
      prev.push(row);
      grouped.set(key, prev);
    }

    const clusters: QuestionCluster[] = [];
    const deduped: ExtractedQuestion[] = [];
    let idx = 1;
    for (const [key, rows] of grouped) {
      const representative = rows[0];
      deduped.push(representative);
      clusters.push({
        id: `cluster-${idx++}`,
        representativeQuestion: representative.question,
        questions: rows,
        topic: representative.topic || '通用',
        frequency: rows.length,
        sourceUrls: [...new Set(rows.map((x) => x.sourceUrl))],
      });
      if (!key) continue;
    }

    return { deduped, clusters };
  }
}
