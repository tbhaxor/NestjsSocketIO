import { Test, TestingModule } from '@nestjs/testing';
import { GameService } from './game.service';
import { faker } from '@faker-js/faker';
import { NotFoundException } from '@nestjs/common';
import { GameDto } from './dtos/game.dto';
import { ESymbol } from './dtos/maze.dto';

describe('GameService', () => {
  let service: GameService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GameService],
    }).compile();

    service = module.get<GameService>(GameService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have 0 length of games on instantiate', () => {
    expect(service.getGames()).toHaveLength(0);
  });

  it('should have appropriate lenth for n games', () => {
    const nGames = faker.number.int({ min: 5, max: 10 });
    for (let i = 0; i < nGames; ++i) {
      service.createGame(faker.lorem.slug());
    }
    expect(service.getGames()).toHaveLength(nGames);
  });

  it('should throw NotFoundException for invalid gameId', () => {
    expect(() => service.getGameById(faker.lorem.slug())).toThrow(NotFoundException);
  });

  it('should return GameDto on valid gameId', () => {
    const gameId = service.createGame(faker.lorem.slug());
    expect(service.getGameById(gameId)).toBeInstanceOf(GameDto);
  });

  it('should populate the GameDto appropriately', () => {
    const playerId = faker.lorem.slug();
    const gameId = service.createGame(playerId);
    const game = service.getGameById(gameId);

    expect(game.uid).toBe(gameId);
    expect(game.isDraw).toBe(false);
    expect(game.isEnded).toBe(false);
    expect(game.winner).toBeNull();
    expect(game.players).toHaveLength(1);
    expect(game.players[0]).toBe(playerId);
    expect(game.currentPlayer).toBe(playerId);
    expect(game.currentSymbol).toBe(ESymbol.Cross);
    expect(game.maze).toBeInstanceOf(Array);
    expect(game.maze).toHaveLength(9);
    for (const el of game.maze) {
      expect(el.symbol).toBe(ESymbol.Empty);
    }
  });

  it('should add another player on join', () => {
    const playerAId = faker.lorem.slug();
    const playerBId = faker.lorem.slug();
    const gameId = service.createGame(playerAId);
    service.joinToGame(gameId, playerBId);
    expect(service.getGameById(gameId).players).toHaveLength(2);
    expect(service.getGameById(gameId).players).toEqual([playerAId, playerBId]);
  });
});
