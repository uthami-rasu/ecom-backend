import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Length, Max, Min } from 'class-validator';
import { SanitizeText } from '../../../common/utils/transforms.js';

export class CreateReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({ example: 'A great small-batch honey' })
  @SanitizeText()
  @IsString()
  @Length(3, 120)
  title: string;

  @ApiProperty({ example: 'Smooth, balanced and not overwhelmingly sweet.' })
  @SanitizeText()
  @IsString()
  @Length(10, 2000)
  content: string;
}
