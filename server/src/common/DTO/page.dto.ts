import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';

export class PageDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  page_start?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  page_size: number = 20;
}
