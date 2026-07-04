import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionStoreService } from './session-store.service';
import type { SanitizedResume } from '../types/interview-agent.types';

describe('SessionStoreService', () => {
  const originalCwd = process.cwd();
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'resume-agent-store-'));
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates and reads a session document from data/interview-agent/sessions', () => {
    const store = new SessionStoreService();
    const resume: SanitizedResume = {
      basics: { summary: 'backend engineer' },
      customSections: [],
    };

    const created = store.create(
      {
        resumeFileId: 'rf_1',
        company: 'Acme',
        position: 'Backend Engineer',
        jobDescription: 'Build APIs',
        interviewRound: 'tech_first',
        mode: 'realistic',
        maxQuestions: 8,
      },
      resume,
    );
    created.status = 'READY';
    store.save(created);

    const loaded = store.get(created.sessionId);
    expect(loaded.status).toBe('READY');
    expect(loaded.resumeSnapshot.basics.summary).toBe('backend engineer');

    const raw = readFileSync(
      join(
        dir,
        'data',
        'interview-agent',
        'sessions',
        `${created.sessionId}.json`,
      ),
      'utf-8',
    );
    expect(JSON.parse(raw).version).toBe(1);
  });
});
