import { Injectable } from '@nestjs/common';
import type {
  InterviewAgentSessionDoc,
  InterviewClaim,
  InterviewTurn,
  JudgeResult,
  ResumeAnalysis,
} from '../types/interview-agent.types';

@Injectable()
export class SessionMemoryService {
  seedResumeClaims(session: InterviewAgentSessionDoc) {
    const claims = session.resumeAnalysis?.claimsToVerify ?? [];
    for (const claim of claims) {
      if (session.memory.claims.some((item) => item.id === claim.id)) continue;
      const project = session.resumeAnalysis?.projects.find(
        (item) => item.id === claim.projectId,
      );
      session.memory.claims.push({
        id: claim.id,
        content: claim.content,
        status: 'UNVERIFIED',
        sourceTurnIds: [],
        relatedProjectId: claim.projectId,
        relatedCompetencyIds: this.relatedCompetencyIds(session, project),
        importance: claim.importance,
      });
    }
  }

  updateClaimsAfterJudge(
    session: InterviewAgentSessionDoc,
    turn: InterviewTurn,
    judge: JudgeResult,
  ) {
    const gapIds = new Set(judge.evidenceGaps.map((gap) => gap.claimId));
    const contradictionIds = new Set(
      judge.contradictions.map((item) => item.claimId),
    );

    for (const claimId of turn.extractedClaimIds) {
      const claim = session.memory.claims.find((item) => item.id === claimId);
      if (!claim) continue;
      if (!claim.sourceTurnIds.includes(turn.turnId)) {
        claim.sourceTurnIds.push(turn.turnId);
      }

      if (contradictionIds.has(claim.id)) {
        claim.status = 'CONTRADICTED';
      } else if (!gapIds.has(claim.id) && this.hasStrongEvidence(judge)) {
        claim.status = 'VERIFIED';
      } else if (judge.informationGain !== 'low') {
        claim.status =
          claim.status === 'VERIFIED' ? 'VERIFIED' : 'PARTIALLY_VERIFIED';
      }
    }

    for (const gap of judge.evidenceGaps) {
      this.openIssue(session, turn, gap.claimId, gap.missing);
    }

    for (const claim of session.memory.claims) {
      if (claim.status !== 'VERIFIED') continue;
      for (const issue of session.memory.unresolvedIssues) {
        if (issue.relatedClaimId === claim.id && !issue.resolvedAtTurnId) {
          issue.resolvedAtTurnId = turn.turnId;
        }
      }
    }
  }

  private relatedCompetencyIds(
    session: InterviewAgentSessionDoc,
    project: ResumeAnalysis['projects'][number] | undefined,
  ): string[] {
    if (!project) return [];
    const text = `${project.name} ${project.techStack.join(' ')}`.toLowerCase();
    return (
      session.jdMatrix?.competencies
        .filter((competency) =>
          [competency.name, ...competency.evidenceKeywords].some((keyword) =>
            text.includes(keyword.toLowerCase()),
          ),
        )
        .map((competency) => competency.id) ?? []
    );
  }

  private hasStrongEvidence(judge: JudgeResult): boolean {
    return (
      judge.scores.evidenceSufficiency >= 4 &&
      judge.scores.implementationDetail >= 4 &&
      judge.informationGain !== 'low'
    );
  }

  private openIssue(
    session: InterviewAgentSessionDoc,
    turn: InterviewTurn,
    claimId: string,
    missing: string,
  ) {
    const existing = session.memory.unresolvedIssues.find(
      (issue) =>
        issue.relatedClaimId === claimId &&
        issue.description === missing &&
        !issue.resolvedAtTurnId,
    );
    if (existing) return;
    session.memory.unresolvedIssues.push({
      id: `issue_${Math.random().toString(36).slice(2, 10)}`,
      kind: 'missing_evidence',
      description: missing,
      relatedClaimId: claimId,
      openedAtTurnId: turn.turnId,
    });
  }
}
