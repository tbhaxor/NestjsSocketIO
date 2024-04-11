import { BadRequestException } from '@nestjs/common';
import { IsEnum, IsNumber, Max, Min } from 'class-validator';

export enum ESymbol {
  Empty = null,
  Cross = 'x',
  Circle = 'o',
}

export class MazeDto {
  @IsNumber()
  @Min(1)
  @Max(3)
  rowId: number;

  @IsNumber()
  @Min(1)
  @Max(3)
  colId: number;

  @IsEnum(ESymbol)
  symbol: ESymbol;

  constructor(rowId: number, colId: number) {
    this.colId = colId;
    this.rowId = rowId;
    this.symbol = ESymbol.Empty;
  }

  mark(symbol: ESymbol) {
    if (this.symbol != ESymbol.Empty) {
      throw new BadRequestException(['This entry is already marked. Choose another location.']);
    }
    this.symbol = symbol;
  }
}
