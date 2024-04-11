import { Injectable, NotFoundException } from '@nestjs/common';
import { GameDto } from './dtos/game.dto';

@Injectable()
export class GameService {
  private readonly games: GameDto[] = [];

  createGame(player: string): string {
    this.games.push(new GameDto(player));
    return this.games[this.games.length - 1].uid;
  }

  getGameById(uid: string) {
    const game = this.games.find((game) => game.uid === uid);
    if (!game) {
      throw new NotFoundException(`Game ${uid} not found`);
    }
    return game;
  }

  getGames() {
    return this.games;
  }

  joinToGame(uid: string, player: string) {
    const game = this.getGameById(uid);
    if (game.players.length == 1 && !game.players.includes(player)) {
      game.players.push(player);
    }
  }
}
