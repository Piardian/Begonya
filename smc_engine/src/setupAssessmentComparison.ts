import type { GradeResult } from './gradeCalculator';
import type { SetupAssessment, SetupGradeValue } from './setupAssessment';

export interface SetupAssessmentComparison {
  mode: 'shadow';
  changed: boolean;
  v1: {
    grade: GradeResult['grade'];
    score: number;
  };
  v2: {
    grade: SetupAssessment['grade']['value'];
    qualityBand: SetupAssessment['grade']['qualityBand'];
    evidenceScore: number;
  };
  reasons: string[];
}

export function compareV1GradeWithV2Assessment(
  v1: GradeResult,
  v2: SetupAssessment
): SetupAssessmentComparison {
  const normalizedV1 = normalizeV1Grade(v1.grade);
  const v2Grade = v2.grade.value;
  const reasons = [
    ...v2.decision.rejectReasons,
    ...v2.decision.gradeCaps,
    ...v2.decision.penalties,
    ...v2.explainability.weakenedBy,
  ];

  return {
    mode: 'shadow',
    changed: normalizedV1 !== v2Grade,
    v1: {
      grade: v1.grade,
      score: v1.totalScore,
    },
    v2: {
      grade: v2Grade,
      qualityBand: v2.grade.qualityBand,
      evidenceScore: v2.explainability.evidenceScore,
    },
    reasons: Array.from(new Set(reasons)),
  };
}

function normalizeV1Grade(grade: GradeResult['grade']): SetupGradeValue {
  if (grade === 'C') return 'Reject';
  return grade;
}

