import { Module } from '@nestjs/common';
import { CoverageReviewerService } from './coverage-reviewer.service';
import { DeepInterviewComposerService } from './deep-interview-composer.service';
import { DedupClusterService } from './dedup-cluster.service';
import { InterviewSearchController } from './interview-search.controller';
import { InterviewSearchService } from './interview-search.service';
import { JdParserService } from './jd-parser.service';
import { PageReaderService } from './page-reader.service';
import { QueryRefinerService } from './query-refiner.service';
import { QuestionExtractorService } from './question-extractor.service';
import { RankerService } from './ranker.service';
import { ReportGeneratorService } from './report-generator.service';
import { SearchPlannerService } from './search-planner.service';
import { WebSearchService } from './web-search.service';

@Module({
  controllers: [InterviewSearchController],
  providers: [
    InterviewSearchService,
    JdParserService,
    SearchPlannerService,
    WebSearchService,
    PageReaderService,
    QuestionExtractorService,
    CoverageReviewerService,
    DeepInterviewComposerService,
    QueryRefinerService,
    DedupClusterService,
    RankerService,
    ReportGeneratorService,
  ],
})
export class InterviewSearchModule {}
