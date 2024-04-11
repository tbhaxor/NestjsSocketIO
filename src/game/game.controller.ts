import { Controller, Get, Param } from '@nestjs/common';
import { GameService } from './game.service';

@Controller('games')
export class GameController {
  constructor(private gameService: GameService) {}

  @Get()
  getAllGames() {
    return this.gameService.getGames();
  }

  @Get(':gameId')
  getGame(@Param('gameId') gameId: string) {
    return this.gameService.getGameById(gameId);
  }
}
