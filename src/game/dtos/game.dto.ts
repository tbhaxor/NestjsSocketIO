import { IsArray, IsNotEmpty, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ESymbol, MazeDto } from './maze.dto';

const winningPositions = [
  // Rows
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
  // Columns
  [1, 4, 7],
  [2, 5, 8],
  [3, 6, 9],
  // Diagonals
  [1, 5, 9],
  [3, 5, 7],
];

export class GameDto {
  @IsString()
  @IsNotEmpty()
  uid: string;

  @IsArray()
  @IsNotEmpty({ each: true })
  @IsString({ each: true })
  @MinLength(1)
  @MaxLength(2)
  players: string[] = [];

  @IsString()
  @IsNotEmpty()
  currentPlayer: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MazeDto)
  maze: MazeDto[] = [];

  constructor(player: string) {
    this.uid = Math.random().toString(36).slice(2);
    this.currentPlayer = player;
    this.players.push(player);

    for (let i = 1; i <= 3; i++) {
      for (let j = 1; j <= 3; j++) {
        this.maze.push(new MazeDto(i, j));
      }
    }
  }

  switchTurn() {
    if (this.currentPlayer == this.players[0]) {
      this.currentPlayer = this.players[1];
    } else {
      this.currentPlayer = this.players[0];
    }
  }

  get currentSymbol(): ESymbol {
    return (this.currentPlayer == this.players[0] && ESymbol.Cross) || ESymbol.Circle;
  }

  get isDraw(): boolean {
    return this.maze.every((entry) => entry.symbol != ESymbol.Empty) && this.winner != null;
  }

  get winner(): string | null {
    for (const positions of winningPositions) {
      const symbols = positions.map((p) => this.maze[p - 1].symbol);
      if (symbols.every((sym) => sym === ESymbol.Cross)) {
        return this.players[0];
      }
      if (symbols.every((sym) => sym === ESymbol.Circle)) {
        return this.players[1];
      }

      return null;
    }
  }

  get isEnded() {
    return this.isDraw || this.winner != null;
  }
}
