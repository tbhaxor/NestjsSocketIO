import { Transform } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString, Max, Min } from 'class-validator';

export class GameMazeDto {
  @IsNumber()
  @Min(1)
  @Transform((p) => parseInt(p.value))
  @Max(3)
  rowId: number;

  @IsNumber()
  @Min(1)
  @Max(3)
  @Transform((p) => parseInt(p.value))
  colId: number;

  @IsString()
  @IsNotEmpty()
  gameId: string;
}
