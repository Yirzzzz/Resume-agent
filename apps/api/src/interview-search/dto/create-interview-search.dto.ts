import { SearchDepth } from '../types/interview-search.types';

export class CreateInterviewSearchDto {
  company = '';

  position = '';

  jd = '';

  resume?: string;

  searchDepth: SearchDepth = 'quick';
}
