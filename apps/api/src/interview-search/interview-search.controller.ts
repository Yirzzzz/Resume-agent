import { Body, Controller, Post } from '@nestjs/common';
import { CreateInterviewSearchDto } from './dto/create-interview-search.dto';
import { InterviewSearchResultDto } from './dto/interview-search-result.dto';
import { InterviewSearchService } from './interview-search.service';

@Controller('api/interview-search')
export class InterviewSearchController {
  constructor(private readonly service: InterviewSearchService) {}

  @Post('run')
  async run(
    @Body() body: CreateInterviewSearchDto,
  ): Promise<InterviewSearchResultDto> {
    return this.service.run(body);
  }
}
