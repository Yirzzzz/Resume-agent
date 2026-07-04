# Deep Interview Agent A/B Checklist

## Goal

Compare the existing basic interview flow with the Deep Interview Agent on the same resume, JD, and candidate answers.

## Candidate Scripts

1. High information answer: includes personal role, implementation detail, baseline, metric, and validation method.
2. Low information answer: uses broad descriptions such as "负责核心设计" without baseline, metric, or trade-off.
3. Contradictory answer: first claims ownership, later denies participation or changes a key metric.
4. Evidence gap answer: mentions a result but omits personal responsibility boundary or measurement method.
5. Early stop answer: covers core competencies with high information density before `maxQuestions`.

## Pass Criteria

| Area | Basic Interview | Deep Interview Agent |
| --- | --- | --- |
| Follow-up reason | May ask generic follow-ups | Must identify evidence gaps or contradiction |
| Traceability | Optional | Must link report items to turns and claims |
| Claim memory | Not required | Must update claim status across turns |
| Long-term memory | Not required | Must extract recurring weakness, improvement, trained project, or training focus |
| Anti-fabrication | Must not invent experience | Must not invent experience and must challenge unsupported claims |
| Stop condition | Can use fixed question count | Must support coverage-based or max-question stop |

## Manual Evaluation Notes

- Run both flows with the same resume file and JD.
- Keep candidate answers identical when possible.
- Mark a Deep Interview run as failed if it cannot explain why it followed up, switched topic, or ended.
- Mark a Deep Interview run as failed if long-term memory stores raw private dialogue instead of concise conclusions.
